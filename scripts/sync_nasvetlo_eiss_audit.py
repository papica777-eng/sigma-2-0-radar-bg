#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NAsvetlo — Statistical Audit of EISS Random Case Assignment (ecase.justice.bg)

Crawls the full public EPEP/EISS registry across all Bulgarian courts for given years,
computes descriptive workload uniformity metrics (Gini, chi-square) per court/department/kind,
runs party-to-judge concentration tests controlling for actual judge workload with
Benjamini-Hochberg FDR correction, detects within-department case-kind specialization,
and cross-links legal entities against NAsvetlo procurement registries (companies & authorities).

Zero PII / GDPR compliant: natural persons are strictly excluded from all outputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import ssl
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
_DEFAULT_WIN_CACHE = Path(
    r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api\judicial_cache\eiss_universe"
)
if os.environ.get("EISS_CACHE_DIR"):
    CACHE_DIR = Path(os.environ["EISS_CACHE_DIR"])
elif _DEFAULT_WIN_CACHE.exists():
    CACHE_DIR = _DEFAULT_WIN_CACHE
else:
    CACHE_DIR = REPO_ROOT / ".cache_eiss_universe"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

OUT_JSON = DATA_DIR / "nasvetlo_eiss_audit.json"

ECASE_URL = "https://ecase.justice.bg/Case/LoadData"
ECASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SIGMA-3.0-FINALITY/3.0",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.7",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Legal entity & public institution filter (excludes natural persons strictly)
LEGAL_ENTITY_RE = re.compile(
    r"(?:ООД|ЕООД|ЕАД|ДЗЗД|АДСИЦ|ОБЩИНА|АГЕНЦИЯ|МИНИСТЕРСТВО|ДИРЕКЦИЯ|ПРОКУРАТУРА|"
    r"ОБЛАСТН|БАНКА|ЗАСТРАХОВА|УНИВЕРСИТЕТ|БОЛНИЦА|УМБАЛ|МБАЛ|КОМИСИЯ|СЪВЕТ|ФОНД|"
    r"СДРУЖЕНИЕ|ФОНДАЦИЯ|КООПЕРАЦИЯ)|"
    r"(?<![А-ЯЁA-Z0-9])(?:АД|ЕТ|ДП|КД|СД|НАП|НОИ|НЗОК|ДФЗ|ОДМВР|МВР|СДВР)(?![А-ЯЁA-Z0-9])",
    re.I,
)

EGN_RE = re.compile(r"\b\d{10}\b")

# Level 3: Law firms & explicitly named bar attorneys / legal counsels in EISS case sides
LAW_FIRM_SIDE_RE = re.compile(
    r"(?:АДВОКАТСКО\s+ДРУЖЕСТВО|АДВ\.\s*Д-ВО)\s*[„\"«']?([А-ЯЁA-Z0-9][А-ЯЁA-Z0-9\s,\.\-&]{2,60})",
    re.I,
)
NAMED_ATTORNEY_RE = re.compile(
    r"(?:ЧРЕЗ\s+(?:ПЪЛН(?:ОМОЩНИК)?\.?\s*)?)?(АДВ\.|АДВОКАТ|ЮРК\.|ЮРИСКОНСУЛТ)\s+"
    r"([А-ЯЁ][а-яёА-ЯЁ\-]{2,24}(?:\s+[А-ЯЁ][а-яёА-ЯЁ\-]{2,24}){1,2})",
    re.I,
)
ATTORNEY_STOP_RE = re.compile(
    r"\b(?:ДРУЖЕСТВО|КОЛЕГИЯ|СЪВЕТ|КАНТОРА|СОФИЯ|БУРГАС|ВАРНА|ПЛОВДИВ|ЧРЕЗ|ОТ|ПО|ЗА|СЪС|ПРИ|ВЪВ|НА|ИЛИ|ГР)\b",
    re.I,
)


def extract_legal_representatives(side_left: str, side_right: str) -> list[tuple[str, str]]:
    """Extracts deduplicated (rep_display, rep_type) pairs for law firms and bar attorneys in EISS sides."""
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for raw_side in (side_left or "", side_right or ""):
        if not raw_side or ("адв" not in raw_side.lower() and "юрк" not in raw_side.lower() and "юрисконсулт" not in raw_side.lower()):
            continue
        cleaned_side = EGN_RE.sub("", raw_side)
        for m in LAW_FIRM_SIDE_RE.finditer(cleaned_side):
            fname = re.sub(r"[\"'„“«»()\[\];]+", " ", m.group(1)).strip(" ,.-")
            fname = re.sub(r"\s+", " ", fname).upper()
            if len(fname) >= 4:
                key = f"АДВОКАТСКО ДРУЖЕСТВО {fname}"
                if key not in seen:
                    seen.add(key)
                    out.append((key, "law_firm"))
        for m in NAMED_ATTORNEY_RE.finditer(cleaned_side):
            role_raw = m.group(1).upper()
            name_raw = re.sub(r"\s+", " ", m.group(2)).strip(" ,.-").upper()
            tokens = [t for t in name_raw.split(" ") if len(t) >= 2 and not ATTORNEY_STOP_RE.fullmatch(t)]
            if len(tokens) < 2:
                continue
            prefix = "АДВ." if role_raw.startswith("АДВ") else "ЮРК."
            rep_type = "attorney" if prefix == "АДВ." else "in_house_counsel"
            key = f"{prefix} {' '.join(tokens[:3])}"
            if key not in seen:
                seen.add(key)
                out.append((key, rep_type))
    return out

LEGAL_FORM_RE = re.compile(
    r"\b(еоод|оод|еад|ад|сд|кд|кда|ет|дззд|консорциум|обединение|сдружение|фондация|кооперация|дп|оп|гп)\b",
    re.I,
)

DISCLAIMER_BG = (
    "Червената лампа означава статистически малко вероятно разпределение (FDR q<0,01) "
    "спрямо реалната натовареност на съдиите в същия съд, отделение и вид дело. "
    "Всеки флаг е класифициран по Ниво 1 (законни/структурни обяснения по ЗСРС, НПК, специализация и пакетно подаване) "
    "и Ниво 2 (времева дисперсия по дни/месеци, ограничен достъп и стойност по ЗОП). "
    "Това е основание за проверка от ИВСС/ВСС, а не доказателство за нарушение."
)

# Level 1: Statutory & Structural Explanation Patterns
ZSRS_LAW_ENFORCEMENT_RE = re.compile(
    r"(?:МВР|ОДМВР|ОД\s*МВР|СДВР|ГДБОП|ГДГП|ГДНП|ГРАНИЧНА\s+ПОЛИЦ|ДАНС|"
    r"ДЪРЖАВНА\s+АГЕНЦИЯ\s+НАЦИОНАЛНА\s+СИГУРНОСТ|"
    r"ТЕРИТОРИАЛНА\s+ДИРЕКЦИЯ\s+НАЦИОНАЛНА\s+СИГУРНОСТ|ТДНС|"
    r"СТОЛИЧНА\s+ДИРЕКЦИЯ\s+НА\s+ВЪТРЕШНИТЕ\s+РАБОТИ|"
    r"ОБЛАСТНА\s+ДИРЕКЦИЯ\s+НА\s+ВЪТРЕШНИТЕ\s+РАБОТИ|"
    r"МИНИСТЕРСТВО\s+НА\s+ВЪТРЕШНИТЕ\s+РАБОТИ|"
    r"ГЛАВНА\s+ДИРЕКЦИЯ\s+НАЦИОНАЛНА\s+ПОЛИЦИЯ|"
    r"ГЛАВНА\s+ДИРЕКЦИЯ\s+БОРБА\s+С\s+ОРГАНИЗИРАНАТА\s+ПРЕСТЪПНОСТ|"
    r"ВЪТРЕШНА\s+СИГУРНОСТ|ПРОКУРАТУР|СЛЕДСТВЕН|РАЗСЛЕДВАЩ|"
    r"ПОЛИЦЕЙСК|(?<![А-ЯЁ])РУ\b|ОПП\s*СДВР|СДВР\s*ОПП|СЕКТОР\s+ПП)",
    re.I,
)

