#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIGMA 3.0 FINALITY — 7 Deep Anti-Corruption Forensic Engines Compiler
Processes ALL 206,907 Bulgarian public procurement contracts (contracts.csv),
live contract JSON amendments (sigma.midt.bg/contracts/{id}.json),
live Commercial Register deeds (portal.registryagency.bg/CR/api/Deeds/{eik}),
and live Bulgarian National Audit Office Election Registry (erik.bulnao.government.bg)
to generate docs/data/sigma3_forensics_7.json:

  1. Post-Award Inflation (Annexes & Cost Overruns: signingEur -> currentEur)
  2. Shell & Newly-Formed Companies (CR Incorporation Date, Capital, GFO count vs Won EUR)
  3. Salami Slicing (Threshold-splitting clusters within 60-day windows)
  4. Political Donations & Media Payments (BULNAO ERIK 2023-2026 x CAIS EOP 206,907 contracts)
  5. Time-Series Forensics (Friday/Weekend/Dec 20-31 dumps + Nov-Dec Year-End Surge Index)
  6. Hidden Cartel Graph Engine (Bid Rotation rings + Shared CR Address / Manager / Owner)
  7. NLP Tailored Specs Forensics ("Шити" поръчки — Brand-lock & restrictive-clause scan)
"""

from __future__ import annotations

import concurrent.futures
import csv
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
RAW_DIR = Path(r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api")
CONTRACTS_CSV = RAW_DIR / "contracts.csv"
CONTRACTS_JSON_CACHE = RAW_DIR / "contracts_json"
CR_DEEDS_CACHE = RAW_DIR / "cr_deeds"
ERIK_CACHE = RAW_DIR / "erik_cache"

HEADERS = {
    "User-Agent": "SIGMA-3.0-FINALITY-Forensics/3.0 (+https://paas.website)",
    "Accept": "application/json, text/plain, */*",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Elections to pull from official BULNAO ERIK (erik.bulnao.government.bg)
ERIK_ELECTIONS = [
    (95, "Президентски избори (25.10.2026)", "2026-10-25"),
    (93, "Народно събрание (19.04.2026)", "2026-04-19"),
    (83, "Народно събрание (27.10.2024)", "2024-10-27"),
    (79, "Европейски парламент (09.06.2024)", "2024-06-09"),
    (76, "Местни избори — кметове и ОбС (29.10.2023)", "2023-10-29"),
]

# Brand & vendor lock patterns for Engine 7 (NLP Tailored Specs)
BRAND_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Mercedes-Benz", re.compile(r"\b(mercedes|мерцедес)\b", re.I)),
    ("BMW", re.compile(r"\b(bmw|бмв)\b", re.I)),
    ("Škoda / Skoda", re.compile(r"\b(skoda|škoda|шкода)\b", re.I)),
    ("Volkswagen / VW", re.compile(r"\b(volkswagen|фолксваген|\bvw\b)\b", re.I)),
    ("Toyota", re.compile(r"\b(toyota|тойота)\b", re.I)),
    ("Renault / Dacia", re.compile(r"\b(renault|рено|dacia|дачия)\b", re.I)),
    ("MAN / Iveco / Volvo", re.compile(r"\b(iveco|ивеко|volvo|волво|\bman\s+tg)\b", re.I)),
    ("Siemens", re.compile(r"\b(siemens|сименс)\b", re.I)),
    ("Philips", re.compile(r"\b(philips|филипс)\b", re.I)),
    ("GE / General Electric", re.compile(r"\b(general\s+electric|\bge\s+healthcare|\bge\s+medical)\b", re.I)),
    ("Roche", re.compile(r"\b(roche|рош)\b", re.I)),
    ("Cisco", re.compile(r"\b(cisco|сиско)\b", re.I)),
    ("Oracle", re.compile(r"\b(oracle|оракъл)\b", re.I)),
    ("SAP", re.compile(r"\b(\bsap\b|сап\s+ерп)\b", re.I)),
    ("Microsoft", re.compile(r"\b(microsoft|майкрософт|windows\s+server|office\s+365)\b", re.I)),
    ("IBM", re.compile(r"\b(\bibm\b)\b", re.I)),
    ("Dell / HP / Lenovo", re.compile(r"\b(\bdell\b|\bhp\b|\bhpe\b|lenovo|леново)\b", re.I)),
    ("Huawei", re.compile(r"\b(huawei|хуавей)\b", re.I)),
    ("Apple", re.compile(r"\b(apple\s+mac|iphone|ipad|macbook)\b", re.I)),
    ("Canon / Xerox / Ricoh", re.compile(r"\b(canon|канон|xerox|ксерокс|ricoh|konica\s+minolta)\b", re.I)),
    ("ABB / Schneider", re.compile(r"\b(\babb\b|schneider\s+electric|шнайдер)\b", re.I)),
    ("Caterpillar / JCB / John Deere", re.compile(r"\b(caterpillar|катерпилар|\bjcb\b|john\s+deere|джон\s+диир)\b", re.I)),
    ("Alstom / Stadler", re.compile(r"\b(alstom|алстом|stadler|щадлер)\b", re.I)),
    ("Olympus / Mindray / Dräger / Abbott / Beckman", re.compile(r"\b(olympus|олимпус|mindray|dräger|draeger|дрегер|abbott|абот|beckman|бекман|varian|medtronic)\b", re.I)),
    ("Bosch / Hitachi / Daikin", re.compile(r"\b(bosch|бош|hitachi|хитачи|daikin|дайкин)\b", re.I)),
]

RESTRICTIVE_PHRASES: list[tuple[str, re.Pattern[str], int]] = [
    ("изключителни права", re.compile(r"изключителн[иа]\s+права", re.I), 25),
    ("авторски права", re.compile(r"авторск[иа]\s+права", re.I), 20),
    ("оригинални резервни части / консумативи", re.compile(r"оригиналн[иа]\s+(резервн|консуматив|част)", re.I), 18),
    ("съвместим със съществуващ", re.compile(r"съвместим[иао]?\s+със?|надграждане\s+на\s+съществуващ", re.I), 16),
    ("единствен / без аналог", re.compile(r"единствен\s+(изпълнител|доставчик|представител|вносител)|без\s+аналог", re.I), 25),
    ("конкретна марка / модел", re.compile(r"\bмарка\s+[\"„“]|\bмодел\s+[\"„“a-z0-9]", re.I), 18),
    ("чл. 79 ЗОП (пряко договаряне)", re.compile(r"чл\.?\s*79", re.I), 22),
    ("производител / оторизиран сервиз", re.compile(r"оторизиран\s+сервиз|официален\s+представител", re.I), 16),
]

EQUIV_RE = re.compile(r"или\s+еквивалент|еквивалентн", re.I)
MODEL_CODE_RE = re.compile(r"\b[A-Z]{2,5}[-\s]?\d{3,5}[A-Z]?\b")

MEDIA_KW_RE = re.compile(
    r"(медийн|информационн[оа]\s+(обслужване|кампания|дейност)|публикац|рекламн[иао]|телевизи|радиопредаван|вестник|пресцентър|връзки\s+с\s+обществеността|\bpr\b|пиар|комуникационн[аи]\s+(кампания|стратегия)|популяризиран|публичност\s+и\s+визуализация|излъчване\s+на\s+клип|онлайн\s+меди|информационна\s+агенция)",
    re.I,
)
MEDIA_EXCLUDE_RE = re.compile(r"информационно\s+обслужване\s+ад|софтуер|сървър|хардуер|компютър|медицинск|лекарств", re.I)


def norm_person(name: str) -> str:
    s = re.sub(r"\s+", " ", (name or "").strip().lower()).replace("-", " ")
    return s


def parse_date(s: str) -> datetime | None:
    if not s or len(s) < 10:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except Exception:
        return None


def fetch_contract_json(cid: str) -> dict[str, Any] | None:
    safe = re.sub(r"[^A-Za-z0-9_\-]", "_", cid)[:96]
    cpath = CONTRACTS_JSON_CACHE / f"{safe}.json"
    if cpath.exists() and cpath.stat().st_size > 80:
        try:
            return json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    url = f"https://sigma.midt.bg/contracts/{urllib.parse.quote(cid, safe='')}.json"
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=14) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
            obj = json.loads(raw)
            if isinstance(obj, dict) and obj.get("id"):
                cpath.parent.mkdir(parents=True, exist_ok=True)
                cpath.write_text(raw, encoding="utf-8")
                return obj
        except Exception:
            time.sleep(0.25 * (attempt + 1))
    return None


def fetch_cr_deed(eik: str) -> dict[str, Any] | None:
    if not eik or not eik.isdigit() or len(eik) != 9:
        return None
    cpath = CR_DEEDS_CACHE / f"{eik}.json"
    if cpath.exists() and cpath.stat().st_size > 100:
        try:
            return json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    url = f"https://portal.registryagency.bg/CR/api/Deeds/{eik}"
    for attempt in range(3):
        try:
            time.sleep(0.35 if attempt == 0 else (3.5 * attempt))
            req = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/json"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=16) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
            obj = json.loads(raw)
            if isinstance(obj, dict) and obj.get("uic"):
                cpath.parent.mkdir(parents=True, exist_ok=True)
                cpath.write_text(raw, encoding="utf-8")
                return obj
        except urllib.error.HTTPError as he:
            if he.code == 429:
                time.sleep(15.0)
            else:
                time.sleep(1.0)
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


def clean_html_blocks(html_data: str) -> list[str]:
    if not html_data:
        return []
    out: list[str] = []
    for ch in re.split(r"<hr[^>]*>", html_data, flags=re.I):
        txt = re.sub(r"<br\s*/?>", " | ", ch, flags=re.I)
        txt = re.sub(r"<[^>]+>", " ", txt)
        txt = html.unescape(txt)
        txt = re.sub(r"\s+", " ", txt).strip(" |,;")
        if not txt or "заличено обстоятелство" in txt.lower() or "заличен действителен" in txt.lower():
            continue
        out.append(txt)
    return out


def parse_cr_deed_forensic(deed: dict[str, Any]) -> dict[str, Any]:
    eik = str(deed.get("uic") or "")
    name = deed.get("companyName") or ""
    incorp_date = ""
    has_old_court_file = False
    capital_eur: float | None = None
    capital_raw = ""
    seat_raw = ""
    seat_city = ""
    seat_street = ""
    gfo_count = 0
    managers: list[str] = []
    owners: list[str] = []
    beneficial: list[str] = []

    for sec in deed.get("sections") or []:
        for sub in sec.get("subDeeds") or []:
            if sub.get("subDeedIsClosed"):
                continue
            for grp in sub.get("groups") or []:
                for fld in grp.get("fields") or []:
                    if fld.get("fieldOperation") == 2:
                        continue
                    nc = str(fld.get("nameCode") or "")
                    hdata = str(fld.get("htmlData") or "")
                    if nc == "CR_F_1_L":
                        if "фирмено дело" in hdata.lower():
                            has_old_court_file = True
                        m_dt = fld.get("recordMinActionDate") or fld.get("fieldEntryDate") or ""
                        if m_dt and len(m_dt) >= 10:
                            incorp_date = m_dt[:10]
                    elif nc == "CR_F_31_L":
                        blks = clean_html_blocks(hdata)
                        if blks:
                            capital_raw = blks[0][:60]
                            m_num = re.search(r"([\d\s]+(?:[.,]\d+)?)", capital_raw)
                            if m_num:
                                num_val = float(m_num.group(1).replace(" ", "").replace(",", "."))
                                if "лв" in capital_raw.lower() or "bgn" in capital_raw.lower():
                                    capital_eur = round(num_val / 1.95583, 2)
                                else:
                                    capital_eur = round(num_val, 2)
                    elif nc == "CR_F_5_L":
                        blks = clean_html_blocks(hdata)
                        if blks:
                            seat_raw = blks[0][:200]
                            mc = re.search(r"Населено място:\s*([^,\|]+)", seat_raw, re.I)
                            if mc:
                                seat_city = mc.group(1).strip()
                            ms = re.search(r"(?:бул\./ул\.|ж\.к\.|ул\.|бул\.)\s*([^\|]+?)(?:Адрес на електронна|Телефон|Интернет|$)", seat_raw, re.I)
                            if ms:
                                seat_street = ms.group(1).strip(" ,.;:")
                    elif nc in ("CR_F_7_L", "CR_F_10_L", "CR_F_12_L"):
                        for b in clean_html_blocks(hdata):
                            cp = re.sub(r",?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if cp and cp not in managers:
                                managers.append(cp[:120])
                    elif nc in ("CR_F_19_L", "CR_F_23_L"):
                        for b in clean_html_blocks(hdata):
                            co = re.sub(r",?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if co and co not in owners:
                                owners.append(co[:140])
                    elif nc in ("CR_F_550_L", "CR_F_550a_L"):
                        for b in clean_html_blocks(hdata):
                            cbo = re.sub(r"\|?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if cbo and cbo not in beneficial:
                                beneficial.append(cbo[:140])
                    elif nc == "CR_F_1001_L":
                        if "годишен финансов отчет" in hdata.lower() or "гфо" in hdata.lower():
                            gfo_count += len(re.findall(r"годишен финансов отчет", hdata, flags=re.I))

    # Extract 3-word Cyrillic person names from managers/owners/beneficial (case-insensitive dedup per company!)
    people: list[str] = []
    seen_pnorm: set[str] = set()
    for s in managers + owners + beneficial:
        for m in re.finditer(r"\b([А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,25})\b", s):
            cand = m.group(1).strip()
            cn = norm_person(cand)
            if cn in seen_pnorm:
                continue
            if not any(bad in cn for bad in ("република българия", "съвет на", "населено място", "размер на", "дата на")):
                seen_pnorm.add(cn)
                people.append(cand)

    # Normalized street address key for shared-address clustering
    addr_key = ""
    if seat_city and seat_street:
        sc_norm = re.sub(r"^(?:гр\.?|с\.?)\s*", "", seat_city.lower()).strip()
        st_norm = re.sub(r"[^а-яa-z0-9]", " ", seat_street.lower())
        st_norm = re.sub(r"\b(ул|бул|жк|бл|вх|ет|ап|офис|пк|№|no|номер)\b", " ", st_norm)
        st_norm = re.sub(r"\s+", " ", st_norm).strip()
        # Require at least one digit (street number) and >= 6 chars to avoid vague city-only matches
        if len(st_norm) >= 6 and re.search(r"\d", st_norm):
            addr_key = f"{sc_norm} | {st_norm[:45]}"

    return {
        "eik": eik,
        "name": name,
        "incorpDate": incorp_date,
        "hasOldCourtFile": has_old_court_file,
        "capitalEur": capital_eur,
        "capitalRaw": capital_raw,
        "seatCity": seat_city,
        "seatStreet": seat_street,
        "addrKey": addr_key,
        "gfoCount": gfo_count,
        "managers": managers[:5],
        "owners": owners[:5],
        "beneficialOwners": beneficial[:5],
        "people": people[:8],
    }


def fetch_erik_table(endpoint: str, election_id: int, cache_name: str) -> list[dict[str, Any]]:
    cpath = ERIK_CACHE / f"{cache_name}_{election_id}.json"
    if cpath.exists() and cpath.stat().st_size > 20:
        try:
            return json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    url = f"https://erik.bulnao.government.bg/Reports/{endpoint}"
    rows: list[dict[str, Any]] = []
    start = 0
    page_len = 2500
    for _ in range(12):
        payload = urllib.parse.urlencode({
            "draw": 1, "start": start, "length": page_len,
            "electionId": election_id, "isOldSystemElection": "true",
        }).encode("utf-8")
        try:
            req = urllib.request.Request(url, data=payload, headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as resp:
                obj = json.loads(resp.read().decode("utf-8", errors="ignore"))
            batch = obj.get("data") or []
            total = int(obj.get("recordsTotal") or len(batch))
            rows.extend(batch)
            if len(rows) >= total or not batch:
                break
            start += len(batch)
        except Exception:
            break
    cpath.parent.mkdir(parents=True, exist_ok=True)
    cpath.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows


def main() -> int:
    t0 = time.time()
    print("[SIGMA 3.0 FINALITY — 7 DEEP FORENSIC ENGINES] Streaming ALL 206,907 contracts...")

    officials_json = json.loads((DATA_DIR / "officials_all.json").read_text(encoding="utf-8"))
    officials = officials_json.get("officials") or []

    # Accumulators during single O(N) pass over contracts.csv
    total_contracts = 0
    flagged_contracts: list[dict[str, Any]] = []
    top_annex_candidates: list[dict[str, Any]] = []

    # Engine 2: per-company aggregates
    comp_stats: dict[str, dict[str, Any]] = {}
    # Engine 3: Salami slicing (authority_eik, contractor_eik, sector_code)
    salami_buckets: dict[tuple[str, str, str], list[tuple[str, float, str, str, int, str, str, str]]] = defaultdict(list)
    # Engine 4: Media contracts & per-EIK contracts list (for post-donation 12-mo lookup!)
    media_contracts: list[dict[str, Any]] = []
    contracts_by_contractor_eik: dict[str, list[tuple[str, float, str]]] = defaultdict(list)
    # Engine 5: Time-Series (weekday, holiday, year-end Nov-Dec)
    weekday_stats = [{"day": d, "contracts": 0, "valueEur": 0.0, "singleOffer": 0, "directAward": 0} for d in ("Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя")]
    dec20_31_stats = {"contracts": 0, "valueEur": 0.0, "singleOffer": 0, "directAward": 0}
    friday_holiday_mega: list[dict[str, Any]] = []
    # Per-authority full-year 2021-2025 Nov-Dec vs Jan-Oct spend
    auth_yearend: dict[str, dict[str, Any]] = {}
    # Engine 6: Bid Rotation per (authority_eik, sector_code)
    market_awards: dict[tuple[str, str], list[tuple[str, str, str, float, int]]] = defaultdict(list)
    auth_names: dict[str, str] = {}
    # Engine 7: NLP Tailored Specs
    tailored_hits: list[dict[str, Any]] = []
    brand_agg: dict[str, dict[str, Any]] = defaultdict(lambda: {"brand": "", "contracts": 0, "singleOffer": 0, "valueEur": 0.0, "singleOfferEur": 0.0})

    with CONTRACTS_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_contracts += 1
            cid = row.get("id") or ""
            unp = row.get("unp") or ""
            subj = (row.get("subject") or "").strip()
            auth = (row.get("authority") or "").strip()
            aeik = (row.get("authority_eik") or "").strip()
            contr = (row.get("contractor") or "").strip()
            ceik = (row.get("contractor_eik") or "").strip()
            kind = (row.get("kind") or "").strip()
            sec = (row.get("sector_code") or "").strip()
            proc = (row.get("procedure") or "").strip()
            sdt = (row.get("signed_at") or "").strip()
            vflag = (row.get("value_flag") or "ok").strip()
            try:
                val = float(row.get("value_eur") or 0.0)
            except ValueError:
                val = 0.0
            try:
                bids = int(float(row.get("bids_received") or 0)) if row.get("bids_received") else 0
            except ValueError:
                bids = 0
            eu = row.get("eu_funded") == "1"

            if aeik and auth:
                auth_names[aeik] = auth

            is_single = (bids == 1)
            is_direct = ("пряко" in proc.lower() or "без обявление" in proc.lower() or "договаряне" in proc.lower())

            # --- Engine 1 candidates (value_flag != ok OR large construction/IT/infra contracts) ---
            if vflag and vflag != "ok":
                flagged_contracts.append({
                    "id": cid, "unp": unp, "subject": subj[:180], "authority": auth, "authorityEik": aeik,
                    "contractor": contr, "contractorEik": ceik, "sector": sec, "procedure": proc,
                    "signedAt": sdt, "valueEur": round(val, 2), "bids": bids, "valueFlag": vflag,
                })
            if val >= 4_500_000 and sdt and sdt <= "2025-12-31" and sec in ("45", "33", "72", "34", "60", "90", "09", "50"):
                top_annex_candidates.append({
                    "id": cid, "unp": unp, "subject": subj[:180], "authority": auth, "authorityEik": aeik,
                    "contractor": contr, "contractorEik": ceik, "sector": sec, "procedure": proc,
                    "signedAt": sdt, "valueEur": round(val, 2), "bids": bids, "valueFlag": vflag,
                })

            # --- Engine 2: per-company stats ---
            if ceik and ceik.isdigit() and len(ceik) == 9 and kind == "company":
                contracts_by_contractor_eik[ceik].append((sdt, val, auth))
                cs = comp_stats.get(ceik)
                if not cs:
                    cs = {
                        "eik": ceik, "name": contr, "firstSignedAt": sdt or "9999-99-99",
                        "lastSignedAt": sdt, "totalEur": 0.0, "maxEur": 0.0,
                        "contracts": 0, "singleOffer": 0, "auths": set(),
                        "topAuth": auth, "topSubj": subj[:150], "sector": sec,
                    }
                    comp_stats[ceik] = cs
                cs["totalEur"] += val
                cs["contracts"] += 1
                if is_single:
                    cs["singleOffer"] += 1
                if aeik:
                    cs["auths"].add(aeik)
                if sdt and sdt < cs["firstSignedAt"]:
                    cs["firstSignedAt"] = sdt
                if sdt and sdt > cs["lastSignedAt"]:
                    cs["lastSignedAt"] = sdt
                if val > cs["maxEur"]:
                    cs["maxEur"] = val
                    cs["topAuth"] = auth
                    cs["topSubj"] = subj[:150]

            # --- Engine 3: Salami slicing candidates ---
            # Thresholds: 138,050 EUR (270k BGN) for CPV 45 construction, 35,790 EUR (70k BGN) for services/supplies
            thr = 138_050.0 if sec == "45" else 35_790.0
            if aeik and ceik and sdt and 1500.0 <= val < thr and sec:
                salami_buckets[(aeik, ceik, sec)].append((sdt, val, cid, subj[:120], bids, proc, auth, contr))

            # --- Engine 4: Media & PR contracts ---
            if val >= 2000 and (sec in ("79", "22", "92") or MEDIA_KW_RE.search(subj)):
                if MEDIA_KW_RE.search(subj) and not MEDIA_EXCLUDE_RE.search(f"{subj} {contr}"):
                    media_contracts.append({
                        "id": cid, "unp": unp, "subject": subj[:170], "authority": auth, "authorityEik": aeik,
                        "contractor": contr, "contractorEik": ceik, "signedAt": sdt,
                        "valueEur": round(val, 2), "bids": bids, "procedure": proc, "eu": eu,
                    })

            # --- Engine 5: Time-Series Forensics ---
            dt_obj = parse_date(sdt)
            if dt_obj and 2020 <= dt_obj.year <= 2026:
                wd = dt_obj.weekday()
                wrow = weekday_stats[wd]
                wrow["contracts"] += 1
                wrow["valueEur"] += val
                if is_single:
                    wrow["singleOffer"] += 1
                if is_direct:
                    wrow["directAward"] += 1

                is_dec_dump = (dt_obj.month == 12 and dt_obj.day >= 20)
                if is_dec_dump:
                    dec20_31_stats["contracts"] += 1
                    dec20_31_stats["valueEur"] += val
                    if is_single:
                        dec20_31_stats["singleOffer"] += 1
                    if is_direct:
                        dec20_31_stats["directAward"] += 1

                if val >= 1_500_000 and (is_single or is_direct) and (wd >= 4 or is_dec_dump):
                    tag = "20–31 декември" if is_dec_dump else ("Уикенд" if wd >= 5 else "Петък")
                    friday_holiday_mega.append({
                        "id": cid, "signedAt": sdt, "dayTag": tag, "authority": auth, "authorityEik": aeik,
                        "contractor": contr, "contractorEik": ceik, "valueEur": round(val, 2),
                        "bids": bids, "procedure": proc, "subject": subj[:150],
                    })

                # Year-End Budget Dumping Index (strictly completed years 2021-2025 to prevent 2026 Nov bias!)
                if aeik and 2021 <= dt_obj.year <= 2025:
                    ye = auth_yearend.get(aeik)
                    if not ye:
                        ye = {
                            "eik": aeik, "name": auth, "totalEur": 0.0, "totalCnt": 0,
                            "ndEur": 0.0, "ndCnt": 0, "ndDirect": 0, "restDirect": 0, "ndSingle": 0,
                        }
                        auth_yearend[aeik] = ye
                    ye["totalEur"] += val
                    ye["totalCnt"] += 1
                    if dt_obj.month in (11, 12):
                        ye["ndEur"] += val
                        ye["ndCnt"] += 1
                        if is_direct:
                            ye["ndDirect"] += 1
                        if is_single:
                            ye["ndSingle"] += 1
                    else:
                        if is_direct:
                            ye["restDirect"] += 1

            # --- Engine 6: Bid Rotation markets ---
            if aeik and ceik and sec and sdt and val >= 5000:
                market_awards[(aeik, sec)].append((sdt, ceik, contr, val, bids))

            # --- Engine 7: NLP Tailored Specs scan ---
            if val >= 25_000 and subj:
                has_equiv = bool(EQUIV_RE.search(subj))
                matched_brands = []
                for b_name, b_re in BRAND_PATTERNS:
                    if b_re.search(subj):
                        matched_brands.append(b_name)
                        ba = brand_agg[b_name]
                        ba["brand"] = b_name
                        ba["contracts"] += 1
                        ba["valueEur"] += val
                        if is_single:
                            ba["singleOffer"] += 1
                            ba["singleOfferEur"] += val

                matched_flags = []
                nlp_score = 0
                if matched_brands:
                    nlp_score += 32 if not has_equiv else 12
                    matched_flags.extend([f"Марка: {b}" for b in matched_brands[:2]])
                for fl_lbl, fl_re, fl_pts in RESTRICTIVE_PHRASES:
                    if fl_re.search(subj):
                        nlp_score += fl_pts
                        matched_flags.append(fl_lbl)
                m_codes = MODEL_CODE_RE.findall(subj)
                if m_codes and not has_equiv:
                    nlp_score += 12
                    matched_flags.append(f"Модел: {m_codes[0]}")

                if matched_flags:
                    if is_single:
                        nlp_score += 22
                    if is_direct:
                        nlp_score += 15
                    if not has_equiv and matched_brands:
                        nlp_score += 10
                    nlp_score = min(100, nlp_score)
                    if nlp_score >= 52 and (is_single or is_direct or val >= 250_000):
                        tailored_hits.append({
                            "id": cid, "unp": unp, "signedAt": sdt, "authority": auth, "authorityEik": aeik,
                            "contractor": contr, "contractorEik": ceik, "sector": sec, "procedure": proc,
                            "bids": bids, "valueEur": round(val, 2), "score": nlp_score,
                            "flags": matched_flags[:4], "hasEquiv": has_equiv, "subject": subj[:220],
                        })

    print(f"    Streamed {total_contracts:,} contracts in {time.time() - t0:.1f}s.")

    # =========================================================================
    # FINALIZE ENGINE 1: POST-AWARD INFLATION (LIVE /contracts/{id}.json ANNEXES)
    # =========================================================================
    print("[1/7] Fetching LIVE contract JSONs for annex & post-award inflation verification...")
    top_annex_candidates.sort(key=lambda x: x["valueEur"], reverse=True)
    # Deduplicate probe list: all flagged contracts (up to 60) + top 130 mega contracts
    probe_ids: list[str] = []
    seen_pids: set[str] = set()
    for item in flagged_contracts[:60] + top_annex_candidates[:130]:
        if item["id"] and item["id"] not in seen_pids:
            seen_pids.add(item["id"])
            probe_ids.append(item["id"])

    inflated_contracts: list[dict[str, Any]] = []
    annex_checked = 0
    annex_with_amendments = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for obj in ex.map(fetch_contract_json, probe_ids):
            if not obj:
                continue
            annex_checked += 1
            v = obj.get("value") or {}
            sign_eur = float(v.get("signingEur") or 0.0)
            curr_eur = float(v.get("currentEur") or 0.0)
            est_eur = float(v.get("estimatedEur") or 0.0)
            amends = obj.get("amendments") or []
            if amends:
                annex_with_amendments += 1
            delta_eur = round(curr_eur - sign_eur, 2) if sign_eur > 0 and curr_eur > 0 else 0.0
            delta_pct = round((delta_eur / sign_eur) * 100, 1) if sign_eur > 0 and delta_eur != 0 else 0.0
            # Include if real post-award annex inflation OR suspect flag OR amendments present
            if delta_eur > 1000 or amends or v.get("suspect") or (v.get("flag") and v.get("flag") != "ok"):
                inflated_contracts.append({
                    "id": obj.get("id") or "",
                    "unp": obj.get("unp") or "",
                    "signedAt": obj.get("signedAt") or "",
                    "authority": (obj.get("authority") or {}).get("name") or "",
                    "authorityEik": (obj.get("authority") or {}).get("eik") or "",
                    "contractor": (obj.get("bidder") or {}).get("name") or "",
                    "contractorEik": (obj.get("bidder") or {}).get("eik") or "",
                    "subject": (obj.get("subject") or "")[:190],
                    "procedure": obj.get("procedureLabel") or "",
                    "bids": obj.get("bidsReceived"),
                    "estimatedEur": round(est_eur, 2),
                    "signingEur": round(sign_eur, 2),
                    "currentEur": round(curr_eur, 2),
                    "inflationEur": delta_eur,
                    "inflationPct": delta_pct,
                    "amendmentCount": len(amends),
                    "amendments": [
                        {"date": a.get("date") or "", "deltaEur": round(float(a.get("deltaEur") or 0), 2), "valueAfterEur": round(float(a.get("valueAfterEur") or 0), 2), "suspect": bool(a.get("suspect"))}
                        for a in amends[:6]
                    ],
                    "valueFlag": v.get("flag") or "ok",
                    "suspect": bool(v.get("suspect")),
                })

    inflated_contracts.sort(key=lambda x: (x["inflationEur"] > 0, x["inflationEur"], x["amendmentCount"], x["currentEur"]), reverse=True)
    flag_counts = Counter(x["valueFlag"] for x in flagged_contracts)
    print(f"    Engine 1: Probed {annex_checked} live contracts -> {len(inflated_contracts)} with annexes/inflation/flags ({annex_with_amendments} have amendments).")

    # =========================================================================
    # FINALIZE ENGINE 2: SHELL & NEWLY-FORMED COMPANIES (LIVE COMMERCIAL REGISTER)
    # =========================================================================
    print("[2/7] Checking Top 35 newly-formed high-value winners (EIK 206xxx–208xxx) against LIVE Commercial Register...")
    shell_candidates = [
        cs for cs in comp_stats.values()
        if "206000000" <= cs["eik"] <= "209999999" and cs["totalEur"] >= 400_000 and cs["firstSignedAt"] != "9999-99-99"
    ]
    # Prioritize newest EIKs (207/208, founded 2022–2026) + highest won EUR
    shell_candidates.sort(key=lambda x: (x["eik"] >= "207000000", x["totalEur"]), reverse=True)

    shell_verified: list[dict[str, Any]] = []
    cr_parsed_all: dict[str, dict[str, Any]] = {}

    # Also load all already-cached CR deeds for Engine 4 & Engine 6!
    if CR_DEEDS_CACHE.exists():
        for fp in CR_DEEDS_CACHE.glob("*.json"):
            try:
                d_obj = json.loads(fp.read_text(encoding="utf-8"))
                p_info = parse_cr_deed_forensic(d_obj)
                if p_info["eik"]:
                    cr_parsed_all[p_info["eik"]] = p_info
            except Exception:
                pass

    for cand in shell_candidates[:35]:
        deed = fetch_cr_deed(cand["eik"])
        if not deed:
            continue
        info = parse_cr_deed_forensic(deed)
        cr_parsed_all[cand["eik"]] = info
        if info["hasOldCourtFile"] or not info["incorpDate"]:
            continue
        d_inc = parse_date(info["incorpDate"])
        d_first = parse_date(cand["firstSignedAt"])
        if not d_inc or not d_first:
            continue
        days_to_win = (d_first - d_inc).days
        if days_to_win < -90:
            # Re-registration date artifact, skip
            continue
        cap = info["capitalEur"]
        so_share = round((cand["singleOffer"] / max(1, cand["contracts"])) * 100, 1)
        won_to_cap = round(cand["totalEur"] / cap, 0) if (cap is not None and cap > 0) else None

        s_score = 0
        if days_to_win <= 180:
            s_score += 35
        elif days_to_win <= 365:
            s_score += 25
        elif days_to_win <= 730:
            s_score += 14
        if cap is not None:
            if cap <= 60:
                s_score += 25
            elif cap <= 600:
                s_score += 15
            elif cap <= 3000:
                s_score += 8
        if info["gfoCount"] == 0:
            s_score += 15
        elif info["gfoCount"] == 1:
            s_score += 7
        if so_share >= 75:
            s_score += 15
        elif so_share >= 40:
            s_score += 7
        if cand["totalEur"] >= 2_000_000:
            s_score += 10
        s_score = min(100, s_score)

        if days_to_win <= 730 or (cap is not None and cap <= 600 and cand["totalEur"] >= 1_000_000):
            shell_verified.append({
                "eik": cand["eik"],
                "name": cand["name"],
                "incorpDate": info["incorpDate"],
                "firstContractDate": cand["firstSignedAt"],
                "daysToFirstContract": max(0, days_to_win),
                "capitalEur": cap,
                "capitalRaw": info["capitalRaw"],
                "wonToCapitalRatio": won_to_cap,
                "gfoCount": info["gfoCount"],
                "totalEur": round(cand["totalEur"], 2),
                "contracts": cand["contracts"],
                "authorities": len(cand["auths"]),
                "singleOfferPct": so_share,
                "topAuthority": cand["topAuth"],
                "topSubject": cand["topSubj"],
                "seatCity": info["seatCity"],
                "owners": info["owners"][:2],
                "managers": info["managers"][:2],
                "shellScore": s_score,
            })

    shell_verified.sort(key=lambda x: (x["shellScore"], x["totalEur"]), reverse=True)
    print(f"    Engine 2: Verified {len(shell_verified)} newly-formed / low-capital winners from live CR.")

    # =========================================================================
    # FINALIZE ENGINE 3: SALAMI SLICING (60-DAY THRESHOLD SPLITTING)
    # =========================================================================
    print("[3/7] Running 60-day sliding-window Salami-Slicing detector across all 206,907 contracts...")
    salami_clusters: list[dict[str, Any]] = []
    for (aeik, ceik, sec), items in salami_buckets.items():
        if len(items) < 3:
            continue
        thr = 138_050.0 if sec == "45" else 35_790.0
        # Parse dates and sort chronologically
        dated = []
        for it in items:
            d_o = parse_date(it[0])
            if d_o:
                dated.append((d_o, it))
        if len(dated) < 3:
            continue
        dated.sort(key=lambda x: x[0])

        # Find best non-overlapping 60-day window that crosses threshold
        best_win = None
        i = 0
        n = len(dated)
        while i < n:
            j = i
            win_sum = 0.0
            while j < n and (dated[j][0] - dated[i][0]).days <= 60:
                win_sum += dated[j][1][1]
                j += 1
            win_cnt = j - i
            if win_cnt >= 3 and win_sum >= thr:
                span_days = (dated[j - 1][0] - dated[i][0]).days
                if not best_win or win_sum > best_win["totalEur"]:
                    slice_items = [x[1] for x in dated[i:j]]
                    so_c = sum(1 for x in slice_items if x[4] == 1)
                    dir_c = sum(1 for x in slice_items if "пряко" in x[5].lower() or "събиране" in x[5].lower())
                    best_win = {
                        "authorityEik": aeik,
                        "authority": slice_items[0][6],
                        "contractorEik": ceik,
                        "contractor": slice_items[0][7],
                        "sector": sec,
                        "thresholdEur": thr,
                        "contractCount": win_cnt,
                        "spanDays": span_days,
                        "startDate": slice_items[0][0],
                        "endDate": slice_items[-1][0],
                        "totalEur": round(win_sum, 2),
                        "maxSingleEur": round(max(x[1] for x in slice_items), 2),
                        "singleOfferCount": so_c,
                        "nonOpenCount": dir_c,
                        "isPharma": (sec == "33"),
                        "thresholdRatio": round(win_sum / thr, 2),
                        "samples": [
                            {"id": x[2], "date": x[0], "valueEur": round(x[1], 2), "subject": x[3], "bids": x[4]}
                            for x in slice_items[:4]
                        ],
                    }
            i += 1
        if best_win:
            salami_clusters.append(best_win)

    # Sort prioritizing non-pharma (construction/services/IT/maintenance) + high threshold ratio + short span
    salami_non_pharma = sorted(
        [s for s in salami_clusters if not s["isPharma"]],
        key=lambda x: (x["nonOpenCount"] > 0, x["totalEur"], x["contractCount"]),
        reverse=True,
    )
    salami_pharma_cnt = sum(1 for s in salami_clusters if s["isPharma"])
    print(f"    Engine 3: Found {len(salami_clusters)} total salami clusters ({len(salami_non_pharma)} non-pharma, {salami_pharma_cnt} pharma).")

    # =========================================================================
    # FINALIZE ENGINE 4: POLITICAL DONATIONS & MEDIA PAYMENTS (BULNAO ERIK x EOP)
    # =========================================================================
    print("[4/7] Fetching live political donors & party PR/media agencies from erik.bulnao.government.bg (2023-2026)...")
    all_donors: list[dict[str, Any]] = []
    all_party_agencies: list[dict[str, Any]] = []
    for eid, elabel, edate in ERIK_ELECTIONS:
        d_rows = fetch_erik_table("GetDonorsByElectionId", eid, "donors")
        a_rows = fetch_erik_table("GetAgencies", eid, "agencies")
        for r in d_rows:
            fn = (r.get("fullName") or "").strip()
            if not fn:
                continue
            amt = float(r.get("donationPrice") or 0.0) + float(r.get("donationValue") or 0.0)
            ddt = str(r.get("donationDate") or edate)[:10]
            link_raw = r.get("declarationLink") or ""
            m_href = re.search(r"href=['\"]([^'\"]+)['\"]", link_raw)
            decl_url = f"https://erik.bulnao.government.bg{m_href.group(1)}" if m_href else f"https://erik.bulnao.government.bg/Reports/Donation?electionId={eid}"
            all_donors.append({
                "donor": re.sub(r"\s+", " ", fn),
                "donorNorm": norm_person(fn),
                "party": (r.get("donateTo") or "").strip(),
                "date": ddt,
                "amountBgn": round(amt, 2),
                "election": elabel,
                "electionId": eid,
                "declUrl": decl_url,
            })
        for r in a_rows:
            ae = (r.get("eik") or "").strip()
            if not ae:
                continue
            all_party_agencies.append({
                "eik": ae,
                "name": (r.get("name") or "").strip(),
                "agencyType": (r.get("typeOfAgency") or "").strip(),
                "party": (r.get("participant") or "").strip(),
                "election": elabel,
                "electionDate": edate,
                "electionId": eid,
            })

    # Cross-Match A: Party PR/Media Agencies (ERIK) -> Public Procurement Contracts (contracts.csv)!
    party_agency_by_eik: dict[str, dict[str, Any]] = {}
    for ag in all_party_agencies:
        ae = ag["eik"]
        if ae not in comp_stats:
            continue
        rec = party_agency_by_eik.get(ae)
        if not rec:
            cs = comp_stats[ae]
            rec = {
                "eik": ae,
                "name": cs["name"],
                "agencyTypes": set(),
                "parties": set(),
                "elections": set(),
                "earliestElectionDate": ag["electionDate"],
                "totalWonEur": round(cs["totalEur"], 2),
                "contracts": cs["contracts"],
                "authorities": len(cs["auths"]),
                "singleOfferPct": round((cs["singleOffer"] / max(1, cs["contracts"])) * 100, 1),
                "topAuthority": cs["topAuth"],
                "postElection12mEur": 0.0,
                "postElection12mCnt": 0,
            }
            party_agency_by_eik[ae] = rec
        rec["agencyTypes"].add(ag["agencyType"])
        rec["parties"].add(ag["party"])
        rec["elections"].add(ag["election"])
        if ag["electionDate"] < rec["earliestElectionDate"]:
            rec["earliestElectionDate"] = ag["electionDate"]

    party_agencies_matched = []
    for ae, rec in party_agency_by_eik.items():
        # Compute contracts won within 12 months after earliest party hire
        ed = parse_date(rec["earliestElectionDate"])
        if ed:
            for sdt, val, _ in contracts_by_contractor_eik.get(ae, []):
                cd = parse_date(sdt)
                if cd and 0 <= (cd - ed).days <= 365:
                    rec["postElection12mEur"] += val
                    rec["postElection12mCnt"] += 1
        party_agencies_matched.append({
            "eik": rec["eik"],
            "name": rec["name"],
            "agencyTypes": sorted(rec["agencyTypes"]),
            "parties": sorted(rec["parties"])[:5],
            "electionsCount": len(rec["elections"]),
            "totalWonEur": rec["totalWonEur"],
            "postElection12mEur": round(rec["postElection12mEur"], 2),
            "postElection12mCnt": rec["postElection12mCnt"],
            "contracts": rec["contracts"],
            "authorities": rec["authorities"],
            "singleOfferPct": rec["singleOfferPct"],
            "topAuthority": rec["topAuthority"],
        })
    party_agencies_matched.sort(key=lambda x: x["totalWonEur"], reverse=True)

    # Cross-Match B: Political Party Donors -> SIGMA 571 Officials + Relatives + CR Owners/Managers!
    person_to_links: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for o in officials:
        pn = norm_person(o["name"])
        if len(pn.split()) >= 2:
            person_to_links[pn].append({
                "kind": "Длъжностно лице (СИГМА)",
                "slug": o["slug"], "name": o["name"], "inst": o["primaryInstitution"],
                "eiks": [c["eik"] for c in (o.get("companies") or []) if c.get("eik")],
                "companyNames": [c["name"] for c in (o.get("companies") or [])[:2]],
                "totalEur": o["totalEur"],
            })
        for rel in (o.get("relatives") or []):
            rn = norm_person(rel.get("name") or "")
            if len(rn.split()) >= 3:
                person_to_links[rn].append({
                    "kind": f"Роднина на {o['name']}",
                    "slug": o["slug"], "name": rel["name"], "inst": o["primaryInstitution"],
                    "eiks": [c["eik"] for c in (o.get("companies") or []) if c.get("eik")],
                    "companyNames": [c["name"] for c in (o.get("companies") or [])[:2]],
                    "totalEur": o["totalEur"],
                })
    for eik, cinfo in cr_parsed_all.items():
        if eik not in comp_stats:
            continue
        cs = comp_stats[eik]
        for p in cinfo["people"]:
            pn = norm_person(p)
            if len(pn.split()) >= 3:
                person_to_links[pn].append({
                    "kind": "Собственик / Управител (ТР)",
                    "slug": "", "name": p, "inst": cs["name"],
                    "eiks": [eik], "companyNames": [cs["name"]],
                    "totalEur": round(cs["totalEur"], 2),
                })

    donor_procurement_hits: list[dict[str, Any]] = []
    seen_dh: set[tuple[str, str, str]] = set()
    for d in all_donors:
        # Strict 3-name exact match to ensure ZERO homonym false positives!
        if len(d["donorNorm"].split()) < 3:
            continue
        links = person_to_links.get(d["donorNorm"])
        if not links:
            continue
        d_dt = parse_date(d["date"])
        for lk in links:
            hk = (d["donorNorm"], d["party"], lk["companyNames"][0] if lk["companyNames"] else lk["inst"])
            if hk in seen_dh:
                continue
            seen_dh.add(hk)
            post12_eur = 0.0
            post12_cnt = 0
            if d_dt:
                for ce in lk["eiks"]:
                    for sdt, val, _ in contracts_by_contractor_eik.get(ce, []):
                        cd = parse_date(sdt)
                        if cd and 0 <= (cd - d_dt).days <= 365:
                            post12_eur += val
                            post12_cnt += 1
            donor_procurement_hits.append({
                "donor": d["donor"],
                "party": d["party"],
                "donationDate": d["date"],
                "donationBgn": d["amountBgn"],
                "election": d["election"],
                "declUrl": d["declUrl"],
                "matchKind": lk["kind"],
                "slug": lk["slug"],
                "institution": lk["inst"],
                "companies": lk["companyNames"],
                "companyEiks": lk["eiks"][:2],
                "totalWonEur": round(lk["totalEur"], 2),
                "post12mEur": round(post12_eur, 2),
                "post12mCnt": post12_cnt,
            })
    donor_procurement_hits.sort(key=lambda x: (x["post12mEur"] > 0, x["post12mEur"], x["totalWonEur"], x["donationBgn"]), reverse=True)

    # Cross-Match C: Media Payments Aggregation
    media_by_recipient: dict[str, dict[str, Any]] = {}
    media_by_authority: dict[str, dict[str, Any]] = {}
    for mc in media_contracts:
        rk = mc["contractorEik"] or mc["contractor"]
        mr = media_by_recipient.get(rk)
        if not mr:
            mr = {"eik": mc["contractorEik"], "name": mc["contractor"], "eur": 0.0, "contracts": 0, "singleOffer": 0, "auths": set(), "partyClient": mc["contractorEik"] in party_agency_by_eik}
            media_by_recipient[rk] = mr
        mr["eur"] += mc["valueEur"]
        mr["contracts"] += 1
        if mc["bids"] == 1:
            mr["singleOffer"] += 1
        mr["auths"].add(mc["authority"])

        ak = mc["authorityEik"] or mc["authority"]
        ma = media_by_authority.get(ak)
        if not ma:
            ma = {"eik": mc["authorityEik"], "name": mc["authority"], "eur": 0.0, "contracts": 0, "singleOffer": 0}
            media_by_authority[ak] = ma
        ma["eur"] += mc["valueEur"]
        ma["contracts"] += 1
        if mc["bids"] == 1:
            ma["singleOffer"] += 1

    top_media_recipients = sorted(
        [{"eik": v["eik"], "name": v["name"], "eur": round(v["eur"], 2), "contracts": v["contracts"], "authorities": len(v["auths"]), "singleOfferPct": round(v["singleOffer"] / max(1, v["contracts"]) * 100, 1), "partyClient": v["partyClient"]} for v in media_by_recipient.values()],
        key=lambda x: x["eur"], reverse=True,
    )[:35]
    top_media_payers = sorted(
        [{"eik": v["eik"], "name": v["name"], "eur": round(v["eur"], 2), "contracts": v["contracts"], "singleOfferPct": round(v["singleOffer"] / max(1, v["contracts"]) * 100, 1)} for v in media_by_authority.values()],
        key=lambda x: x["eur"], reverse=True,
    )[:25]
    media_contracts.sort(key=lambda x: x["valueEur"], reverse=True)
    print(f"    Engine 4: Loaded {len(all_donors):,} ERIK donors & {len(all_party_agencies):,} party PR agencies -> {len(party_agencies_matched)} party agencies won public procurement, {len(donor_procurement_hits)} exact 3-name donor matches, {len(media_contracts):,} media contracts.")

    # =========================================================================
    # FINALIZE ENGINE 5: TIME-SERIES FORENSICS (FRIDAY / HOLIDAY / NOV-DEC DUMP)
    # =========================================================================
    print("[5/7] Finalizing Time-Series Forensics (Day-of-week, Dec 20-31, Year-End Dumping)...")
    for w in weekday_stats:
        w["valueEur"] = round(w["valueEur"], 2)
        w["singleOfferPct"] = round((w["singleOffer"] / max(1, w["contracts"])) * 100, 1)
        w["directAwardPct"] = round((w["directAward"] / max(1, w["contracts"])) * 100, 1)
    dec20_31_stats["valueEur"] = round(dec20_31_stats["valueEur"], 2)
    dec20_31_stats["singleOfferPct"] = round((dec20_31_stats["singleOffer"] / max(1, dec20_31_stats["contracts"])) * 100, 1)
    friday_holiday_mega.sort(key=lambda x: x["valueEur"], reverse=True)

    yearend_dumpers = []
    for ye in auth_yearend.values():
        if ye["totalEur"] < 1_500_000 or ye["totalCnt"] < 15 or ye["ndCnt"] < 4:
            continue
        nd_share = (ye["ndEur"] / ye["totalEur"]) * 100.0
        rest_eur = ye["totalEur"] - ye["ndEur"]
        # Monthly average ratio: (ndEur / 2) / (restEur / 10) = 5 * ndEur / restEur
        surge = (5.0 * ye["ndEur"] / rest_eur) if rest_eur > 10_000 else 10.0
        if nd_share >= 32.0:
            yearend_dumpers.append({
                "eik": ye["eik"], "name": ye["name"],
                "totalEur": round(ye["totalEur"], 2),
                "novDecEur": round(ye["ndEur"], 2),
                "novDecSharePct": round(nd_share, 1),
                "surgeRatio": round(surge, 2),
                "novDecCnt": ye["ndCnt"], "totalCnt": ye["totalCnt"],
                "novDecSinglePct": round((ye["ndSingle"] / max(1, ye["ndCnt"])) * 100, 1),
                "novDecDirectPct": round((ye["ndDirect"] / max(1, ye["ndCnt"])) * 100, 1),
            })
    yearend_dumpers.sort(key=lambda x: (x["novDecSharePct"], x["novDecEur"]), reverse=True)
    print(f"    Engine 5: {len(yearend_dumpers)} authorities dump >=32% of 2021-2025 budget in Nov-Dec; {len(friday_holiday_mega)} Friday/Dec20-31 mega-contracts.")

    # =========================================================================
    # FINALIZE ENGINE 6: BID ROTATION RINGS + SHARED CR ADDRESS / MANAGER GRAPH
    # =========================================================================
    print("[6/7] Running Bid Rotation Detector & Commercial Register Shared-Address/Person Clustering...")
    rotation_rings: list[dict[str, Any]] = []
    for (aeik, sec), awards in market_awards.items():
        if len(awards) < 10:
            continue
        awards.sort(key=lambda x: x[0])
        c_cnt = Counter(a[1] for a in awards)
        if len(c_cnt) < 2:
            continue
        top4 = c_cnt.most_common(4)
        # Require at least 2 firms in ring with >=3 wins each
        ring_members = [(eik, cnt) for eik, cnt in top4 if cnt >= 3]
        if len(ring_members) < 2:
            continue
        ring_eiks = {e for e, _ in ring_members}
        ring_awards = [a for a in awards if a[1] in ring_eiks]
        ring_share = len(ring_awards) / len(awards)
        if ring_share < 0.72:
            continue
        # Ensure it's a ring (rotation), NOT a single-firm 95% monopoly
        top1_share = ring_members[0][1] / len(awards)
        if top1_share > 0.68:
            continue
        # Alternation rate inside the ring
        switches = 0
        for idx in range(1, len(ring_awards)):
            if ring_awards[idx][1] != ring_awards[idx - 1][1]:
                switches += 1
        alt_rate = switches / max(1, len(ring_awards) - 1)
        if alt_rate < 0.42:
            continue
        priced_bids = [a[4] for a in ring_awards if a[4] > 0]
        avg_bids = round(sum(priced_bids) / len(priced_bids), 2) if priced_bids else 0.0
        ring_eur = sum(a[3] for a in ring_awards)
        if ring_eur < 150_000:
            continue

        # Deterministic Bid Rotation Score (0-100)
        rot_score = min(100, int(round(
            ring_share * 32 + alt_rate * 32 + (20 if 0 < avg_bids <= 1.5 else (12 if avg_bids <= 2.2 else 4)) + (16 if ring_eur >= 2_000_000 else (10 if ring_eur >= 500_000 else 5))
        )))
        eik_to_name = {a[1]: a[2] for a in ring_awards}
        eik_to_eur = defaultdict(float)
        for a in ring_awards:
            eik_to_eur[a[1]] += a[3]
        # Compact last-10 sequence codes (A, B, C, D)
        code_map = {e: chr(65 + i) for i, (e, _) in enumerate(ring_members)}
        seq = "".join(code_map[a[1]] for a in ring_awards[-14:])
        rotation_rings.append({
            "authorityEik": aeik,
            "authority": auth_names.get(aeik, aeik),
            "sector": sec,
            "totalContracts": len(awards),
            "ringContracts": len(ring_awards),
            "ringSharePct": round(ring_share * 100, 1),
            "alternationPct": round(alt_rate * 100, 1),
            "avgBids": avg_bids,
            "ringEur": round(ring_eur, 2),
            "rotationScore": rot_score,
            "sequence": seq,
            "members": [
                {"code": code_map[e], "eik": e, "name": eik_to_name.get(e, e), "wins": cnt, "eur": round(eik_to_eur[e], 2)}
                for e, cnt in ring_members
            ],
        })
    rotation_rings.sort(key=lambda x: (x["rotationScore"], x["ringEur"]), reverse=True)

    # Also fetch CR deeds for top 25 bid-rotation ring companies (not already cached) to enrich shared-address/person graph!
    rot_eiks_to_fetch = []
    for rr in rotation_rings[:15]:
        for m in rr["members"]:
            if m["eik"] not in cr_parsed_all and m["eik"] not in rot_eiks_to_fetch:
                rot_eiks_to_fetch.append(m["eik"])
    for eik in rot_eiks_to_fetch[:25]:
        deed = fetch_cr_deed(eik)
        if deed:
            cr_parsed_all[eik] = parse_cr_deed_forensic(deed)

    # Shared Address & Shared Person Clusters across ALL parsed CR deeds
    by_addr: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_person: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for eik, cinfo in cr_parsed_all.items():
        cs = comp_stats.get(eik)
        won_e = round(cs["totalEur"], 2) if cs else 0.0
        cnt_c = cs["contracts"] if cs else 0
        if cinfo["addrKey"]:
            by_addr[cinfo["addrKey"]].append({"eik": eik, "name": cinfo["name"], "wonEur": won_e, "contracts": cnt_c, "seat": f"{cinfo['seatCity']}, {cinfo['seatStreet']}"})
        for p in cinfo["people"]:
            pn = norm_person(p)
            if len(pn.split()) >= 3:
                by_person[pn].append({"person": p, "eik": eik, "name": cinfo["name"], "wonEur": won_e, "contracts": cnt_c})

    shared_addresses = sorted(
        [{"address": items[0]["seat"], "companyCount": len(items), "combinedEur": round(sum(x["wonEur"] for x in items), 2), "companies": items} for items in by_addr.values() if len(items) >= 2],
        key=lambda x: (x["companyCount"], x["combinedEur"]), reverse=True,
    )[:30]
    shared_persons = sorted(
        [{"person": items[0]["person"], "companyCount": len(items), "combinedEur": round(sum(x["wonEur"] for x in items), 2), "companies": items} for items in by_person.values() if len(items) >= 2],
        key=lambda x: (x["companyCount"], x["combinedEur"]), reverse=True,
    )[:30]
    print(f"    Engine 6: {len(rotation_rings)} bid-rotation rings; {len(cr_parsed_all)} CR deeds analyzed -> {len(shared_addresses)} shared addresses, {len(shared_persons)} shared CR persons.")

    # =========================================================================
    # FINALIZE ENGINE 7: NLP TAILORED SPECS ("ШИТИ" ПОРЪЧКИ)
    # =========================================================================
    print("[7/7] Finalizing NLP Tailored-Specs Leaderboard...")
    tailored_hits.sort(key=lambda x: (x["score"], x["valueEur"]), reverse=True)
    brand_leaderboard = sorted(
        [
            {
                "brand": b["brand"], "contracts": b["contracts"], "singleOffer": b["singleOffer"],
                "singleOfferPct": round((b["singleOffer"] / max(1, b["contracts"])) * 100, 1),
                "valueEur": round(b["valueEur"], 2), "singleOfferEur": round(b["singleOfferEur"], 2),
            }
            for b in brand_agg.values() if b["contracts"] >= 2
        ],
        key=lambda x: x["singleOfferEur"], reverse=True,
    )[:25]

    out_payload = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "contractsScanned": total_contracts,
        "engine1_annexInflation": {
            "probedCount": annex_checked,
            "withAmendmentsCount": annex_with_amendments,
            "totalFlaggedInCorpus": len(flagged_contracts),
            "flagCounts": dict(flag_counts),
            "totalInflationEur": round(sum(x["inflationEur"] for x in inflated_contracts if x["inflationEur"] > 0), 2),
            "contracts": inflated_contracts[:80],
        },
        "engine2_shellCompanies": {
            "crDeedsAnalyzed": len(cr_parsed_all),
            "verifiedShellCount": len(shell_verified),
            "totalShellEur": round(sum(x["totalEur"] for x in shell_verified), 2),
            "companies": shell_verified[:60],
        },
        "engine3_salamiSlicing": {
            "totalClusters": len(salami_clusters),
            "nonPharmaClusters": len(salami_non_pharma),
            "pharmaClusters": salami_pharma_cnt,
            "nonPharmaTotalEur": round(sum(x["totalEur"] for x in salami_non_pharma), 2),
            "clusters": salami_non_pharma[:80],
        },
        "engine4_politicsAndMedia": {
            "electionsScanned": len(ERIK_ELECTIONS),
            "donorsIndexed": len(all_donors),
            "partyAgenciesIndexed": len(all_party_agencies),
            "partyAgenciesWinningProcurement": len(party_agencies_matched),
            "partyAgenciesTotalEur": round(sum(x["totalWonEur"] for x in party_agencies_matched), 2),
            "donorExactMatchesCount": len(donor_procurement_hits),
            "mediaContractsCount": len(media_contracts),
            "mediaTotalEur": round(sum(x["valueEur"] for x in media_contracts), 2),
            "mediaSingleOfferPct": round(sum(1 for m in media_contracts if m["bids"] == 1) / max(1, len(media_contracts)) * 100, 1),
            "partyAgencies": party_agencies_matched[:50],
            "donorMatches": donor_procurement_hits[:60],
            "topMediaRecipients": top_media_recipients,
            "topMediaPayers": top_media_payers,
            "topMediaContracts": media_contracts[:40],
        },
        "engine5_timeForensics": {
            "weekdays": weekday_stats,
            "dec20_31": dec20_31_stats,
            "yearendDumpersCount": len(yearend_dumpers),
            "yearendDumpers": yearend_dumpers[:50],
            "fridayHolidayMega": friday_holiday_mega[:50],
        },
        "engine6_cartelGraphs": {
            "rotationRingsCount": len(rotation_rings),
            "rotationRings": rotation_rings[:50],
            "sharedAddressesCount": len(shared_addresses),
            "sharedAddresses": shared_addresses,
            "sharedPersonsCount": len(shared_persons),
            "sharedPersons": shared_persons,
        },
        "engine7_nlpTailoredSpecs": {
            "totalHighRiskSpecs": len(tailored_hits),
            "totalHighRiskEur": round(sum(x["valueEur"] for x in tailored_hits), 2),
            "brandLeaderboard": brand_leaderboard,
            "topTailoredContracts": tailored_hits[:100],
        },
    }

    out_path = DATA_DIR / "sigma3_forensics_7.json"
    out_path.write_text(json.dumps(out_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nALL 7 DEEP FORENSIC ENGINES COMPILED in {time.time() - t0:.1f}s -> {out_path} ({out_path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
