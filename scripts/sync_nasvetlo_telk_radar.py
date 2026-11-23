#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NAsvetlo — Official 28-Oblast TELK / Disability Pension Forensic Anomaly Engine
Source datasets (100% official public aggregate statistics, zero PII, GDPR Art. 9 compliant):
  1. НОИ (noi.bg) — Статистически годишници „Пенсии“ 2023, 2024, 2025
     (Раздел 9: Пенсии по ТП на НОИ — Табл. 9.1, 9.2, 9.3, 9.4, 9.7, 9.9, 9.10)
  2. НСИ (nsi.bg) — Население по области и общини към 31.12.2023, 31.12.2024, 31.12.2025
     (Pop_6.1.1_Pop_DR.xlsx)
  3. ЦАИС ЕОП / NAsvetlo (authorities_index.json) — Регионални болници, КОЦ, ДКЦ и РЗИ по 28 области

Outputs:
  - docs/data/nasvetlo_telk_radar.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import ssl
import statistics
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
CACHE_DIR = REPO_ROOT / ".cache_nasvetlo_50" / "telk_noi"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = DATA_DIR / "nasvetlo_telk_radar.json"
AUTH_INDEX = DATA_DIR / "authorities_index.json"

BGN_PER_EUR = 1.95583

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

DOWNLOADS = {
    "Yearbook_Pensions_2025_Excel.zip": "https://www.noi.bg/wp-content/uploads/Yearbook_Pensions_2025_Excel.zip",
    "Yearbook_Pensions_2024.zip": "https://www.noi.bg/wp-content/uploads/Yearbook_Pensions_2024.zip",
    "YEARBOOK_Pensions_2023.zip": "https://www.noi.bg/wp-content/uploads/YEARBOOK_Pensions_2023.zip",
    "Pop_6.1.1_Pop_DR.xlsx": "https://www.nsi.bg/sites/default/files/files/data/timeseries/Pop_6.1.1_Pop_DR.xlsx",
    "Pop_6.1.2_Pop_DR.xlsx": "https://www.nsi.bg/sites/default/files/files/data/timeseries/Pop_6.1.2_Pop_DR.xlsx",
}

# Canonical 28 Bulgarian Oblasts keyed by GISCO NUTS-3
OBLASTS_META: list[dict[str, str]] = [
    {"nuts3": "BG311", "name": "Видин", "nuts2": "Северозападен"},
    {"nuts3": "BG312", "name": "Монтана", "nuts2": "Северозападен"},
    {"nuts3": "BG313", "name": "Враца", "nuts2": "Северозападен"},
    {"nuts3": "BG314", "name": "Плевен", "nuts2": "Северозападен"},
    {"nuts3": "BG315", "name": "Ловеч", "nuts2": "Северозападен"},
    {"nuts3": "BG321", "name": "Велико Търново", "nuts2": "Северен централен"},
    {"nuts3": "BG322", "name": "Габрово", "nuts2": "Северен централен"},
    {"nuts3": "BG323", "name": "Русе", "nuts2": "Северен централен"},
    {"nuts3": "BG324", "name": "Разград", "nuts2": "Северен централен"},
    {"nuts3": "BG325", "name": "Силистра", "nuts2": "Северен централен"},
    {"nuts3": "BG331", "name": "Варна", "nuts2": "Североизточен"},
    {"nuts3": "BG332", "name": "Добрич", "nuts2": "Североизточен"},
    {"nuts3": "BG333", "name": "Шумен", "nuts2": "Североизточен"},
    {"nuts3": "BG334", "name": "Търговище", "nuts2": "Североизточен"},
    {"nuts3": "BG341", "name": "Бургас", "nuts2": "Югоизточен"},
    {"nuts3": "BG342", "name": "Сливен", "nuts2": "Югоизточен"},
    {"nuts3": "BG343", "name": "Ямбол", "nuts2": "Югоизточен"},
    {"nuts3": "BG344", "name": "Стара Загора", "nuts2": "Югоизточен"},
    {"nuts3": "BG411", "name": "София (столица)", "nuts2": "Югозападен"},
    {"nuts3": "BG412", "name": "София", "nuts2": "Югозападен"},
    {"nuts3": "BG413", "name": "Благоевград", "nuts2": "Югозападен"},
    {"nuts3": "BG414", "name": "Перник", "nuts2": "Югозападен"},
    {"nuts3": "BG415", "name": "Кюстендил", "nuts2": "Югозападен"},
    {"nuts3": "BG421", "name": "Пловдив", "nuts2": "Южен централен"},
    {"nuts3": "BG422", "name": "Хасково", "nuts2": "Южен централен"},
    {"nuts3": "BG423", "name": "Пазарджик", "nuts2": "Южен централен"},
    {"nuts3": "BG424", "name": "Смолян", "nuts2": "Южен централен"},
    {"nuts3": "BG425", "name": "Кърджали", "nuts2": "Южен централен"},
]