PUBLIC_SPECIALIZED_RE = re.compile(
    r"(?:ТД\s+(?:НА\s+)?НАП|ЦУ\s+(?:НА\s+)?НАП|ДОДОП|НАЦИОНАЛНА\s+АГЕНЦИЯ\s+ПО\s+ПРИХОДИТЕ|"
    r"ПУБЛИЧЕН\s+ИЗПЪЛНИТЕЛ|ДИРЕКЦИЯ\s+ОДОП|ОБЖАЛВАНЕ\s+И\s+ДАНЪЧНО|"
    r"ОРГАНИ\s+ПО\s+ПРИХОДИТЕ|АГЕНЦИЯ\s+ЗА\s+БЕЖАНЦИТЕ|"
    r"ТЕРИТОРИАЛНО\s+ПОДЕЛЕНИЕ\s+НА\s+НОИ|\bНОИ\b|СОЦИАЛНО\s+ПОДПОМАГАНЕ|"
    r"КОМИСИЯ\s+ЗА\s+ОТНЕМАНЕ\s+НА\s+НЕЗАКОННО|КОНПИ|КПКОНПИ|"
    r"МИНИСТЕРСТВО\s+НА\s+ПРАВОСЪДИЕТО|МЕЖДУНАРОДНО\s+ПРАВНО\s+СЪТРУДНИЧЕСТВО|"
    r"ПОЖАРНА\s+БЕЗОПАСНОСТ|АГЕНЦИЯ\s+МИТНИЦИ|ТД\s+МИТНИЦА|"
    r"ПОЛ\.\s*ОРГАН|ПОЛИЦЕЙСКИ\s+ИНСПЕКТОР|РАЗСЛЕДВАЩ\s+ПОЛИЦАЙ|"
    r"ОДМВР|ОД\s+НА\s+МВР|СДВР|ДАНС|ДЪРЖАВНА\s+АГЕНЦИЯ\s+НАЦИОНАЛНА\s+СИГУРНОСТ|"
    r"ТЕРИТОРИАЛНА\s+ДИРЕКЦИЯ\s+НАЦИОНАЛНА\s+СИГУРНОСТ|ПРОКУРАТУР)",
    re.I,
)

MASS_CREDITOR_RE = re.compile(
    r"(?:БАНКА|БАНК\b|КРЕДИТ|АГЕНЦИЯ\s+ЗА\s+СЪБИРАНЕ|АГЕНЦИЯ\s+ЗА\s+КОНТРОЛ\s+НА\s+ПРОСРОЧЕНИ|"
    r"ЕОС\s+МАТРИКС|ФРОНТЕКС|А1\s+БЪЛГАРИЯ|ЙЕТТЕЛ|ВИВАКОМ|БТК\b|"
    r"ТОПЛОФИКАЦИЯ|ВОДОСНАБДЯВАНЕ|ВИК\b|СОФИЙСКА\s+ВОДА|ЕЛЕКТРОХОЛД|ЕВН\b|ЕНЕРГО-ПРО)",
    re.I,
)

TIER_META = {
    "UNEXPLAINED_PRIORITY": {
        "label": "Необяснено · Приоритет ИВСС",
        "short": "Необяснено",
        "rank": 1,
    },
    "MASS_CREDITOR_SUMMARY": {
        "label": "Масов ищец · Заповедни / Комунални",
        "short": "Масов ищец",
        "rank": 2,
    },
    "BATCH_FILING_ARTIFACT": {
        "label": "Пакетно завеждане (1–2 дни)",
        "short": "Пакетно (1–2 д.)",
        "rank": 3,
    },
    "STATUTORY_PUBLIC_SPECIALIZED": {
        "label": "Публичен орган · Вероятна специализация",
        "short": "Специализация",
        "rank": 4,
    },
    "STATUTORY_ZSRS_DUTY": {
        "label": "Законово обяснимо · ЗСРС / чл. 159а НПК / Дежурен",
        "short": "ЗСРС / Дежурен",
        "rank": 5,
    },
}


def classify_flag_level1(
    case_kind: str,
    party: str,
    distinct_days: int,
    max_day_share: float,
    restricted_share: float,
) -> tuple[str, str, str]:
    """Level 1 statutory & structural explanation classifier."""
    kind_l = (case_kind or "").lower()
    p_str = party or ""

    # Tier 5: Statutory ZSRS / Art. 159a NPK / Duty judge on criminal private cases (ЧНД/ВЧНД)
    if "частно наказателно" in kind_l and ZSRS_LAW_ENFORCEMENT_RE.search(p_str):
        basis = (
            "Законово/организационно обяснимо: чл. 15 ЗСРС (разрешения от председател/зам.-председател), "
            "чл. 159а НПК / чл. 251г ЗЕС (трафични данни) или график за дежурен съдия по ЧНД."
        )
        if restricted_share >= 0.5:
            basis += f" ({round(restricted_share * 100)}% с ограничен достъп в ЕИСС.)"
        return "STATUTORY_ZSRS_DUTY", TIER_META["STATUTORY_ZSRS_DUTY"]["label"], basis

    # Tier 3: Single/two-day batch filing artifact (before unexplained so burst filings are separated)
    if distinct_days > 0 and (distinct_days <= 2 or max_day_share >= 0.70):
        basis = (
            f"Пакетно завеждане: делата са образувани в едва {distinct_days} календарни дни "
            f"(до {round(max_day_share * 100)}% в един ден) — вероятен ефект от дежурство или групово входиране."
        )
        return "BATCH_FILING_ARTIFACT", TIER_META["BATCH_FILING_ARTIFACT"]["label"], basis

    # Tier 4: Public/administrative agencies with known panel specialization
    if PUBLIC_SPECIALIZED_RE.search(p_str):
        basis = (
            "Публичен орган по ДОПК, ЗУБ, КСО, ЗАНН или международна правна помощ — "
            "възможна вътрешна специализация на състави (подлежи на сверка с вътрешните правила на съда)."
        )
        return "STATUTORY_PUBLIC_SPECIALIZED", TIER_META["STATUTORY_PUBLIC_SPECIALIZED"]["label"], basis

    # Tier 2: Mass creditors / utilities in summary private civil orders (чл. 410 / чл. 417 ГПК)
    if "частно гражданско" in kind_l and MASS_CREDITOR_RE.search(p_str):
        basis = (
            "Масов кредитор или комунален доставчик в заповедни производства (чл. 410/417 ГПК), "
            "разпределяни многократно през различни дни — изисква проверка за вътрешна специализация."
        )
        return "MASS_CREDITOR_SUMMARY", TIER_META["MASS_CREDITOR_SUMMARY"]["label"], basis

    # Tier 1: UNEXPLAINED PRIORITY (persists across multiple days/months, non-ZSRS, non-batch, non-specialized public)
    basis = (
        f"Необяснено статистическо струпване през {distinct_days} различни дни "
        f"(макс. {round(max_day_share * 100)}% в 1 ден) без очевидно законово основание по ЗСРС/дежурство — "
        "висок приоритет за проверка на протоколите в ЕИСС от ИВСС/ВСС."
    )
    return "UNEXPLAINED_PRIORITY", TIER_META["UNEXPLAINED_PRIORITY"]["label"], basis