OBLAST_BY_NAME = {o["name"]: o for o in OBLASTS_META}

ALIASES: dict[str, str] = {
    "благоевград": "Благоевград",
    "бургас": "Бургас",
    "варна": "Варна",
    "велико търново": "Велико Търново",
    "в.търново": "Велико Търново",
    "видин": "Видин",
    "враца": "Враца",
    "габрово": "Габрово",
    "добрич": "Добрич",
    "кърджали": "Кърджали",
    "кюстендил": "Кюстендил",
    "ловеч": "Ловеч",
    "монтана": "Монтана",
    "пазарджик": "Пазарджик",
    "перник": "Перник",
    "плевен": "Плевен",
    "пловдив": "Пловдив",
    "разград": "Разград",
    "русе": "Русе",
    "силистра": "Силистра",
    "сливен": "Сливен",
    "смолян": "Смолян",
    "софия-град": "София (столица)",
    "софия - град": "София (столица)",
    "софия град": "София (столица)",
    "софия (столица)": "София (столица)",
    "софия-столица": "София (столица)",
    "софия-област": "София",
    "софия - област": "София",
    "софия област": "София",
    "софийска": "София",
    "софия": "София",
    "стара загора": "Стара Загора",
    "ст.загора": "Стара Загора",
    "търговище": "Търговище",
    "хасково": "Хасково",
    "шумен": "Шумен",
    "ямбол": "Ямбол",
}