def norm_entity(name: str, drop_legal: bool = True) -> str:
    """Normalizes entity names identically to sync_sigma3_judicial_6.py for registry matching."""
    s = (name or "").lower()
    s = re.sub(r"\(актуализиран[^)]*\)", " ", s, flags=re.I)
    for ch in ("„", "“", '"', "'", "`", "«", "»", "–", "—", "(", ")", "[", "]", ",", ";", "."):
        s = s.replace(ch, " ")
    s = re.sub(r"[^а-яёa-z0-9\-\s]", " ", s)
    if drop_legal:
        s = LEGAL_FORM_RE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip(" -")


def normalize_party_display(raw: str) -> str:
    """Upper-cases, removes quotes/empty parens, strips personal representative names, and collapses whitespace."""
    s = raw.strip()
    for ch in ("„", "“", '"', "«", "»", "'", "`"):
        s = s.replace(ch, "")
    s = s.replace("АДМИТИСТРАЦИЯ", "АДМИНИСТРАЦИЯ")
    s = re.sub(r"\(\s*\)", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,.;:-").upper()
    s = re.sub(
        r"(?:,|\s)+(?:"
        r"СЪС\s+ЗАКОНЕН\s+ПРЕДСТАВИТЕЛ|"
        r"ПРЕДСТАВЛЯВАЩ\s*-?\s*ВИНАГИ|"
        r"ПРЕДСТАВЛЯВАН[ОАИ]?\b|"
        r"ЧРЕЗ\s+(?:АДВ|ЮРИСКОНСУЛТ|ПЪЛНОМОЩНИК|[А-ЯЁ]{2,}\s+[А-ЯЁ]{2,})|"
        r"ОТ\s+КВЕСТОРИТЕ\b"
        r").*$",
        "",
        s,
    )
    s = re.sub(
        r"^(?:[А-ЯЁ]\.\s*[А-ЯЁ]\.|[А-ЯЁ]{2,}(?:\s+[А-ЯЁ]{2,}){1,2})\s*[-–,]?\s*"
        r"(?=(?:ПОЛИЦЕЙСКИ|СТАРШИ|МЛАДШИ|ГЛАВЕН|НАЧАЛНИК|ИНСПЕКТОР|ДИРЕКТОР|КМЕТ|РАЗСЛЕДВАЩ|СЛЕДОВАТЕЛ|ПЪРВИ\s+СЕКРЕТАР)\b)",
        "",
        s,
    )
    s = re.sub(r"\s*\([^)]*$", "", s)
    s = re.sub(r"\s*\(\s*\)", "", s)
    return re.sub(r"\s+", " ", s).strip(" ,.;:-()")


def extract_legal_parties(side_left: str, side_right: str) -> list[str]:
    """Extracts deduplicated legal entities & institutions from case sides; never keeps natural persons."""
    seen: set[str] = set()
    out: list[str] = []
    for raw_side in (side_left or "", side_right or ""):
        for part in raw_side.split(";"):
            cleaned = normalize_party_display(part)
            if len(cleaned) < 3:
                continue
            if EGN_RE.search(cleaned):
                cleaned = EGN_RE.sub("", cleaned).strip()
            if not LEGAL_ENTITY_RE.search(cleaned):
                continue
            if cleaned not in seen:
                seen.add(cleaned)
                out.append(cleaned)
    return out


def _ecase_post_page(year: str, page: int, size: int) -> dict[str, Any]:
    """Fetches a single /Case/LoadData page with retries & backoff."""
    filt = {
        "CourtId": "-1",
        "CaseKindId": "-1",
        "DocNumber": "",
        "RegNumber": "",
        "RegYear": str(year),
        "PrevNumber": "",
        "PrevYear": "",
        "ActKindId": "-1",
        "ActNumber": "",
        "ActYear": "",
        "AssignedDocCourtId": "",
        "AssignedDocNumber": "",
        "AssignedDocYear": "",
        "CheckMeInSides": False,
    }
    payload = json.dumps({"data": json.dumps(filt), "page": page, "size": size}, ensure_ascii=False).encode("utf-8")

    last_err: str = ""
    for attempt in range(4):
        try:
            if attempt > 0:
                time.sleep(1.5 * (2 ** attempt))
            req = urllib.request.Request(ECASE_URL, data=payload, headers=ECASE_HEADERS, method="POST")
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            if not raw.lstrip().startswith("{"):
                raise ValueError(f"Non-JSON response (possible block/CAPTCHA): {raw[:160]}")
            data = json.loads(raw)
            if not isinstance(data, dict) or "data" not in data:
                raise ValueError(f"Unexpected JSON envelope keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
            return data
        except urllib.error.HTTPError as he:
            last_err = f"HTTP {he.code}: {he.reason}"
            if he.code == 403:
                raise RuntimeError(f"Access denied (HTTP 403) at year={year} page={page}: {last_err}") from he
            if he.code in (429, 502, 503, 504):
                time.sleep(3.5 * (attempt + 1))
            else:
                time.sleep(1.0 * (attempt + 1))
        except Exception as exc:
            last_err = str(exc)
            if "Non-JSON" in last_err:
                raise RuntimeError(last_err) from exc
    raise RuntimeError(f"Failed after 4 attempts for year={year} page={page} size={size}: {last_err}")


def _cache_path(year: str, page: int, size: int) -> Path:
    return CACHE_DIR / f"y{year}_p{page}_s{size}.json"


def crawl_year(year: str, requested_size: int) -> tuple[int, int]:
    """Crawls all pages for a year into CACHE_DIR, resuming cleanly from existing cached pages."""
    size = requested_size
    p1_path = _cache_path(year, 1, size)
    if p1_path.exists() and p1_path.stat().st_size > 100:
        p1_data = json.loads(p1_path.read_text(encoding="utf-8"))
    else:
        time.sleep(0.3)
        p1_data = _ecase_post_page(year, 1, size)
        total_rows_probe = int(p1_data.get("total_rows") or 0)
        got_probe = len(p1_data.get("data") or [])
        if total_rows_probe > size and got_probe < size and size > 500:
            print(f"[PROBE] year={year} size={size} returned {got_probe}/{total_rows_probe}; falling back to size=500", flush=True)
            size = 500
            p1_path = _cache_path(year, 1, size)
            if p1_path.exists() and p1_path.stat().st_size > 100:
                p1_data = json.loads(p1_path.read_text(encoding="utf-8"))
            else:
                time.sleep(0.3)
                p1_data = _ecase_post_page(year, 1, size)
        p1_path.write_text(json.dumps(p1_data, ensure_ascii=False), encoding="utf-8")

    reported_total = int(p1_data.get("total_rows") or 0)
    total_pages = max(1, math.ceil(reported_total / size))
    print(f"[CRAWL] Year {year}: reported total_rows={reported_total:,}, page_size={size}, est_pages={total_pages}", flush=True)

    # Probe deep page to confirm no pagination ceiling
    if total_pages > 2:
        deep_page = total_pages - 1
        deep_path = _cache_path(year, deep_page, size)
        if not (deep_path.exists() and deep_path.stat().st_size > 100):
            time.sleep(0.3)
            deep_data = _ecase_post_page(year, deep_page, size)
            if not (deep_data.get("data") or []):
                raise RuntimeError(f"Pagination ceiling detected: deep page {deep_page}/{total_pages} returned 0 rows for year={year}")
            deep_path.write_text(json.dumps(deep_data, ensure_ascii=False), encoding="utf-8")
            print(f"[PROBE] Year {year}: deep page {deep_page} OK ({len(deep_data['data'])} rows)", flush=True)

    # Fetch pages 2..total_pages and tolerate slight drift from live inserts at the tail
    fetched_new = 0
    page = 2
    max_page_cap = total_pages + 6
    while page <= max_page_cap:
        cpath = _cache_path(year, page, size)
        if cpath.exists() and cpath.stat().st_size > 100:
            if page >= total_pages:
                cached_obj = json.loads(cpath.read_text(encoding="utf-8"))
                if len(cached_obj.get("data") or []) < size:
                    break
            page += 1
            continue

        time.sleep(0.3)
        pdata = _ecase_post_page(year, page, size)
        rows = pdata.get("data") or []
        if not rows:
            if page <= total_pages - 1:
                raise RuntimeError(f"Unexpected empty page {page}/{total_pages} for year={year}")
            break
        cpath.write_text(json.dumps(pdata, ensure_ascii=False), encoding="utf-8")
        fetched_new += 1
        if fetched_new % 25 == 0 or page >= total_pages:
            print(f"[CRAWL] Year {year}: page {page}/{total_pages} saved (new={fetched_new})", flush=True)
        if page >= total_pages and len(rows) < size:
            break
        page += 1

    return reported_total, size


def load_cached_cases(years: list[str], preferred_size: int) -> tuple[dict[str, int], dict[str, dict[str, Any]]]:
    """Loads deduplicated cases by gid across cached page files for the specified years."""
    reported_totals: dict[str, int] = {}
    cases_by_gid: dict[str, dict[str, Any]] = {}

    for yr in years:
        # Pick consistent size from cache if preferred_size isn't present
        size = preferred_size
        p1 = _cache_path(yr, 1, size)
        if not p1.exists():
            alt = sorted(CACHE_DIR.glob(f"y{yr}_p1_s*.json"))
            if not alt:
                raise FileNotFoundError(f"No cached page 1 found for year {yr} in {CACHE_DIR}")
            p1 = alt[0]
            m = re.search(r"_s(\d+)\.json$", p1.name)
            if m:
                size = int(m.group(1))

        p1_obj = json.loads(p1.read_text(encoding="utf-8"))
        reported_totals[yr] = int(p1_obj.get("total_rows") or 0)

        page_files = sorted(
            CACHE_DIR.glob(f"y{yr}_p*_s{size}.json"),
            key=lambda p: int(re.search(r"_p(\d+)_", p.name).group(1)),
        )
        for pf in page_files:
            obj = json.loads(pf.read_text(encoding="utf-8"))
            for row in obj.get("data") or []:
                gid = row.get("gid")
                if gid:
                    cases_by_gid[gid] = row

    return reported_totals, cases_by_gid


EXCLUDED_OFFICIAL_RE = re.compile(
    r"росица[\s\-а-яё]{0,30}велкова|велкова[\s\-]желева|поля[\s\-а-яё]{0,30}занева|занева[\s\-]димитрова",
    re.I,
)


def build_level4_registries() -> tuple[dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Loads Level 4 cross-registry links: officials (KPKONPI/SIGMA), KZK/VAS appeals, and J3 law firms."""
    officials_by_eik: dict[str, list[dict[str, Any]]] = defaultdict(list)
    off_path = DATA_DIR / "officials_all.json"
    if off_path.exists():
        obj = json.loads(off_path.read_text(encoding="utf-8"))
        for o in obj.get("officials") or []:
            off_name = str(o.get("name") or "").strip()
            if EXCLUDED_OFFICIAL_RE.search(off_name):
                continue
            eiks_found: set[str] = set()
            for comp in o.get("companies") or []:
                e = str(comp.get("eik") or comp.get("uic") or "").strip()
                if len(e) == 9 and e.isdigit():
                    eiks_found.add(e)
            for auth in o.get("byAuthority") or []:
                e = str(auth.get("eik") or auth.get("uic") or "").strip()
                if len(e) == 9 and e.isdigit():
                    eiks_found.add(e)
            # Also scan serialized companies/topContracts for 9-digit EIKs
            for m in re.findall(r"\b\d{9}\b", json.dumps(o.get("companies") or [], ensure_ascii=False)):
                eiks_found.add(m)
            for m in re.findall(r"\b\d{9}\b", json.dumps(o.get("topContracts") or [], ensure_ascii=False)):
                eiks_found.add(m)
            if not eiks_found:
                continue
            summary = {
                "name": str(o.get("name") or "").strip(),
                "institution": str(o.get("primaryInstitution") or "").strip(),
                "totalEurM": round(float(o.get("totalEur") or 0.0) / 1e6, 3),
                "periodEurM": round(float(o.get("periodEur") or 0.0) / 1e6, 3),
                "ownInstitution": bool(o.get("ownInstitution")),
                "riskScore": int(o.get("riskScore") or 0),
                "sigmaUrl": str(o.get("sigmaUrl") or ""),
            }
            for e in eiks_found:
                officials_by_eik[e].append(summary)

    kzk_by_norm: dict[str, dict[str, Any]] = {}
    j3_law_firms: list[dict[str, Any]] = []
    j6_path = DATA_DIR / "sigma3_judicial_6.json"
    if j6_path.exists():
        j6 = json.loads(j6_path.read_text(encoding="utf-8"))
        m4 = j6.get("module4_kzkVas") or {}
        for row in (m4.get("topAppellants") or []) + (m4.get("topAuthorities") or []):
            nm = str(row.get("name") or row.get("appellant") or row.get("authority") or "").strip()
            if not nm:
                continue
            key = norm_entity(nm, drop_legal=True)
            if len(key) >= 4:
                kzk_by_norm[key] = {
                    "count": int(row.get("count") or row.get("cases") or row.get("complaints") or 0),
                    "role": "appellant" if "appellant" in row else "authority",
                }
        m3 = j6.get("module3_legalExpertGraph") or {}
        for lf in m3.get("topLawFirmHubs") or []:
            j3_law_firms.append(
                {
                    "eik": str(lf.get("eik") or ""),
                    "name": str(lf.get("name") or ""),
                    "normKey": norm_entity(str(lf.get("name") or ""), drop_legal=True),
                    "totalEurM": round(float(lf.get("totalEur") or 0.0) / 1e6, 3),
                    "contracts": int(lf.get("contracts") or 0),
                    "authorityCount": int(lf.get("authorityCount") or 0),
                }
            )
    return officials_by_eik, kzk_by_norm, j3_law_firms


def build_procurement_lookup() -> dict[str, dict[str, Any]]:
    """Maps normalized company and authority names to EIK, EUR total and contract count from NAsvetlo indexes."""
    lookup: dict[str, dict[str, Any]] = {}
    specs = (
        ("authorities_index.json", "authority", 5, 6),
        ("companies_index.json", "company", 4, 5),
    )
    for fname, role, eur_idx, cnt_idx in specs:
        fpath = DATA_DIR / fname
        if not fpath.exists():
            continue
        obj = json.loads(fpath.read_text(encoding="utf-8"))
        for row in obj.get("rows") or []:
            if len(row) <= max(eur_idx, cnt_idx):
                continue
            eik = str(row[0] or "").strip()
            name = str(row[1] or "").strip()
            if not eik or not name:
                continue
            eur = float(row[eur_idx] or 0.0)
            cnt = int(row[cnt_idx] or 0)
            key = norm_entity(name, drop_legal=True)
            if len(key) >= 4:
                prev = lookup.get(key)
                if not prev or eur > prev["totalEur"]:
                    lookup[key] = {
                        "eik": eik,
                        "totalEur": round(eur, 2),
                        "contracts": cnt,
                        "role": role,
                    }
    return lookup


def gini_coefficient(values: list[int]) -> float:
    """Computes population Gini coefficient for non-negative integers."""
    n = len(values)
    if n < 2:
        return 0.0
    total = sum(values)
    if total == 0:
        return 0.0
    sorted_vals = sorted(values)
    weighted_sum = sum((i + 1) * v for i, v in enumerate(sorted_vals))
    return (2.0 * weighted_sum) / (n * total) - (n + 1.0) / n


def binomial_upper_tail(k: int, n: int, p: float) -> float:
    """Exact one-sided binomial P(X >= k | n, p) computed via log-gamma."""
    if k <= 0:
        return 1.0
    if k > n or p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    log_p = math.log(p)
    log_1mp = math.log1p(-p)
    lg_np1 = math.lgamma(n + 1)
    max_lp = -math.inf
    log_terms: list[float] = []
    for x in range(k, n + 1):
        lp = lg_np1 - math.lgamma(x + 1) - math.lgamma(n - x + 1) + x * log_p + (n - x) * log_1mp
        log_terms.append(lp)
        if lp > max_lp:
            max_lp = lp
    total = sum(math.exp(lt - max_lp) for lt in log_terms) * math.exp(max_lp)
    return min(1.0, max(0.0, total))


def analyze_universe(
    years: list[str],
    reported_totals: dict[str, int],
    cases_by_gid: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Runs parts A (uniformity), B (party->judge concentration + BH FDR), C (specialization)."""
    proc_lookup = build_procurement_lookup()

    cases_unique = len(cases_by_gid)
    cases_with_judge = 0
    court_names: dict[int, str] = {}
    court_total_cases: Counter[int] = Counter()
    court_judges: dict[int, set[str]] = defaultdict(set)
    all_judges: set[str] = set()

    # Cell = (courtId, dept, caseKind, regYear)
    cell_judge_counts: dict[tuple[int, str, str, int], Counter[str]] = defaultdict(Counter)
    cell_party_total: dict[tuple[int, str, str, int], Counter[str]] = defaultdict(Counter)
    cell_party_judge_counts: dict[tuple[int, str, str, int], dict[str, Counter[str]]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    cell_party_judge_samples: dict[tuple[int, str, str, int], dict[tuple[str, str], list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    # Level 2 telemetry per (cell, party, judge): day counts & restricted access count
    cell_party_judge_days: dict[tuple[int, str, str, int], dict[tuple[str, str], Counter[str]]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    cell_party_judge_restricted: dict[tuple[int, str, str, int], Counter[tuple[str, str]]] = defaultdict(Counter)

    # Level 3 telemetry: (cell) -> representative (lawyer/law_firm) -> judge counts, days, types, samples
    cell_rep_total: dict[tuple[int, str, str, int], Counter[str]] = defaultdict(Counter)
    cell_rep_judge_counts: dict[tuple[int, str, str, int], dict[str, Counter[str]]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    cell_rep_judge_days: dict[tuple[int, str, str, int], dict[tuple[str, str], Counter[str]]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    cell_rep_judge_samples: dict[tuple[int, str, str, int], dict[tuple[str, str], list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    rep_types: dict[str, str] = {}
    rep_parties_seen: dict[str, Counter[str]] = defaultdict(Counter)

    # Specialization table: (courtId, dept, regYear) -> Counter[(judge, caseKind)]
    spec_counts: dict[tuple[int, str, int], Counter[tuple[str, str]]] = defaultdict(Counter)

    for gid, row in cases_by_gid.items():
        cid = int(row.get("courtId") or 0)
        cname = str(row.get("courtName") or "").strip() or f"Съд #{cid}"
        court_names[cid] = cname
        court_total_cases[cid] += 1

        judge = re.sub(r"\s+", " ", str(row.get("judgeReporter") or "").strip())
        if not judge:
            continue

        cases_with_judge += 1
        all_judges.add(judge)
        court_judges[cid].add(judge)

        dept = str(row.get("departmentName") or "").strip() or "—"
        kind = str(row.get("caseKindName") or "").strip() or "—"
        ryear = int(row.get("regYear") or 0)
        fdate_day = str(row.get("formationDate") or "")[:10]
        is_restricted = bool(row.get("restrictedAccess"))

        cell = (cid, dept, kind, ryear)
        cell_judge_counts[cell][judge] += 1
        spec_counts[(cid, dept, ryear)][(judge, kind)] += 1

        parties = extract_legal_parties(str(row.get("sideLeft") or ""), str(row.get("sideRight") or ""))
        if not parties:
            continue

        sample_entry = {
            "regNumber": row.get("regNumber"),
            "regYear": ryear,
            "formationDate": fdate_day,
            "caseUrl": f"https://ecase.justice.bg/Case/CaseDetail/{gid}",
        }
        p_tot = cell_party_total[cell]
        pj_cnt = cell_party_judge_counts[cell]
        pj_smp = cell_party_judge_samples[cell]
        pj_days = cell_party_judge_days[cell]
        pj_res = cell_party_judge_restricted[cell]
        for p_name in parties:
            p_tot[p_name] += 1
            pj_cnt[p_name][judge] += 1
            if fdate_day and len(fdate_day) == 10:
                pj_days[(p_name, judge)][fdate_day] += 1
            if is_restricted:
                pj_res[(p_name, judge)] += 1
            smp = pj_smp[(p_name, judge)]
            if len(smp) < 5:
                smp.append(sample_entry)

        # Level 3: Extract law firms & named attorneys representing legal entities
        reps = extract_legal_representatives(str(row.get("sideLeft") or ""), str(row.get("sideRight") or ""))
        if reps:
            r_tot = cell_rep_total[cell]
            rj_cnt = cell_rep_judge_counts[cell]
            rj_days = cell_rep_judge_days[cell]
            rj_smp = cell_rep_judge_samples[cell]
            for rep_name, rtype in reps:
                rep_types[rep_name] = rtype
                r_tot[rep_name] += 1
                rj_cnt[rep_name][judge] += 1
                if fdate_day and len(fdate_day) == 10:
                    rj_days[(rep_name, judge)][fdate_day] += 1
                for p_name in parties[:2]:
                    rep_parties_seen[rep_name][p_name] += 1
                rsmp = rj_smp[(rep_name, judge)]
                if len(rsmp) < 4:
                    rsmp.append(sample_entry)

    # A. Descriptive uniformity per cell -> median Gini per court
    court_ginis: dict[int, list[float]] = defaultdict(list)
    for cell, jcounts in cell_judge_counts.items():
        active_vals = [cnt for cnt in jcounts.values() if cnt >= 3]
        if len(active_vals) >= 2:
            court_ginis[cell[0]].append(gini_coefficient(active_vals))

    # B. Party -> judge concentration binomial tests across ALL eligible cells
    raw_tests: list[dict[str, Any]] = []
    for cell, p_totals in cell_party_total.items():
        cid, dept, kind, ryear = cell
        jcounts = cell_judge_counts[cell]
        cases_cell = sum(jcounts.values())
        if cases_cell <= 0:
            continue

        cname = court_names[cid]
        pj_cnt = cell_party_judge_counts[cell]
        pj_smp = cell_party_judge_samples[cell]
        pj_days = cell_party_judge_days[cell]
        pj_res = cell_party_judge_restricted[cell]

        for p_name, n_p in p_totals.items():
            if n_p < 8:
                continue
            # Exclude structural parties (>40% of cell cases)
            if (n_p / cases_cell) > 0.40:
                continue

            for judge, k in pj_cnt[p_name].items():
                if k < 4:
                    continue
                s_j = jcounts[judge] / cases_cell
                if s_j <= 0.0 or s_j >= 1.0:
                    continue
                expected = n_p * s_j
                ratio = k / expected
                p_val = binomial_upper_tail(k, n_p, s_j)
                day_counter = pj_days[(p_name, judge)]
                distinct_days = len(day_counter)
                distinct_months = len({d[:7] for d in day_counter.keys()})
                max_day_cnt = max(day_counter.values()) if day_counter else 0
                max_day_share = round(max_day_cnt / k, 3) if k > 0 else 0.0
                sorted_days = sorted(day_counter.keys())
                date_span = f"{sorted_days[0]} → {sorted_days[-1]}" if len(sorted_days) >= 2 else (sorted_days[0] if sorted_days else "")
                restricted_cnt = pj_res[(p_name, judge)]
                restricted_share = round(restricted_cnt / k, 3) if k > 0 else 0.0
                raw_tests.append(
                    {
                        "courtId": cid,
                        "courtName": cname,
                        "department": dept,
                        "caseKind": kind,
                        "year": ryear,
                        "party": p_name,
                        "judge": judge,
                        "k": k,
                        "nParty": n_p,
                        "expected": round(expected, 2),
                        "ratio": round(ratio, 2),
                        "p": p_val,
                        "distinctDays": distinct_days,
                        "distinctMonths": distinct_months,
                        "maxDayShare": max_day_share,
                        "dateSpan": date_span,
                        "restrictedShare": restricted_share,
                        "sampleCases": pj_smp[(p_name, judge)],
                    }
                )

    # Benjamini-Hochberg FDR across ALL tests
    m_tests = len(raw_tests)
    raw_tests.sort(key=lambda x: x["p"])
    if m_tests > 0:
        q_vals = [min(1.0, raw_tests[i]["p"] * m_tests / (i + 1)) for i in range(m_tests)]
        for i in range(m_tests - 2, -1, -1):
            if q_vals[i] > q_vals[i + 1]:
                q_vals[i] = q_vals[i + 1]
        for i, item in enumerate(raw_tests):
            item["q"] = q_vals[i]

    red_flags: list[dict[str, Any]] = []
    amber_flags: list[dict[str, Any]] = []
    court_red: Counter[int] = Counter()
    court_red_unexplained: Counter[int] = Counter()
    court_amber: Counter[int] = Counter()
    red_tier_counts: Counter[str] = Counter()

    def enrich_flag(t: dict[str, Any]) -> dict[str, Any]:
        proc = proc_lookup.get(norm_entity(t["party"], drop_legal=True)) or {}
        eik = str(proc.get("eik") or "")
        tier, tier_label, basis = classify_flag_level1(
            t["caseKind"],
            t["party"],
            t["distinctDays"],
            t["maxDayShare"],
            t["restrictedShare"],
        )
        return {
            "courtName": t["courtName"],
            "department": t["department"],
            "caseKind": t["caseKind"],
            "year": t["year"],
            "party": t["party"],
            "partyEik": eik,
            "procurementLinked": bool(eik),
            "procurementEurM": round(float(proc.get("totalEur") or 0.0) / 1e6, 3),
            "procurementContracts": int(proc.get("contracts") or 0),
            "judge": t["judge"],
            "k": t["k"],
            "nParty": t["nParty"],
            "expected": t["expected"],
            "ratio": t["ratio"],
            "p": float(f"{t['p']:.3e}"),
            "q": float(f"{t['q']:.3e}"),
            "distinctDays": t["distinctDays"],
            "distinctMonths": t["distinctMonths"],
            "maxDayShare": t["maxDayShare"],
            "dateSpan": t["dateSpan"],
            "restrictedShare": t["restrictedShare"],
            "explanationTier": tier,
            "explanationLabel": tier_label,
            "explanationBasis": basis,
            "sampleCases": t["sampleCases"][:5],
        }

    for t in raw_tests:
        q = t["q"]
        k = t["k"]
        ratio = t["ratio"]
        if q < 0.01 and k >= 5 and ratio >= 3.0:
            item = enrich_flag(t)
            court_red[t["courtId"]] += 1
            red_tier_counts[item["explanationTier"]] += 1
            if item["explanationTier"] == "UNEXPLAINED_PRIORITY":
                court_red_unexplained[t["courtId"]] += 1
            red_flags.append(item)
        elif q < 0.05 and k >= 4 and ratio >= 2.0:
            court_amber[t["courtId"]] += 1
            amber_flags.append(enrich_flag(t))

    red_flags.sort(key=lambda x: (x["q"], -x["ratio"], -x["k"]))
    amber_flags.sort(key=lambda x: (x["q"], -x["ratio"], -x["k"]))

    # C. Within-department case-kind specialization (AMBER only)
    spec_flags: list[dict[str, Any]] = []
    for (cid, dept, ryear), jk_counter in spec_counts.items():
        n_tot = sum(jk_counter.values())
        if n_tot < 20:
            continue
        row_sums: Counter[str] = Counter()
        col_sums: Counter[str] = Counter()
        for (j, knd), cnt in jk_counter.items():
            row_sums[j] += cnt
            col_sums[knd] += cnt
        if len(row_sums) < 2 or len(col_sums) < 2:
            continue
        cname = court_names[cid]
        for (j, knd), cnt in jk_counter.items():
            if cnt < 10:
                continue
            r_s = row_sums[j]
            c_s = col_sums[knd]
            exp = (r_s * c_s) / n_tot
            if exp <= 0.0 or exp >= n_tot:
                continue
            denom_sq = exp * (1.0 - r_s / n_tot) * (1.0 - c_s / n_tot)
            if denom_sq <= 0.0:
                continue
            z_res = (cnt - exp) / math.sqrt(denom_sq)
            if z_res >= 5.0:
                spec_flags.append(
                    {
                        "courtName": cname,
                        "department": dept,
                        "year": ryear,
                        "judge": j,
                        "caseKind": knd,
                        "count": cnt,
                        "expected": round(exp, 2),
                        "zResidual": round(z_res, 2),
                        "label": "възможна вътрешна специализация",
                    }
                )
    spec_flags.sort(key=lambda x: (-x["zResidual"], -x["count"]))

    # Level 3A: Lawyer / Law Firm -> Judge Concentration (exact binomial + BH FDR)
    raw_rep_tests: list[dict[str, Any]] = []
    for cell, r_totals in cell_rep_total.items():
        cid, dept, kind, ryear = cell
        jcounts = cell_judge_counts[cell]
        cases_cell = sum(jcounts.values())
        if cases_cell <= 0:
            continue
        cname = court_names[cid]
        rj_cnt = cell_rep_judge_counts[cell]
        rj_days = cell_rep_judge_days[cell]
        rj_smp = cell_rep_judge_samples[cell]
        for rep_name, n_r in r_totals.items():
            if n_r < 5:
                continue
            for judge, k in rj_cnt[rep_name].items():
                if k < 3:
                    continue
                s_j = jcounts[judge] / cases_cell
                if s_j <= 0.0 or s_j >= 1.0:
                    continue
                expected = n_r * s_j
                ratio = k / expected
                p_val = binomial_upper_tail(k, n_r, s_j)
                dc = rj_days[(rep_name, judge)]
                dd = len(dc)
                dm = len({d[:7] for d in dc.keys()})
                mds = round(max(dc.values()) / k, 3) if dc and k > 0 else 0.0
                top_clients = [p for p, _ in rep_parties_seen[rep_name].most_common(3)]
                raw_rep_tests.append(
                    {
                        "courtName": cname,
                        "department": dept,
                        "caseKind": kind,
                        "year": ryear,
                        "representative": rep_name,
                        "repType": rep_types.get(rep_name, "attorney"),
                        "judge": judge,
                        "k": k,
                        "nRep": n_r,
                        "expected": round(expected, 2),
                        "ratio": round(ratio, 2),
                        "p": p_val,
                        "distinctDays": dd,
                        "distinctMonths": dm,
                        "maxDayShare": mds,
                        "topClients": top_clients,
                        "sampleCases": rj_smp[(rep_name, judge)][:4],
                    }
                )
    m_rep = len(raw_rep_tests)
    raw_rep_tests.sort(key=lambda x: x["p"])
    if m_rep > 0:
        rq_vals = [min(1.0, raw_rep_tests[i]["p"] * m_rep / (i + 1)) for i in range(m_rep)]
        for i in range(m_rep - 2, -1, -1):
            if rq_vals[i] > rq_vals[i + 1]:
                rq_vals[i] = rq_vals[i + 1]
        for i, item in enumerate(raw_rep_tests):
            item["q"] = rq_vals[i]

    lawyer_judge_flags: list[dict[str, Any]] = []
    for item in raw_rep_tests:
        if item["q"] < 0.05 and item["k"] >= 3 and item["ratio"] >= 2.5:
            lawyer_judge_flags.append(
                {
                    **item,
                    "p": float(f"{item['p']:.3e}"),
                    "q": float(f"{item['q']:.3e}"),
                    "severity": "RED" if (item["q"] < 0.01 and item["k"] >= 4 and item["ratio"] >= 3.0) else "AMBER",
                }
            )
    lawyer_judge_flags.sort(key=lambda x: (x["q"], -x["ratio"], -x["k"]))

    # Level 3B: Multi-Flag Unexplained Judge Hubs (judges with >=2 UNEXPLAINED_PRIORITY RED flags)
    unexp_by_judge: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for rf in red_flags:
        if rf["explanationTier"] == "UNEXPLAINED_PRIORITY":
            unexp_by_judge[(rf["judge"], rf["courtName"])].append(rf)

    multi_flag_judge_hubs: list[dict[str, Any]] = []
    for (jname, cname), items in unexp_by_judge.items():
        if len(items) < 2:
            continue
        party_names = [it["party"] for it in items]
        joined = " ".join(party_names)
        if "А1 БЪЛГАРИЯ" in joined and "МИНОЛБИ" in joined:
            pattern = "Ко-клъстер: А1 България ЕАД + Минолби ЕООД (вероятна цесия/общ процесуален поток)"
        elif sum(1 for p in party_names if "ЗАСТРАХОВА" in p or "БУЛ ИНС" in p or "ДЗИ" in p or "АРМЕЕЦ" in p or "ДАЛЛБОГГ" in p or "ЛЕВ ИНС" in p) >= 2:
            pattern = "Мулти-застрахователен / комунален хъб (множество застрахователи при 1 съдия)"
        else:
            pattern = "Мулти-корпоративен хъб (≥2 необяснени RED флага при 1 съдия)"
        seen_eiks: set[str] = set()
        comb_eur_m = 0.0
        for it in items:
            if it["partyEik"] and it["partyEik"] not in seen_eiks:
                seen_eiks.add(it["partyEik"])
                comb_eur_m += float(it["procurementEurM"] or 0.0)
        multi_flag_judge_hubs.append(
            {
                "judge": jname,
                "courtName": cname,
                "unexplainedCount": len(items),
                "totalFlaggedCases": sum(int(it["k"]) for it in items),
                "maxRatio": max(float(it["ratio"]) for it in items),
                "maxDistinctMonths": max(int(it["distinctMonths"]) for it in items),
                "combinedProcurementEurM": round(comb_eur_m, 3),
                "clusterPattern": pattern,
                "parties": [
                    {
                        "party": it["party"],
                        "eik": it["partyEik"],
                        "caseKind": it["caseKind"],
                        "year": it["year"],
                        "k": it["k"],
                        "n": it["nParty"],
                        "ratio": it["ratio"],
                        "distinctDays": it["distinctDays"],
                        "distinctMonths": it["distinctMonths"],
                        "procurementEurM": it["procurementEurM"],
                    }
                    for it in items
                ],
            }
        )
    multi_flag_judge_hubs.sort(key=lambda x: (-x["unexplainedCount"], -x["totalFlaggedCases"], -x["maxRatio"]))

    # Level 4: Conflict-of-Interest Cross-Registry Bridge (RED EIKs x ZOP x KPKONPI Officials x KZK/VAS)
    officials_by_eik, kzk_by_norm, j3_law_firms = build_level4_registries()
    red_by_eik: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for rf in red_flags:
        if rf["partyEik"]:
            red_by_eik[rf["partyEik"]].append(rf)

    conflict_bridge: list[dict[str, Any]] = []
    linked_official_names: set[str] = set()
    for eik, flags in red_by_eik.items():
        linked_offs = officials_by_eik.get(eik) or []
        norm_p = norm_entity(flags[0]["party"], drop_legal=True)
        kzk_info = kzk_by_norm.get(norm_p)
        unexp_cnt = sum(1 for f in flags if f["explanationTier"] == "UNEXPLAINED_PRIORITY")
        if not linked_offs and not kzk_info and unexp_cnt == 0:
            continue
        for o in linked_offs:
            linked_official_names.add(o["name"])
        judges_uniq = list(dict.fromkeys(f["judge"] for f in flags))
        courts_uniq = list(dict.fromkeys(f["courtName"] for f in flags))
        conflict_bridge.append(
            {
                "eik": eik,
                "party": flags[0]["party"],
                "procurementEurM": float(flags[0]["procurementEurM"] or 0.0),
                "procurementContracts": int(flags[0]["procurementContracts"] or 0),
                "redFlagsCount": len(flags),
                "unexplainedRedCount": unexp_cnt,
                "maxRatio": max(float(f["ratio"]) for f in flags),
                "maxDistinctMonths": max(int(f["distinctMonths"]) for f in flags),
                "courts": courts_uniq[:4],
                "judges": judges_uniq[:6],
                "officialsCount": len(linked_offs),
                "officials": sorted(linked_offs, key=lambda o: (-o["riskScore"], -o["totalEurM"]))[:6],
                "kzkAppealsCount": int(kzk_info["count"]) if kzk_info else 0,
                "topCaseUrl": flags[0]["sampleCases"][0]["caseUrl"] if flags[0]["sampleCases"] else "",
            }
        )
    conflict_bridge.sort(
        key=lambda x: (-x["unexplainedRedCount"], -x["officialsCount"], -x["procurementEurM"], -x["maxRatio"])
    )

    # Level 5: Multi-Year Persistent Concentrations (same court + party + judge flagged in >=2 distinct years)
    my_groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for rf in red_flags:
        my_groups[(rf["courtName"], rf["caseKind"], rf["party"], rf["judge"])].append(rf)

    multi_year_persistent: list[dict[str, Any]] = []
    for (cname, ckind, pname, jname), items in my_groups.items():
        yrs = sorted({int(it["year"]) for it in items})
        if len(yrs) < 2:
            continue
        items_sorted = sorted(items, key=lambda x: int(x["year"]))
        tiers = [it["explanationTier"] for it in items_sorted]
        # Highest-priority (lowest rank) tier across the years
        best_tier = min(tiers, key=lambda tr: TIER_META[tr]["rank"])
        multi_year_persistent.append(
            {
                "courtName": cname,
                "caseKind": ckind,
                "party": pname,
                "partyEik": items_sorted[0]["partyEik"],
                "procurementEurM": items_sorted[0]["procurementEurM"],
                "judge": jname,
                "yearsCount": len(yrs),
                "years": yrs,
                "totalK": sum(int(it["k"]) for it in items_sorted),
                "totalN": sum(int(it["nParty"]) for it in items_sorted),
                "totalDistinctDays": sum(int(it["distinctDays"]) for it in items_sorted),
                "maxRatio": max(float(it["ratio"]) for it in items_sorted),
                "minQ": min(float(it["q"]) for it in items_sorted),
                "explanationTier": best_tier,
                "explanationLabel": TIER_META[best_tier]["label"],
                "byYear": [
                    {
                        "year": int(it["year"]),
                        "k": int(it["k"]),
                        "n": int(it["nParty"]),
                        "ratio": float(it["ratio"]),
                        "distinctDays": int(it["distinctDays"]),
                        "distinctMonths": int(it["distinctMonths"]),
                    }
                    for it in items_sorted
                ],
                "topCaseUrl": items_sorted[-1]["sampleCases"][0]["caseUrl"] if items_sorted[-1]["sampleCases"] else "",
            }
        )
    multi_year_persistent.sort(
        key=lambda x: (TIER_META[x["explanationTier"]]["rank"], -x["yearsCount"], x["minQ"], -x["maxRatio"])
    )
    multi_year_unexplained = sum(1 for x in multi_year_persistent if x["explanationTier"] == "UNEXPLAINED_PRIORITY")

    courts_list: list[dict[str, Any]] = []
    for cid, cname in court_names.items():
        g_list = court_ginis.get(cid) or []
        med_gini = round(statistics.median(g_list), 4) if g_list else 0.0
        courts_list.append(
            {
                "courtId": cid,
                "courtName": cname,
                "cases": court_total_cases[cid],
                "judges": len(court_judges.get(cid) or ()),
                "medianGini": med_gini,
                "redFlags": court_red[cid],
                "unexplainedRedFlags": court_red_unexplained[cid],
                "amberFlags": court_amber[cid],
            }
        )
    courts_list.sort(key=lambda x: (-x["unexplainedRedFlags"], -x["redFlags"], -x["amberFlags"], -x["cases"]))

    canonical_bytes = json.dumps(red_flags, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    dataset_sha256 = hashlib.sha256(canonical_bytes).hexdigest()

    return {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "ЕПЕП/ЕИСС ecase.justice.bg /Case/LoadData",
        "methodology": {
            "partA": "Описателна равномерност на натоварването (индекс на Джини, max/min и χ²) за активни съдии (>=3 дела) в клетка съд × отделение × вид дело × година. Без червени флагове, тъй като ЕИСС прилага законни коефициенти и отпуски.",
            "partB": "Концентрация страна → съдия чрез едностранен точен биномен тест P(X >= k | n_P, s_j), където s_j е реалният дял на съдията в същата клетка. Структурни страни (>40% от делата в клетката) се изключват. Корекция за множествени тестове по Benjamini–Hochberg FDR. RED: q<0,01, k>=5 и ratio>=3; AMBER: q<0,05, k>=4 и ratio>=2.",
            "partC": "Вътрешноотделна специализация по вид дело (коригирани стандартизирани остатъци на Хаберман z >= 5,0 и брой >= 10) — маркира се само като AMBER („възможна вътрешна специализация“).",
            "level1Filter": "Класификатор за законни и структурни обяснения в 5 категории: (1) Необяснено · Приоритет ИВСС; (2) Масов ищец по чл. 410/417 ГПК; (3) Пакетно завеждане в 1–2 дни (>=70% в един ден); (4) Публичен орган със специализация (НАП/ДАБ/НОИ/АСП); (5) Законово обяснимо по ЗСРС (чл. 15), чл. 159а НПК / чл. 251г ЗЕС или дежурен съдия по ЧНД.",
            "level2Temporal": "Времева дисперсия по точната дата на образуване в ЕИСС (брой различни дни и месеци, макс. дял в 1 ден, % ограничен достъп) и директно обвързване със стойността на договорите по ЗОП (млн. EUR).",
            "level3LawyersHubs": "Ниво 3: Извличане на адвокатски дружества и изрично посочени адвокати/юрисконсулти в страните по ЕИСС с биномен тест + BH FDR (q<0,05, k>=3, ratio>=2,5) и идентифициране на мулти-флагови съдийски хъбове (съдии с >=2 необяснени RED флага и ко-клъстери като А1 + Минолби).",
            "level4ConflictBridge": "Ниво 4: Кръстосан мост по ЕИК между RED флаговете в ЕИСС, обема по ЗОП (ЦАИС ЕОП), 571 публични декларации пред Сметната палата / СИГМА 2.0 и обжалванията в КЗК/ВАС.",
            "level5MultiYear": "Ниво 5: Многогодишна устойчивост (2023 → 2024 → 2025 → 2026) — автоматично засичане на двойки (съд × страна × съдия), които попадат в RED прага в 2, 3 или 4 поредни години.",
            "gdprPolicy": "Физически лица, ЕГН и лични данни се изключват на ниво входен филтър; анализират се само юридически лица и публични институции.",
        },
        "universe": {
            "years": [int(y) for y in years],
            "reportedTotals": reported_totals,
            "casesUnique": cases_unique,
            "casesWithJudge": cases_with_judge,
            "courts": len(court_names),
            "judges": len(all_judges),
            "cells": len(cell_judge_counts),
            "testsRun": m_tests,
            "redFlagsTotal": len(red_flags),
            "amberFlagsTotal": len(amber_flags),
            "specializationTotal": len(spec_flags),
            "tierCounts": {k: int(red_tier_counts.get(k, 0)) for k in TIER_META.keys()},
            "unexplainedRedTotal": int(red_tier_counts.get("UNEXPLAINED_PRIORITY", 0)),
            "statutoryRedTotal": int(
                red_tier_counts.get("STATUTORY_ZSRS_DUTY", 0)
                + red_tier_counts.get("STATUTORY_PUBLIC_SPECIALIZED", 0)
            ),
            "batchArtifactRedTotal": int(red_tier_counts.get("BATCH_FILING_ARTIFACT", 0)),
            "massCreditorRedTotal": int(red_tier_counts.get("MASS_CREDITOR_SUMMARY", 0)),
            "lawyerTestsRun": m_rep,
            "lawyerFlagsTotal": len(lawyer_judge_flags),
            "multiFlagJudgesTotal": len(multi_flag_judge_hubs),
            "conflictBridgeTotal": len(conflict_bridge),
            "linkedOfficialsTotal": len(linked_official_names),
            "multiYearPersistentTotal": len(multi_year_persistent),
            "multiYearUnexplainedTotal": multi_year_unexplained,
            "datasetSha256": dataset_sha256,
        },
        "courts": courts_list,
        "redFlags": red_flags,
        "amberFlags": amber_flags,
        "specialization": spec_flags[:200],
        "lawyerJudgeFlags": lawyer_judge_flags[:120],
        "multiFlagJudgeHubs": multi_flag_judge_hubs,
        "conflictBridge": conflict_bridge,
        "multiYearPersistent": multi_year_persistent,
        "disclaimer": DISCLAIMER_BG,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="NAsvetlo EISS Random Assignment Statistical Auditor")
    parser.add_argument("--years", nargs="+", default=["2023", "2024", "2025", "2026"], help="Registration years to audit")
    parser.add_argument("--page-size", type=int, default=1000, help="Page size for /Case/LoadData")
    parser.add_argument("--analyze-only", action="store_true", help="Analyze cached pages only without network calls")
    parser.add_argument("--crawl-only", action="store_true", help="Crawl and cache requested years without regenerating JSON")
    args = parser.parse_args()

    years = [str(y) for y in args.years]
    if not args.analyze_only:
        for yr in years:
            crawl_year(yr, args.page_size)
    if args.crawl_only:
        print(f"[CRAWL-ONLY DONE] Cached years: {', '.join(years)}", flush=True)
        return 0

    reported_totals, cases_by_gid = load_cached_cases(years, args.page_size)
    missing_judge = sum(1 for r in cases_by_gid.values() if not str(r.get("judgeReporter") or "").strip())
    missing_pct = (missing_judge / len(cases_by_gid) * 100.0) if cases_by_gid else 0.0
    print(
        f"[AUDIT] Loaded unique={len(cases_by_gid):,} (reported={sum(reported_totals.values()):,}), "
        f"missing_judge={missing_judge:,} ({missing_pct:.2f}%)",
        flush=True,
    )

    payload = analyze_universe(years, reported_totals, cases_by_gid)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_mb = OUT_JSON.stat().st_size / (1024 * 1024)
    print(
        f"[DONE] Wrote {OUT_JSON} ({size_mb:.2f} MB) | "
        f"courts={payload['universe']['courts']} judges={payload['universe']['judges']} "
        f"tests={payload['universe']['testsRun']} RED={payload['universe']['redFlagsTotal']} "
        f"AMBER={payload['universe']['amberFlagsTotal']} SPEC={payload['universe']['specializationTotal']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