def norm_oblast(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # Remove leading numbering like "1." or "23. "
    s = re.sub(r"^\d+\s*\.\s*", "", s).strip()
    s_low = re.sub(r"\s+", " ", s.lower()).replace("–", "-").replace("—", "-")
    if s_low in ALIASES:
        return ALIASES[s_low]
    # Exact substring for София-град / София-област
    if "софия" in s_low and ("град" in s_low or "столиц" in s_low):
        return "София (столица)"
    if "софия" in s_low and "област" in s_low:
        return "София"
    return None


def to_num(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v) if not math.isnan(float(v)) else 0.0
    s = str(v).replace("\xa0", "").replace(" ", "").replace(",", ".").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def find_sheet(wb: openpyxl.Workbook, prefix: str) -> Any:
    for name in wb.sheetnames:
        clean = name.strip()
        if clean == prefix or clean.startswith(prefix + "-") or clean.startswith(prefix + " "):
            return wb[name]
    raise KeyError(f"Sheet prefix {prefix!r} not found in {wb.sheetnames}")


def ensure_downloads() -> None:
    for fname, url in DOWNLOADS.items():
        dst = CACHE_DIR / fname
        if not dst.exists() or dst.stat().st_size < 1000:
            req = urllib.request.Request(url, headers={"User-Agent": "NAsvetlo-TELK-Sync/1.0"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=45) as resp:
                dst.write_bytes(resp.read())
        if fname.endswith(".zip"):
            year_m = re.search(r"(202\d)", fname)
            if year_m:
                sub = CACHE_DIR / f"yb{year_m.group(1)}"
                if not sub.exists() or not any(sub.iterdir()):
                    sub.mkdir(parents=True, exist_ok=True)
                    with zipfile.ZipFile(dst, "r") as zf:
                        zf.extractall(sub)


def parse_noi_chapter9(year: int) -> dict[str, dict[str, Any]]:
    path = CACHE_DIR / f"yb{year}" / f"CHAPT#9-{year}.xlsm"
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    data: dict[str, dict[str, Any]] = {o["name"]: {} for o in OBLASTS_META}
    national: dict[str, Any] = {}

    def scan_sheet(prefix: str, extractor) -> None:
        ws = find_sheet(wb, prefix)
        for row in ws.iter_rows(min_row=6, max_row=45, max_col=20, values_only=True):
            if not row:
                continue
            label = str(row[0] or "").strip()
            if not label:
                continue
            low = label.lower().replace(" ", "")
            if low.startswith("общо"):
                extractor(national, row)
                continue
            ob = norm_oblast(label)
            if ob and ob in data:
                extractor(data[ob], row)

    # 9.2: Total pensions & General Disability pensions (col 1=Общо, col 2=YoY ratio, col 3=Fund Pensions, col 5=Инвалидност общо заболяване, col 6=Стаж и възраст)
    def ext_92(dst: dict, row: tuple) -> None:
        dst["totalPensions"] = int(round(to_num(row[1])))
        dst["totalPensionsYoyRatio"] = round(to_num(row[2]), 4)
        dst["invGeneralPensions"] = int(round(to_num(row[5])))
        dst["oldAgePensions"] = int(round(to_num(row[6])))

    # 9.3: Personal first disability pensioners by TNR degree
    # Cols: 0=TP, 1=Total, 2=>90%, 3=71-90%, 4=50-70%, 5=Unstated
    def ext_93(dst: dict, row: tuple) -> None:
        dst["invPensionersTotal"] = int(round(to_num(row[1])))
        dst["tnrOver90"] = int(round(to_num(row[2])))
        dst["tnr71to90"] = int(round(to_num(row[3])))
        dst["tnr50to70"] = int(round(to_num(row[4])))
        dst["tnrUnstated"] = int(round(to_num(row[5])))

    # 9.6: Newly granted pensions (total & first)
    def ext_96(dst: dict, row: tuple) -> None:
        dst["newlyGrantedTotal"] = int(round(to_num(row[1])))
        dst["newlyGrantedFirst"] = int(round(to_num(row[2])))

    # 9.7: Annual pension expenditure in BGN (col 1=Total BGN, col 4=Инвалидност общо заболяване BGN, col 5=Стаж и възраст BGN)
    def ext_97(dst: dict, row: tuple) -> None:
        dst["totalSpendBgn"] = round(to_num(row[1]), 2)
        dst["invSpendBgn"] = round(to_num(row[4]), 2)
        dst["oldAgeSpendBgn"] = round(to_num(row[5]), 2)

    # 9.9: Active care allowance supplements (Добавка за чужда помощ, col 1)
    def ext_99(dst: dict, row: tuple) -> None:
        dst["careAllowanceActive"] = int(round(to_num(row[1])))

    # 9.10: Newly granted care allowance supplements in the year (col 1=Total, col 2=Personal)
    def ext_910(dst: dict, row: tuple) -> None:
        dst["careAllowanceNew"] = int(round(to_num(row[1])))

    scan_sheet("9.2", ext_92)
    scan_sheet("9.3", ext_93)
    scan_sheet("9.6", ext_96)
    scan_sheet("9.7", ext_97)
    scan_sheet("9.9", ext_99)
    scan_sheet("9.10", ext_910)
    wb.close()
    data["_NATIONAL"] = national
    return data


def parse_nsi_population() -> dict[int, dict[str, int]]:
    path = CACHE_DIR / "Pop_6.1.1_Pop_DR.xlsx"
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    result: dict[int, dict[str, int]] = {}
    for year in (2023, 2024, 2025):
        ws = wb[str(year)]
        ymap: dict[str, int] = {}
        # In NSI Pop_6.1.1, oblast header rows precede their municipalities.
        # Warning: some municipalities share names with their oblast (e.g. Благоевград, Бургас, Варна, София).
        # The FIRST occurrence of each oblast name in Pop_6.1.1 is ALWAYS the oblast total!
        for row in ws.iter_rows(min_row=6, max_row=320, max_col=4, values_only=True):
            if not row or row[0] is None:
                continue
            label = str(row[0]).strip()
            if label.lower().startswith("общо за страната"):
                ymap["_NATIONAL"] = int(round(to_num(row[1])))
                continue
            ob = norm_oblast(label)
            if ob and ob not in ymap:
                ymap[ob] = int(round(to_num(row[1])))
        result[year] = ymap
    wb.close()
    return result


def load_regional_hospitals() -> dict[str, list[dict[str, Any]]]:
    if not AUTH_INDEX.exists():
        return {}
    raw = json.loads(AUTH_INDEX.read_text(encoding="utf-8"))
    fields = raw.get("fields", [])
    idx = {f: i for i, f in enumerate(fields)}
    by_region: dict[str, list[dict[str, Any]]] = {o["name"]: [] for o in OBLASTS_META}

    med_re = re.compile(
        r"(болниц|мбал|умбал|сбал|дкц|коц|цсмп|рзи|здрав|онколог|психиатр|медицинск|телк|нелк)",
        re.I,
    )

    for r in raw.get("rows", []):
        name = str(r[idx["name"]] or "")
        atype = str(r[idx["type"]] or "")
        region_raw = str(r[idx["region"]] or "")
        region = norm_oblast(region_raw)
        if not region or region not in by_region:
            continue
        if atype == "болница" or med_re.search(name):
            by_region[region].append({
                "eik": str(r[idx["eik"]]),
                "name": name,
                "type": atype,
                "settlement": str(r[idx["settlement"]] or ""),
                "spentEur": round(float(r[idx["spentEur"]] or 0), 2),
                "contracts": int(r[idx["contracts"]] or 0),
                "linkedCount": int(r[idx["linkedCount"]] or 0),
                "ownHits": int(r[idx["ownHits"]] or 0),
                "riskScore": int(r[idx["riskScore"]] or 0),
            })

    for reg, items in by_region.items():
        items.sort(key=lambda x: x["spentEur"], reverse=True)
    return by_region


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def build_dataset() -> dict[str, Any]:
    ensure_downloads()
    noi23 = parse_noi_chapter9(2023)
    noi24 = parse_noi_chapter9(2024)
    noi25 = parse_noi_chapter9(2025)
    pop = parse_nsi_population()
    hospitals_by_reg = load_regional_hospitals()

    # Validate all 28 oblasts parsed cleanly
    missing_noi = [o["name"] for o in OBLASTS_META if not noi25[o["name"]].get("invPensionersTotal")]
    missing_pop = [o["name"] for o in OBLASTS_META if not pop[2025].get(o["name"])]
    if missing_noi or missing_pop:
        raise RuntimeError(f"Missing parsed oblasts! NOI={missing_noi}, POP={missing_pop}")

    # First pass: compute raw metrics per oblast
    records: list[dict[str, Any]] = []
    for meta in OBLASTS_META:
        name = meta["name"]
        d23, d24, d25 = noi23[name], noi24[name], noi25[name]
        p23, p24, p25 = pop[2023][name], pop[2024][name], pop[2025][name]

        inv23 = d23["invPensionersTotal"]
        inv24 = d24["invPensionersTotal"]
        inv25 = d25["invPensionersTotal"]
        growth2y = ((inv25 - inv23) / inv23 * 100.0) if inv23 > 0 else 0.0
        growth1y = ((inv25 - inv24) / inv24 * 100.0) if inv24 > 0 else 0.0

        per1000 = inv25 / p25 * 1000.0
        per1000_23 = inv23 / p23 * 1000.0
        per1000_delta = per1000 - per1000_23

        tnr_over90_pct = (d25["tnrOver90"] / inv25 * 100.0) if inv25 else 0.0
        tnr_71_90_pct = (d25["tnr71to90"] / inv25 * 100.0) if inv25 else 0.0
        tnr_50_70_pct = (d25["tnr50to70"] / inv25 * 100.0) if inv25 else 0.0
        tnr_over71_pct = tnr_over90_pct + tnr_71_90_pct

        inv_share_all_pensions_pct = (
            d25["invGeneralPensions"] / d25["totalPensions"] * 100.0
            if d25["totalPensions"] else 0.0
        )

        care_active = d25.get("careAllowanceActive", 0)
        care_new = d25.get("careAllowanceNew", 0)
        care_active_per1000 = care_active / p25 * 1000.0
        care_new_per10k = care_new / p25 * 10000.0
        care_active_23 = d23.get("careAllowanceActive", 0)
        care_growth2y = ((care_active - care_active_23) / care_active_23 * 100.0) if care_active_23 > 0 else 0.0

        spend_postal_bgn = d25["invSpendBgn"]
        spend_postal_eur = spend_postal_bgn / BGN_PER_EUR
        # NOI Table 9.7 reports bank-transferred pensions centrally under row "29. ЦУ на НОИ" (2.925B BGN).
        # Estimate total regional annual disability expenditure proportionally to general-disease disability pensions (Table 9.2).
        nat_gen_pensions = noi25["_NATIONAL"]["invGeneralPensions"] or 1
        nat_spend_bgn_total = noi25["_NATIONAL"]["invSpendBgn"] or 0.0
        est_total_spend_bgn = nat_spend_bgn_total * (d25["invGeneralPensions"] / nat_gen_pensions)
        est_total_spend_eur = est_total_spend_bgn / BGN_PER_EUR
        spend_per_capita_eur = est_total_spend_eur / p25

        hosp_list = hospitals_by_reg.get(name, [])
        hosp_total_eur = round(sum(h["spentEur"] for h in hosp_list), 2)

        records.append({
            "nuts3": meta["nuts3"],
            "name": name,
            "nuts2": meta["nuts2"],
            "population2023": p23,
            "population2024": p24,
            "population2025": p25,
            "totalPensions2025": d25["totalPensions"],
            "invGeneralPensions2025": d25["invGeneralPensions"],
            "invShareOfAllPensionsPct": round(inv_share_all_pensions_pct, 2),
            "invPensioners2023": inv23,
            "invPensioners2024": inv24,
            "invPensioners2025": inv25,
            "growth1yPct": round(growth1y, 2),
            "growth2yPct": round(growth2y, 2),
            "per1000Pop2023": round(per1000_23, 2),
            "per1000Pop2025": round(per1000, 2),
            "per1000Delta2y": round(per1000_delta, 2),
            "tnrOver90": d25["tnrOver90"],
            "tnr71to90": d25["tnr71to90"],
            "tnr50to70": d25["tnr50to70"],
            "tnrOver90Pct": round(tnr_over90_pct, 2),
            "tnr71to90Pct": round(tnr_71_90_pct, 2),
            "tnr50to70Pct": round(tnr_50_70_pct, 2),
            "tnrOver71Pct": round(tnr_over71_pct, 2),
            "careAllowanceActive2025": care_active,
            "careAllowanceActive2023": care_active_23,
            "careAllowanceGrowth2yPct": round(care_growth2y, 2),
            "careAllowancePer1000Pop": round(care_active_per1000, 2),
            "careAllowanceNew2025": care_new,
            "careAllowanceNewPer10kPop": round(care_new_per10k, 2),
            "invSpendPostalBgn2025": round(spend_postal_bgn, 2),
            "invSpendPostalEur2025": round(spend_postal_eur, 2),
            "invSpendEur2025": round(est_total_spend_eur, 2),
            "invSpendPerCapitaEur": round(spend_per_capita_eur, 2),
            "medicalAuthoritiesCount": len(hosp_list),
            "medicalAuthoritiesZopEur": hosp_total_eur,
            "topMedicalAuthorities": hosp_list[:5],
        })

    # Compute cross-regional distributions (mean, stdev, median) across all 28 oblasts
    def zstats(key: str) -> tuple[float, float, float]:
        vals = [r[key] for r in records]
        mean = statistics.mean(vals)
        sd = statistics.pstdev(vals) or 1.0
        med = statistics.median(vals)
        return mean, sd, med

    m_prev, sd_prev, med_prev = zstats("per1000Pop2025")
    m_gr2, sd_gr2, med_gr2 = zstats("growth2yPct")
    m_o90, sd_o90, med_o90 = zstats("tnrOver90Pct")
    m_care_new, sd_care_new, med_care_new = zstats("careAllowanceNewPer10kPop")
    m_share, sd_share, med_share = zstats("invShareOfAllPensionsPct")
    _, _, med_spend_pc = zstats("invSpendPerCapitaEur")

    # National aggregates from NOI & NSI
    nat25 = noi25["_NATIONAL"]
    nat23 = noi23["_NATIONAL"]
    nat_pop25 = pop[2025]["_NATIONAL"]
    nat_pop23 = pop[2023]["_NATIONAL"]
    nat_per1000 = nat25["invPensionersTotal"] / nat_pop25 * 1000.0
    nat_o90_pct = nat25["tnrOver90"] / nat25["invPensionersTotal"] * 100.0
    nat_o71_pct = (nat25["tnrOver90"] + nat25["tnr71to90"]) / nat25["invPensionersTotal"] * 100.0
    nat_gr2 = (nat25["invPensionersTotal"] - nat23["invPensionersTotal"]) / nat23["invPensionersTotal"] * 100.0
    nat_spend_eur = nat25["invSpendBgn"] / BGN_PER_EUR
    nat_care_new_10k = nat25["careAllowanceNew"] / nat_pop25 * 10000.0
    nat_inv_share_all = nat25["invGeneralPensions"] / nat25["totalPensions"] * 100.0

    total_excess_fiscal_eur = 0.0

    for r in records:
        z_prev = (r["per1000Pop2025"] - m_prev) / sd_prev
        z_gr2 = (r["growth2yPct"] - m_gr2) / sd_gr2
        z_o90 = (r["tnrOver90Pct"] - m_o90) / sd_o90
        z_care = (r["careAllowanceNewPer10kPop"] - m_care_new) / sd_care_new
        z_share = (r["invShareOfAllPensionsPct"] - m_share) / sd_share

        # Transparent deterministic 0-100 Composite TELK Anomaly Score (5 orthogonal pillars):
        #   32% Prevalence per 1,000 pop (Z-Score)
        #   22% 2-Year Inflow Surge 2023->2025 (Z-Score)
        #   18% Severe >90% TNR Concentration (Z-Score)
        #   16% New Care Allowance (>90% + helper) per 10k pop (Z-Score)
        #   12% Disability Share of Total Pensions in Oblast (Z-Score)
        # Baseline z=0 maps to 35 pts; +2.0 sigma maps to ~85 pts; capped [5, 99].
        weighted_z = (
            0.32 * z_prev
            + 0.22 * z_gr2
            + 0.18 * z_o90
            + 0.16 * z_care
            + 0.12 * z_share
        )
        score = int(round(clamp(35.0 + weighted_z * 26.0, 5.0, 99.0)))

        # Fiscal excess above median oblast per-capita disability spend
        excess_eur = max(0.0, (r["invSpendPerCapitaEur"] - med_spend_pc) * r["population2025"])
        if z_prev > 0.75:
            total_excess_fiscal_eur += excess_eur

        flags: list[str] = []
        if z_prev >= 1.25:
            flags.append(f"Екстремна концентрация ({r['per1000Pop2025']:.1f}/1000 д., +{z_prev:.1f}σ)")
        elif z_prev >= 0.75:
            flags.append(f"Повишена концентрация ({r['per1000Pop2025']:.1f}/1000 д., +{z_prev:.1f}σ)")
        if r["growth2yPct"] >= nat_gr2 + 6.0:
            flags.append(f"Рязък 2-год. прираст (+{r['growth2yPct']:.1f}% при ср. +{nat_gr2:.1f}%)")
        if r["tnrOver90Pct"] >= nat_o90_pct + 3.0:
            flags.append(f"Висок дял >90% ТНР ({r['tnrOver90Pct']:.1f}% при ср. {nat_o90_pct:.1f}%)")
        if z_care >= 1.0:
            flags.append(f"Висок приток нови „Чужда помощ“ ({r['careAllowanceNewPer10kPop']:.1f}/10хил.)")
        if r["invShareOfAllPensionsPct"] >= nat_inv_share_all + 5.0:
            flags.append(f"Инвалидните са {r['invShareOfAllPensionsPct']:.1f}% от всички пенсии")

        tier = (
            "CRITICAL" if score >= 70
            else "HIGH" if score >= 52
            else "ELEVATED" if score >= 38
            else "BASELINE"
        )

        r["zPrevalence"] = round(z_prev, 2)
        r["zGrowth2y"] = round(z_gr2, 2)
        r["zOver90"] = round(z_o90, 2)
        r["zCareNew"] = round(z_care, 2)
        r["zPensionShare"] = round(z_share, 2)
        r["telkRiskScore"] = score
        r["riskTier"] = tier
        r["excessFiscalSpendEur"] = round(excess_eur, 2)
        r["anomalyFlags"] = flags

    records.sort(key=lambda x: x["telkRiskScore"], reverse=True)
    for idx_rank, r in enumerate(records, 1):
        r["riskRank"] = idx_rank

    critical_count = sum(1 for r in records if r["riskTier"] == "CRITICAL")
    high_count = sum(1 for r in records if r["riskTier"] == "HIGH")

    out = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "methodologyVersion": "NAsvetlo-TELK v1.0 (NOI 2023–2025 × NSI 2023–2025 × CAIS EOP)",
        "gdprCompliance": "100% агрегирани публични държавни данни (НОИ, НСИ, ЦАИС ЕОП). Нула лични данни и нула здравни картони по чл. 9 GDPR.",
        "sources": [
            {
                "institution": "Национален осигурителен институт (НОИ)",
                "title": "Статистически годишници „Пенсии“ 2023, 2024 и 2025 — Раздел 9 (Табл. 9.2, 9.3, 9.4, 9.7, 9.9, 9.10)",
                "url": "https://www.noi.bg/publikacii/statistika/pensii-statistika/",
            },
            {
                "institution": "Национален статистически институт (НСИ)",
                "title": "Население по области, общини, местоживеене и пол към 31.12.2023–31.12.2025 (Pop_6.1.1_Pop_DR.xlsx)",
                "url": "https://www.nsi.bg/bg/content/2975",
            },
            {
                "institution": "ЦАИС ЕОП / СИГМА 2.0 (NAsvetlo)",
                "title": "Регионални болници, КОЦ, ДКЦ и здравни възложители по 28 области (authorities_index.json)",
                "url": "https://nasvetlo.website/",
            },
        ],
        "national": {
            "population2023": nat_pop23,
            "population2025": nat_pop25,
            "totalPensions2025": nat25["totalPensions"],
            "invGeneralPensions2025": nat25["invGeneralPensions"],
            "invShareOfAllPensionsPct": round(nat_inv_share_all, 2),
            "invPensioners2023": nat23["invPensionersTotal"],
            "invPensioners2024": noi24["_NATIONAL"]["invPensionersTotal"],
            "invPensioners2025": nat25["invPensionersTotal"],
            "growth2yPct": round(nat_gr2, 2),
            "per1000Pop2025": round(nat_per1000, 2),
            "tnrOver90": nat25["tnrOver90"],
            "tnr71to90": nat25["tnr71to90"],
            "tnr50to70": nat25["tnr50to70"],
            "tnrOver90Pct": round(nat_o90_pct, 2),
            "tnrOver71Pct": round(nat_o71_pct, 2),
            "careAllowanceActive2025": nat25["careAllowanceActive"],
            "careAllowanceNew2025": nat25["careAllowanceNew"],
            "careAllowanceNewPer10kPop": round(nat_care_new_10k, 2),
            "invSpendBgn2025": round(nat25["invSpendBgn"], 2),
            "invSpendEur2025": round(nat_spend_eur, 2),
            "excessFiscalAnomalyAreasEur": round(total_excess_fiscal_eur, 2),
            "criticalOblastsCount": critical_count,
            "highOblastsCount": high_count,
            "medianPer1000Pop": round(med_prev, 2),
            "meanPer1000Pop": round(m_prev, 2),
            "stdevPer1000Pop": round(sd_prev, 2),
        },
        "rootCauseProtocol": {
            "title": "Коренов форензик протокол „От къде тръгва схемата“ (ЕИСМЕ × НЗИС × НОИ)",
            "summary": "След въвеждането на случайното електронно разпределение в ЕИСМЕ (юни 2024 г.), злоупотребите се изместват нагоре по веригата — от крайния ТЕЛК състав към „фабриките за входна медицинска документация“ (фиктивни хоспитализации по КП и платени консултации в НЗИС) и насочване към тесни специализирани състави.",
            "chainSteps": [
                {
                    "step": 1,
                    "node": "Посредник / Брокер",
                    "risk": "Набира кандидати по общини/квартали и координира „пакет“ от изследвания и епикризи.",
                    "detector": "Адресно и фамилно клъстериране + „медицински туризъм“ (пациент от област А → клиника в София/област Б).",
                },
                {
                    "step": 2,
                    "node": "Входен лекар / Частна клиника (НЗИС)",
                    "risk": "Издава шаблонни епикризи, ЕКГ/ЕМГ/ЯМР и отчита фиктивни клинични пътеки по НЗОК.",
                    "detector": "Bipartite Hub Graph: 1 УИН на лекар генерира >10× над нормата входни епикризи, завършили с ≥71% ТНР.",
                },
                {
                    "step": 3,
                    "node": "НЗИС Исторически крос-чек (24 мес.)",
                    "risk": "„Внезапна тежка хронична инвалидност“ без реална предходна терапия или е-рецепти.",
                    "detector": "Нула изписани/изпълнени е-рецепти по НЗОК за водещата МКБ-10 диагноза в последните 24 месеца преди ТЕЛК.",
                },
                {
                    "step": 4,
                    "node": "ЕИСМЕ Разпределение & ТЕЛК състав",
                    "risk": "Изкуствен подбор на водеща диагноза за специализиран ТЕЛК, отводи или пакетно подписване.",
                    "detector": "Threshold Bunching (остри шипове точно на 50%, 71–72% и 91–92%) + време на разглеждане <3 мин. / петък вечер.",
                },
                {
                    "step": 5,
                    "node": "НОИ Фискално изтичане",
                    "risk": "Отпускане на пожизнени пенсии и добавки за чужда помощ (€1,98 млрд./год. общ ресурс).",
                    "detector": "Регионален Z-Score > +1,5σ + скок на нови добавки за чужда помощ + сравнение с регистъра на КАТ/КОС/НАП.",
                },
            ],
            "institutionalDataRequests": [
                "МЗ / Информационно обслужване (ЕИСМЕ): Обезличен тримесечен open-data агрегат по ТЕЛК състави — брой решения по 1%-ви интервали (45–95%), водещи МКБ-10 класове и дял отменени от НЕЛК.",
                "НЗОК / НЗИС: Вътрешен Zero-Cloud крос-чек (SHA-256 псевдонимизация на ЕГН) между издател на хоспитализация/епикриза (УИН) и крайно ЕР на ТЕЛК ≥71%.",
                "НОИ: Разбивка на новоотпуснатите инвалидни пенсии по общини (LAU-1), възрастови групи (20–64 г.) и наличие на активни трудови договори / високорискови длъжности.",
            ],
        },
        "oblasts": records,
    }
    return out


def verify_raw_tails() -> None:
    path = CACHE_DIR / "yb2025" / "CHAPT#9-2025.xlsm"
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    for pref in ("9.2", "9.3", "9.7", "9.9", "9.10"):
        ws = find_sheet(wb, pref)
        print(f"=== TAIL OF {pref} ({ws.title}) ===")
        for r_idx, row in enumerate(ws.iter_rows(min_row=34, max_row=45, max_col=8, values_only=True), 34):
            vals = [str(c).strip()[:36] for c in row if c is not None and str(c).strip() != ""]
            if vals:
                print(f"  R{r_idx:02d}: " + " | ".join(vals[:7]))
    wb.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify_raw_tails()
        return 0
    if args.inspect:
        ensure_downloads()
        print("Use without --inspect to generate docs/data/nasvetlo_telk_radar.json")
        return 0

    dataset = build_dataset()
    OUT_FILE.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    nat = dataset["national"]
    print(f"[OK] Written {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")
    print(f"NATIONAL 2025: {nat['invPensioners2025']:,} inv. pensioners | {nat['per1000Pop2025']}/1000 pop | "
          f"2Y growth +{nat['growth2yPct']}% | >90% TNR: {nat['tnrOver90Pct']}% | "
          f"Spend: EUR {nat['invSpendEur2025']:,.0f} | Care active: {nat['careAllowanceActive2025']:,} (new 2025: {nat['careAllowanceNew2025']:,})")
    print("\nTOP 12 HIGHEST TELK ANOMALY OBLASTS:")
    for r in dataset["oblasts"][:12]:
        print(f"  #{r['riskRank']:02d} {r['name']:<18} [{r['nuts3']}] Score={r['telkRiskScore']:>2} ({r['riskTier']:<8}) | "
              f"Inv25={r['invPensioners2025']:>6,} | /1000={r['per1000Pop2025']:>5.1f} (Z={r['zPrevalence']:+.2f}) | "
              f"2Y={r['growth2yPct']:+5.1f}% | >90%={r['tnrOver90Pct']:>4.1f}% | CareNew/10k={r['careAllowanceNewPer10kPop']:>4.1f} | "
              f"EUR {r['invSpendEur2025']/1e6:>5.1f}M")
    print("\nBOTTOM 5 OBLASTS (LOWEST RISK):")
    for r in dataset["oblasts"][-5:]:
        print(f"  #{r['riskRank']:02d} {r['name']:<18} [{r['nuts3']}] Score={r['telkRiskScore']:>2} ({r['riskTier']:<8}) | "
              f"Inv25={r['invPensioners2025']:>6,} | /1000={r['per1000Pop2025']:>5.1f} (Z={r['zPrevalence']:+.2f}) | "
              f"2Y={r['growth2yPct']:+5.1f}% | >90%={r['tnrOver90Pct']:>4.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
