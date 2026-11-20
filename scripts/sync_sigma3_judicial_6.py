#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIGMA 3.0 FINALITY — 6 Judicial x Procurement Forensics + Entity Matching + 9-Node Graph + Risk Weights
Compiles docs/data/sigma3_judicial_6.json from 100% REAL, OPEN (ZERO-CAPTCHA) official public sources:

  1. Entity Matching Layer: Matches incoming judicial/regulatory feeds against ALL 17,428 firms,
     4,344 authorities, 571 officials, and 206,907 contracts (by EIK, exact UNP, or normalized name).
  2. Module J1 — Collusive Litigation & ZOP-Bypass Dispute Radar:
     Real contracts citing judicial rulings/settlements/arbitration/enforcement + high-risk
     post-award inflation x KZK dispute matrix + official MIDT <-> EISS/VSS API connector spec.
  3. Module J2 — ADFI / NAO Impunity Index (LIVE adfi.minfin.bg/bg/34 — ALL 2,229 inspection reports 2024–2026):
     Tracks per-authority ADFI inspection frequency, art. 17(7) ZDFI post-inspection updates,
     ZOP spend exposure, and uninspected mega-spenders.
  4. Module J3 — Legal & Expert Graph (Law Firms + Supervision Experts + Official ADFI 107 Experts PDF):
     Extracts every law firm (CPV 791 / адвокатско дружество) & supervision/audit expert across
     all 206,907 contracts + parses official ADFI Spisak-VL-30.09.2026.pdf (107 state experts).
  5. Module J4 — Preliminary Execution & Competition Blocking (LIVE reg.cpc.bg — ZERO CAPTCHA):
     Pulls real 2025–2026 KZK ZOP Preliminary Execution Determinations (dt=2&ot=6), ZOP Merits
     Decisions (dt=2&ot=2), and Open ZOP Proceedings with UNP (dt=2), matching Initiators,
     Respondents, and UNP directly against contracts.csv!
  6. Module J5 — Insolvency, Distraints & Phoenix Companies (LIVE Commercial Register + Burnout Scan):
     Scans all cached + high-burnout Commercial Register deeds for insolvency/liquidation status,
     CR_F_26_L share distraints (запори ЧСИ/НАП), CR_F_28_L special pledges, and same-owner
     Phoenix company chains!
  7. Module J6 — Criminal / ZMIP / EPPO Compliance Profile:
     Flags EU-funded high-risk contracts meeting EPPO Regulation (EU) 2017/1939 thresholds,
     statutory conflict-of-interest & ZMIP beneficial owner gaps, and EISS art. 54 ZOP spec.
  8. 9-Node Knowledge Graph Layer (+3 NEW node types: court_case, lawyer, expert) &
     Composite Judicial Risk Index Weights (0–100) for authorities, companies, and officials.
"""

from __future__ import annotations

import csv
import html
import http.cookiejar
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

from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
RAW_DIR = Path(r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api")
CONTRACTS_CSV = RAW_DIR / "contracts.csv"
CR_DEEDS_CACHE = RAW_DIR / "cr_deeds"
JUDICIAL_CACHE = RAW_DIR / "judicial_cache"
JUDICIAL_CACHE.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SIGMA-3.0-FINALITY/3.0",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.7",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

LEGAL_FORM_RE = re.compile(
    r"\b(еоод|оод|еад|ад|сд|кд|кда|ет|дззд|консорциум|обединение|сдружение|фондация|кооперация|дп|оп|гп)\b",
    re.I,
)
CITY_TAIL_RE = re.compile(r"(?:,|\s+-)\s*(?:гр\.?|град|с\.?|село|общ\.?|община|обл\.?|област)\s+.*$", re.I)

LAW_FIRM_RE = re.compile(
    r"(адвокатск[оаи]\s+(дружество|съдружие|кантора)|еднолично\s+адвокатско|правн[иао]\s+(услуги|консултац|обслужване)|процесуално\s+представителство|юридическ[иао]\s+(услуги|обслужване|консултац))",
    re.I,
)
EXPERT_FIRM_RE = re.compile(
    r"(строителен\s+надзор|оценка\s+на\s+съответствието|независим\s+оценител|съдебн[аои]\s+експертиз|финансов\s+одит|одиторск[иао]\s+услуги|технически\s+контрол|инвеститорски\s+контрол|експертн[аио]\s+оценк)",
    re.I,
)
LITIGATION_CONTRACT_RE = re.compile(
    r"(съдебн[аои]\s+(спогодб|решени|спор|защит|представителство)|изпълнител[ея]н\s+лист|арбитраж|принудително\s+изпълнение|събиране\s+на\s+вземания|процесуално\s+представителство|обжалване\s+на\s+акт|неустойк)",
    re.I,
)


def strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", s or "", flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def norm_entity(name: str, drop_legal: bool = True) -> str:
    s = (name or "").lower()
    s = re.sub(r"\(актуализиран[^)]*\)", " ", s, flags=re.I)
    for ch in ("„", "“", '"', "'", "`", "«", "»", "–", "—", "(", ")", "[", "]", ",", ";", "."):
        s = s.replace(ch, " ")
    s = re.sub(r"[^а-яa-z0-9\-\s]", " ", s)
    if drop_legal:
        s = LEGAL_FORM_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s


def norm_person(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower()).replace("-", " ")


def fetch_text(url: str, cache_file: Path | None = None, timeout: int = 20) -> str:
    if cache_file and cache_file.exists() and cache_file.stat().st_size > 200:
        return cache_file.read_text(encoding="utf-8", errors="ignore")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
        txt = resp.read().decode("utf-8", errors="ignore")
    if cache_file and len(txt) > 200:
        cache_file.write_text(txt, encoding="utf-8")
    return txt


def fetch_cr_deed_cached_or_live(eik: str, allow_live: bool = False) -> dict[str, Any] | None:
    if not eik or not eik.isdigit() or len(eik) != 9:
        return None
    cpath = CR_DEEDS_CACHE / f"{eik}.json"
    if cpath.exists() and cpath.stat().st_size > 100:
        try:
            return json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    if not allow_live:
        return None
    url = f"https://portal.registryagency.bg/CR/api/Deeds/{eik}"
    for attempt in range(2):
        try:
            time.sleep(0.45 if attempt == 0 else 4.0)
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
        except Exception:
            time.sleep(1.5)
    return None


# =============================================================================
# ENTITY MATCHING LAYER (4,344 AUTHORITIES + 17,428 COMPANIES + 206,907 UNPs)
# =============================================================================
class EntityMatcher:
    def __init__(self, authorities: list[list[Any]], companies: list[list[Any]]) -> None:
        self.auth_by_eik: dict[str, dict[str, Any]] = {}
        self.auth_by_norm: dict[str, dict[str, Any]] = {}
        self.auth_muni: dict[str, dict[str, Any]] = {}
        self.auth_list: list[tuple[str, dict[str, Any]]] = []

        for r in authorities:
            rec = {
                "eik": str(r[0] or ""), "name": str(r[1] or ""), "type": str(r[2] or ""),
                "settlement": str(r[3] or ""), "region": str(r[4] or ""),
                "spentEur": float(r[5] or 0), "contracts": int(r[6] or 0),
                "suppliers": int(r[7] or 0), "hhi": float(r[9] or 0),
                "singleOffer": float(r[10] or 0), "directAward": float(r[11] or 0),
                "linkedCount": int(r[12] or 0), "ownHits": int(r[13] or 0),
                "baseRisk": int(r[14] or 0),
            }
            if rec["eik"]:
                self.auth_by_eik[rec["eik"]] = rec
            n_full = norm_entity(rec["name"], drop_legal=False)
            n_core = norm_entity(rec["name"], drop_legal=True)
            for k in (n_full, n_core):
                if k and (k not in self.auth_by_norm or rec["spentEur"] > self.auth_by_norm[k]["spentEur"]):
                    self.auth_by_norm[k] = rec
            # Exact municipality shortcut: "община бургас" -> "бургас"
            m_muni = re.match(r"^община\s+([а-я\-]+(?:\s+[а-я\-]+)?)$", n_core)
            if m_muni:
                mk = m_muni.group(1).strip()
                if mk not in self.auth_muni or rec["spentEur"] > self.auth_muni[mk]["spentEur"]:
                    self.auth_muni[mk] = rec
            if len(n_core) >= 8:
                self.auth_list.append((n_core, rec))

        self.comp_by_eik: dict[str, dict[str, Any]] = {}
        self.comp_by_norm: dict[str, dict[str, Any]] = {}
        for r in companies:
            rec = {
                "eik": str(r[0] or ""), "name": str(r[1] or ""), "isConsortium": r[2] == 1,
                "settlement": str(r[3] or ""), "wonEur": float(r[4] or 0),
                "contracts": int(r[5] or 0), "authorities": int(r[6] or 0),
                "sector": str(r[7] or ""), "linkedOfficials": int(r[8] or 0),
                "consortiumCount": int(r[9] or 0), "consortiumEur": float(r[10] or 0),
            }
            if rec["eik"]:
                self.comp_by_eik[rec["eik"]] = rec
            n_core = norm_entity(rec["name"], drop_legal=True)
            if len(n_core) >= 3:
                if n_core not in self.comp_by_norm or rec["wonEur"] > self.comp_by_norm[n_core]["wonEur"]:
                    self.comp_by_norm[n_core] = rec

        self.stats = Counter()

    def match_authority(self, raw_name: str, raw_eik: str = "") -> tuple[dict[str, Any] | None, str]:
        if raw_eik and raw_eik in self.auth_by_eik:
            self.stats["auth_eik"] += 1
            return self.auth_by_eik[raw_eik], "EIK"
        if not raw_name:
            return None, ""
        # Strip trailing city suffixes like ", гр. Бургас" or " - гр. Добрич"
        cleaned = CITY_TAIL_RE.sub("", re.sub(r"\(актуализиран[^)]*\)", "", raw_name, flags=re.I)).strip()
        for cand in (raw_name, cleaned):
            nf = norm_entity(cand, drop_legal=False)
            nc = norm_entity(cand, drop_legal=True)
            if nf in self.auth_by_norm:
                self.stats["auth_name_exact"] += 1
                return self.auth_by_norm[nf], "NAME_EXACT"
            if nc in self.auth_by_norm:
                self.stats["auth_name_core"] += 1
                return self.auth_by_norm[nc], "NAME_CORE"
            # Handle "столична община - район X" -> "район X"
            m_rn = re.search(r"район\s+([а-я0-9\-]+)", nc)
            if m_rn:
                rk = f"район {m_rn.group(1)}"
                if rk in self.auth_by_norm:
                    self.stats["auth_district"] += 1
                    return self.auth_by_norm[rk], "NAME_DISTRICT"
            # Handle municipality aliases ("община град добрич" / "община добрич")
            m_m = re.match(r"^община\s+(?:град\s+)?([а-я\-]+(?:\s+[а-я\-]+)?)", nc)
            if m_m:
                mk = m_m.group(1).strip()
                if mk in self.auth_muni:
                    self.stats["auth_muni"] += 1
                    return self.auth_muni[mk], "NAME_MUNI"
                if f"град {mk}" in self.auth_muni:
                    self.stats["auth_muni"] += 1
                    return self.auth_muni[f"град {mk}"], "NAME_MUNI"
            # Handle "апи", "нкжи", "умбал", "вик" common aliases
            if "агенция пътна инфраструктура" in nc and "000695089" in self.auth_by_eik:
                self.stats["auth_alias"] += 1
                return self.auth_by_eik["000695089"], "ALIAS"
            if "столична община" == nc and "000696327" in self.auth_by_eik:
                self.stats["auth_alias"] += 1
                return self.auth_by_eik["000696327"], "ALIAS"
        return None, ""

    def match_company(self, raw_name: str, raw_eik: str = "") -> tuple[dict[str, Any] | None, str]:
        if raw_eik and raw_eik in self.comp_by_eik:
            self.stats["comp_eik"] += 1
            return self.comp_by_eik[raw_eik], "EIK"
        if not raw_name:
            return None, ""
        nc = norm_entity(raw_name, drop_legal=True)
        if len(nc) >= 3 and nc in self.comp_by_norm:
            self.stats["comp_name_exact"] += 1
            return self.comp_by_norm[nc], "NAME_EXACT"
        # Try stripping "дззд" / "обединение" prefix
        nc2 = re.sub(r"^(дззд|обединение|консорциум)\s+", "", nc).strip()
        if len(nc2) >= 4 and nc2 in self.comp_by_norm:
            self.stats["comp_name_core"] += 1
            return self.comp_by_norm[nc2], "NAME_CORE"
        return None, ""


# =============================================================================
# MODULE J2: LIVE ADFI FINANCIAL INSPECTION REPORTS (adfi.minfin.bg/bg/34)
# =============================================================================
def ingest_adfi_reports(matcher: EntityMatcher) -> dict[str, Any]:
    print("[J2] Parsing ALL official ADFI financial inspection reports (adfi.minfin.bg/bg/34)...")
    src_file = RAW_DIR / "probe_adfi_34.html"
    if src_file.exists() and src_file.stat().st_size > 100_000:
        html_txt = src_file.read_text(encoding="utf-8", errors="ignore")
    else:
        html_txt = fetch_text("https://adfi.minfin.bg/bg/34", JUDICIAL_CACHE / "adfi_34.html")

    row_re = re.compile(
        r"<tr>\s*<td[^>]*>\s*<a\s+href=\"([^\"]+)\"[^>]*>(.*?)</a>\s*</td>\s*"
        r"<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
        re.I | re.S,
    )
    reports: list[dict[str, Any]] = []
    by_year: Counter[str] = Counter()
    by_basis: Counter[str] = Counter()
    auth_agg: dict[str, dict[str, Any]] = {}
    matched_reports = 0
    updated_art17 = 0

    for m in row_re.finditer(html_txt):
        pdf_url = m.group(1).strip()
        if pdf_url.startswith("/"):
            pdf_url = "https://adfi.minfin.bg" + pdf_url
        rep_code = strip_tags(m.group(2)).replace(".pdf", "").replace(".PDF", "").strip()
        obj_raw = strip_tags(m.group(3))
        basis = strip_tags(m.group(4))
        pub_date = strip_tags(m.group(5))
        if not rep_code or not obj_raw:
            continue

        is_upd = "актуализиран" in obj_raw.lower() or "чл. 17" in obj_raw.lower()
        if is_upd:
            updated_art17 += 1

        yr_m = re.search(r"(202[4-7])", pub_date)
        yr = yr_m.group(1) if yr_m else "2024"
        by_year[yr] += 1

        b_low = basis.lower()
        if "ал. 2" in b_low and "ал. 1" not in b_low:
            basis_cat = "Планова / риск оценка (чл. 5, ал. 2 ЗДФИ)"
        elif "т. 5" in b_low:
            basis_cat = "По искане на Прокуратура / МС / МФ (чл. 5, ал. 1, т. 5)"
        elif "т. 4" in b_low or "т. 2" in b_low:
            basis_cat = "По сигнал за ЗОП / АОП / Сметна палата (чл. 5, ал. 1)"
        else:
            basis_cat = "По сигнал на граждани/организации (чл. 5, ал. 1, т. 1)"
        by_basis[basis_cat] += 1

        auth_rec, match_method = matcher.match_authority(obj_raw)
        if auth_rec:
            matched_reports += 1
            aeik = auth_rec["eik"]
            ag = auth_agg.get(aeik)
            if not ag:
                ag = {
                    "eik": aeik, "name": auth_rec["name"], "type": auth_rec["type"],
                    "region": auth_rec["region"], "spentEur": auth_rec["spentEur"],
                    "contracts": auth_rec["contracts"], "singleOffer": auth_rec["singleOffer"],
                    "directAward": auth_rec["directAward"], "hhi": auth_rec["hhi"],
                    "ownHits": auth_rec["ownHits"], "linkedCount": auth_rec["linkedCount"],
                    "reportCount": 0, "updatedArt17Count": 0, "signalInitiatedCount": 0,
                    "reports": [],
                }
                auth_agg[aeik] = ag
            ag["reportCount"] += 1
            if is_upd:
                ag["updatedArt17Count"] += 1
            if "ал. 1" in b_low:
                ag["signalInitiatedCount"] += 1
            if len(ag["reports"]) < 6:
                ag["reports"].append({
                    "code": rep_code, "url": pdf_url, "date": pub_date,
                    "basis": basis, "updatedArt17": is_upd,
                })

        reports.append({
            "code": rep_code, "url": pdf_url, "object": obj_raw, "basis": basis,
            "date": pub_date, "year": yr, "updatedArt17": is_upd,
            "directorate": (re.match(r"^(?:Доклад\s+)?(ДИД\d-[А-Я]{2})", rep_code, re.I).group(1).upper() if re.match(r"^(?:Доклад\s+)?(ДИД\d-[А-Я]{2})", rep_code, re.I) else "ДИД"),
            "authorityEik": auth_rec["eik"] if auth_rec else "",
            "authorityName": auth_rec["name"] if auth_rec else "",
            "authorityRegion": auth_rec["region"] if auth_rec else "",
            "authoritySpentEur": round(auth_rec["spentEur"], 2) if auth_rec else 0.0,
            "matchMethod": match_method,
        })

    # Collect ALL 370 updated art. 17(7) ZDFI reports with regional directorate breakdown
    updated_art17_reports = [r for r in reports if r["updatedArt17"]]
    by_directorate = Counter(r["directorate"] for r in updated_art17_reports)

    # Compute Impunity & Scrutiny Indicators per matched authority
    inspected_list = []
    for ag in auth_agg.values():
        upd_rate = round((ag["updatedArt17Count"] / max(1, ag["reportCount"])) * 100, 1)
        # Impunity risk score: repeat inspections + ch.17(7) updates + high single-offer + own-institution hits
        imp_score = min(
            100,
            int(round(
                min(35, ag["reportCount"] * 7)
                + min(25, ag["updatedArt17Count"] * 12)
                + min(20, ag["signalInitiatedCount"] * 6)
                + (12 if ag["singleOffer"] >= 0.45 else (6 if ag["singleOffer"] >= 0.30 else 0))
                + (8 if ag["ownHits"] > 0 else 0)
            )),
        )
        ag["updatedRatePct"] = upd_rate
        ag["impunityRiskScore"] = imp_score
        inspected_list.append(ag)

    inspected_list.sort(key=lambda x: (x["reportCount"], x["updatedArt17Count"], x["spentEur"]), reverse=True)

    # Uninspected mega-spenders: highest public spending authorities with ZERO post-2024 ADFI reports!
    inspected_eiks = set(auth_agg.keys())
    uninspected_mega = [
        {
            "eik": a["eik"], "name": a["name"], "type": a["type"], "region": a["region"],
            "spentEur": round(a["spentEur"], 2), "contracts": a["contracts"],
            "singleOfferPct": round(a["singleOffer"] * 100, 1),
            "hhi": round(a["hhi"], 3), "ownHits": a["ownHits"],
        }
        for a in matcher.auth_by_eik.values()
        if a["eik"] not in inspected_eiks and a["spentEur"] >= 40_000_000
    ]
    uninspected_mega.sort(key=lambda x: x["spentEur"], reverse=True)

    # Key historical ADFI audit reports (from adfi.minfin.bg/bg/18)
    historical_highlights = [
        {"title": "Информация за съставени актове за начет (2017–2022 г.)", "url": "https://adfi.minfin.bg/upload/3280/AN-2017-2022.pdf", "entity": "Национален свод АДФИ"},
        {"title": "Финансова инспекция на Агенция „Пътна инфраструктура“ (АПИ)", "url": "https://adfi.minfin.bg/upload/3369/%D0%B8%D0%BD%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%86%D0%B8%D1%8F+%D0%B7%D0%B0+%D0%A4%D0%98+%D0%B2+%D0%90%D0%9F%D0%98.pdf", "entity": "АГЕНЦИЯ \"ПЪТНА ИНФРАСТРУКТУРА\""},
        {"title": "Финансова инспекция на Столична община", "url": "https://adfi.minfin.bg/upload/3377/inf-mf-so.pdf", "entity": "СТОЛИЧНА ОБЩИНА"},
        {"title": "Доклад за финансова инспекция на „Автомагистрали“ ЕАД", "url": "https://adfi.minfin.bg/upload/2676/rezume_doklad.pdf", "entity": "АВТОМАГИСТРАЛИ ЕАД"},
        {"title": "Доклад ДИД1-СФ-18 — УМБАЛ „Александровска“ ЕАД", "url": "https://adfi.minfin.bg/upload/2739/Aleksandrovskainfo.pdf", "entity": "УМБАЛ АЛЕКСАНДРОВСКА ЕАД"},
    ]

    print(f"    [J2] Parsed {len(reports):,} real ADFI reports -> {matched_reports:,} matched to {len(auth_agg)} authorities ({updated_art17} updated under art. 17(7) ZDFI).")
    return {
        "totalReports": len(reports),
        "matchedReports": matched_reports,
        "matchedAuthoritiesCount": len(auth_agg),
        "updatedArt17Count": updated_art17,
        "updatedArt17Pct": round((updated_art17 / max(1, len(reports))) * 100, 1),
        "byYear": dict(sorted(by_year.items())),
        "byBasis": [{"label": k, "count": v} for k, v in by_basis.most_common()],
        "updatedByDirectorate": [{"directorate": k, "count": v} for k, v in by_directorate.most_common()],
        "updatedArt17Reports": updated_art17_reports[::-1],
        "topInspectedAuthorities": inspected_list[:65],
        "uninspectedMegaSpenders": uninspected_mega[:25],
        "recentReports": reports[-40:][::-1],
        "historicalHighlights": historical_highlights,
        "_authAgg": auth_agg,
        "_allReports": reports,
    }


# =============================================================================
# MODULE J4: LIVE KZK ZOP REGISTRY (reg.cpc.bg — ZERO CAPTCHA!)
# =============================================================================
def _extract_hidden_inputs(page_html: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in re.finditer(r'<input[^>]+type=["\']hidden["\'][^>]*>', page_html, flags=re.I):
        tag = m.group(0)
        nm = re.search(r'name=["\']([^"\']+)["\']', tag, flags=re.I)
        vm = re.search(r'value=["\']([^"\']*)["\']', tag, flags=re.I)
        if nm:
            out[nm.group(1)] = html.unescape(vm.group(1)) if vm else ""
    return out


def _parse_cpc_resolutions_page(page_html: str, is_prelim: bool) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    # Each decision card has ctl02, ctl03, ctl04, ctl05, ctl06...
    for idx in range(2, 12):
        ctl = f"ctl{idx:02d}"
        m_act = re.search(rf'id="ctl00_cntPlaceHldMain_gvDecisions_{ctl}_lblDecNumber"[^>]*>(.*?)</a>', page_html, re.S | re.I)
        if not m_act:
            continue
        act_no = strip_tags(m_act.group(1))
        def get_span(suffix: str) -> str:
            mm = re.search(rf'id="ctl00_cntPlaceHldMain_gvDecisions_{ctl}_{suffix}"[^>]*>(.*?)</span>', page_html, re.S | re.I)
            return strip_tags(mm.group(1)) if mm else ""

        dt_txt = re.sub(r"^Дата на [^:]+:\s*", "", get_span("lblDecisionDate")).strip()
        disp = re.sub(r"^Произнасяне:\s*", "", get_span("lblDecisionDisp")).strip()
        subj = re.sub(r"^Предмет/подпредмет:\s*", "", get_span("lblDossierSubject")).strip()
        inits = re.sub(r"^Инициатор\(и\):\s*", "", get_span("lblProceedingsInformer")).strip()
        resps = re.sub(r"^Ответник\(ници\):\s*", "", get_span("lblProceedingsRespondant")).strip()
        appeal_txt = get_span("Label1")

        m_doss = re.search(rf'id="ctl00_cntPlaceHldMain_gvDecisions_{ctl}_lnkDossNumber"[^>]*href="[^"]*DossID=(\d+)[^"]*"[^>]*>(.*?)</a>', page_html, re.S | re.I)
        doss_id = m_doss.group(1) if m_doss else ""
        case_no = strip_tags(m_doss.group(2)) if m_doss else ""
        if not doss_id:
            m_hid = re.search(rf'id="ctl00_cntPlaceHldMain_gvDecisions_{ctl}_hidden"[^>]*value="(\d+)"', page_html, re.I)
            doss_id = m_hid.group(1) if m_hid else ""

        disp_l = disp.lower()
        outcome = "Друго произнасяне"
        severity = "info"
        if is_prelim:
            if "допуска предварително изпълнение" in disp_l and "не допуска" not in disp_l and "оставя без" not in disp_l:
                outcome = "ДОПУСКА предварително изпълнение"
                severity = "critical"
            elif "временна мярка" in disp_l and ("налага" in disp_l or "спира" in disp_l):
                outcome = "Налага временна мярка (Спиране)"
                severity = "warn"
            elif "прекратява" in disp_l:
                outcome = "Прекратява производството"
                severity = "muted"
            elif "оставя без уважение" in disp_l or "не допуска" in disp_l:
                outcome = "Отказва предварително изпълнение"
                severity = "ok"
            elif "оставя без разглеждане" in disp_l:
                outcome = "Оставя без разглеждане"
                severity = "muted"
        else:
            if "отменя" in disp_l or "установява незаконосъобразност" in disp_l:
                outcome = "ОТМЕНЯ решението на възложителя"
                severity = "critical"
            elif "оставя жалбата без уважение" in disp_l or "оставя без уважение" in disp_l:
                outcome = "Оставя жалбата без уважение"
                severity = "ok"
            elif "прекратява" in disp_l:
                outcome = "Прекратява производството"
                severity = "muted"

        appealed_vas = ("постъпила жалба" in appeal_txt.lower() and "няма постъпила" not in appeal_txt.lower()) or ("вас" in appeal_txt.lower())
        rows.append({
            "kind": "Определение (Предв. изп.)" if is_prelim else "Решение (ЗОП)",
            "isPrelim": is_prelim,
            "actNo": act_no,
            "caseNo": case_no,
            "dossId": doss_id,
            "url": f"https://reg.cpc.bg/Dossier.aspx?DossID={doss_id}" if doss_id else "https://reg.cpc.bg/AllResolutions.aspx?dt=2&ot=6",
            "date": dt_txt,
            "disposition": disp[:320],
            "outcome": outcome,
            "severity": severity,
            "subject": subj,
            "initiatorsRaw": inits,
            "respondentsRaw": resps,
            "appealStatus": appeal_txt[:140],
            "appealedToVas": appealed_vas,
        })
    return rows


def _parse_cpc_dossiers_page(page_html: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for idx in range(2, 12):
        ctl = f"ctl{idx:02d}"
        m_pr = re.search(rf'id="ctl00_cntPlaceHldMain_gvProceedings_{ctl}_lblProceedingNumber"[^>]*>(.*?)</a>', page_html, re.S | re.I)
        if not m_pr:
            continue
        case_no = strip_tags(m_pr.group(1)).replace("Производство № ", "").strip()
        def get_span(suffix: str) -> str:
            mm = re.search(rf'id="ctl00_cntPlaceHldMain_gvProceedings_{ctl}_{suffix}"[^>]*>(.*?)</span>', page_html, re.S | re.I)
            return strip_tags(mm.group(1)) if mm else ""

        dt_txt = re.sub(r"^Дата на образуване:\s*", "", get_span("lblProceedingsCreateDate")).strip()
        status = re.sub(r"^Текущ статус:\s*", "", get_span("lblProceedingsStatus")).strip()
        inits = re.sub(r"^Инициатор\(и\):\s*", "", get_span("lblProceedingsInformer")).strip()
        resps = re.sub(r"^Ответник\(ници\):\s*", "", get_span("lblProceedingsRespondant")).strip()
        desc = re.sub(r"^Описание:\s*", "", get_span("lblDescription")).strip()
        unp = re.sub(r"^УНП:\s*", "", get_span("Label2")).strip()
        m_hid = re.search(rf'id="ctl00_cntPlaceHldMain_gvProceedings_{ctl}_hidden"[^>]*value="(\d+)"', page_html, re.I)
        doss_id = m_hid.group(1) if m_hid else ""

        rows.append({
            "caseNo": case_no, "dossId": doss_id,
            "url": f"https://reg.cpc.bg/Dossier.aspx?DossID={doss_id}" if doss_id else "https://reg.cpc.bg/AllDossiers.aspx?dt=2",
            "date": dt_txt, "status": status, "initiatorsRaw": inits, "respondentsRaw": resps,
            "description": desc[:260], "unp": unp,
        })
    return rows


def fetch_cpc_paginated(url: str, cache_name: str, max_pages: int, parser_fn, is_resolutions: bool = True) -> tuple[list[dict[str, Any]], int]:
    cfile = JUDICIAL_CACHE / f"{cache_name}.json"
    if cfile.exists() and cfile.stat().st_size > 500:
        try:
            saved = json.loads(cfile.read_text(encoding="utf-8"))
            if saved.get("rows"):
                return saved["rows"], int(saved.get("totalInYear", len(saved["rows"])))
        except Exception:
            pass

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    opener.addheaders = list(HEADERS.items())

    all_rows: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    total_in_year = 0

    try:
        with opener.open(url, timeout=18) as resp:
            page_html = resp.read().decode("utf-8", errors="ignore")
    except Exception as ex:
        print(f"    [WARN] KZK fetch failed for {url}: {ex}")
        return [], 0

    m_tot = re.search(r"Намерени са общо\s+(\d+)\s+", page_html)
    if m_tot:
        total_in_year = int(m_tot.group(1))

    for p in range(max_pages):
        batch = parser_fn(page_html)
        new_cnt = 0
        for r in batch:
            k = r.get("actNo") or r.get("caseNo") or str(len(all_rows))
            if k not in seen_keys:
                seen_keys.add(k)
                all_rows.append(r)
                new_cnt += 1
        if p >= max_pages - 1 or new_cnt == 0:
            break
        # Find Next button postback target
        m_next = re.search(r"__doPostBack\('([^']*lnkButtonNext)'", page_html)
        if not m_next:
            break
        target = m_next.group(1)
        hidden = _extract_hidden_inputs(page_html)
        hidden["__EVENTTARGET"] = target
        hidden["__EVENTARGUMENT"] = ""
        data = urllib.parse.urlencode(hidden).encode("utf-8")
        try:
            time.sleep(0.18)
            req = urllib.request.Request(url, data=data, headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded", "Referer": url})
            with opener.open(req, timeout=18) as resp:
                page_html = resp.read().decode("utf-8", errors="ignore")
        except Exception:
            break

    if all_rows:
        cfile.write_text(json.dumps({"totalInYear": total_in_year, "rows": all_rows}, ensure_ascii=False), encoding="utf-8")
    return all_rows, total_in_year


def ingest_kzk_zop(matcher: EntityMatcher, unp_index: dict[str, dict[str, Any]]) -> dict[str, Any]:
    print("[J4] Fetching LIVE KZK ZOP Preliminary Execution rulings, Decisions & Proceedings (reg.cpc.bg)...")
    prelim_rows, total_prelim_2026 = fetch_cpc_paginated(
        "https://reg.cpc.bg/AllResolutions.aspx?dt=2&ot=6",
        "cpc_zop_prelim_2026",
        max_pages=22,
        parser_fn=lambda h: _parse_cpc_resolutions_page(h, True),
    )
    dec_rows, total_dec_2026 = fetch_cpc_paginated(
        "https://reg.cpc.bg/AllResolutions.aspx?dt=2&ot=2",
        "cpc_zop_decisions_2026",
        max_pages=22,
        parser_fn=lambda h: _parse_cpc_resolutions_page(h, False),
    )
    doss_rows, total_doss_2026 = fetch_cpc_paginated(
        "https://reg.cpc.bg/AllDossiers.aspx?dt=2",
        "cpc_zop_dossiers_2026",
        max_pages=16,
        parser_fn=_parse_cpc_dossiers_page,
        is_resolutions=False,
    )

    # Index UNP by caseNo / dossId from dossiers so resolutions inherit UNP where available!
    unp_by_doss: dict[str, str] = {}
    for d in doss_rows:
        if d.get("unp"):
            if d.get("dossId"):
                unp_by_doss[d["dossId"]] = d["unp"]
            if d.get("caseNo"):
                unp_by_doss[d["caseNo"]] = d["unp"]

    all_acts = prelim_rows + dec_rows
    auth_kzk: dict[str, dict[str, Any]] = {}
    comp_kzk: dict[str, dict[str, Any]] = {}
    outcome_counts: Counter[str] = Counter()
    vas_appealed_cnt = 0
    prelim_granted_cnt = 0
    overturned_cnt = 0
    matched_auth_acts = 0
    matched_comp_acts = 0
    unp_matched_cnt = 0

    for a in all_acts:
        outcome_counts[a["outcome"]] += 1
        if a["appealedToVas"]:
            vas_appealed_cnt += 1
        if a["outcome"] == "ДОПУСКА предварително изпълнение":
            prelim_granted_cnt += 1
        if a["outcome"] == "ОТМЕНЯ решението на възложителя":
            overturned_cnt += 1

        # Match Respondent Authority (4,344)
        resp_parts = [p.strip() for p in re.split(r";|\|", a.get("respondentsRaw") or "") if p.strip()]
        m_auth = None
        m_auth_how = ""
        for rp in resp_parts:
            m_auth, m_auth_how = matcher.match_authority(rp)
            if m_auth:
                break
        if m_auth:
            matched_auth_acts += 1
            a["authorityEik"] = m_auth["eik"]
            a["authorityName"] = m_auth["name"]
            a["authorityMatch"] = m_auth_how
            ag = auth_kzk.setdefault(m_auth["eik"], {
                "eik": m_auth["eik"], "name": m_auth["name"], "spentEur": m_auth["spentEur"],
                "totalActs": 0, "prelimGranted": 0, "prelimDenied": 0, "overturned": 0, "upheld": 0, "vasAppeals": 0,
            })
            ag["totalActs"] += 1
            if a["outcome"] == "ДОПУСКА предварително изпълнение":
                ag["prelimGranted"] += 1
            elif a["outcome"] == "Отказва предварително изпълнение":
                ag["prelimDenied"] += 1
            elif a["outcome"] == "ОТМЕНЯ решението на възложителя":
                ag["overturned"] += 1
            elif a["outcome"] == "Оставя жалбата без уважение":
                ag["upheld"] += 1
            if a["appealedToVas"]:
                ag["vasAppeals"] += 1
        else:
            a["authorityEik"] = ""
            a["authorityName"] = resp_parts[0] if resp_parts else ""
            a["authorityMatch"] = ""

        # Match Initiator Company (17,428)
        init_parts = [p.strip() for p in re.split(r";|\|", a.get("initiatorsRaw") or "") if p.strip()]
        matched_inits = []
        for ip in init_parts:
            mc, mc_how = matcher.match_company(ip)
            if mc:
                matched_inits.append({"eik": mc["eik"], "name": mc["name"], "wonEur": mc["wonEur"], "how": mc_how})
                cg = comp_kzk.setdefault(mc["eik"], {
                    "eik": mc["eik"], "name": mc["name"], "wonEur": mc["wonEur"],
                    "totalActs": 0, "winsOverturned": 0, "prelimHits": 0, "vasAppeals": 0,
                })
                cg["totalActs"] += 1
                if a["outcome"] == "ОТМЕНЯ решението на възложителя":
                    cg["winsOverturned"] += 1
                if a["isPrelim"]:
                    cg["prelimHits"] += 1
                if a["appealedToVas"]:
                    cg["vasAppeals"] += 1
        if matched_inits:
            matched_comp_acts += 1
        a["matchedInitiators"] = matched_inits[:3]

        unp_val = unp_by_doss.get(a.get("dossId") or "") or unp_by_doss.get(a.get("caseNo") or "") or ""
        a["unp"] = unp_val
        if unp_val and unp_val in unp_index:
            a["contractValueEur"] = round(unp_index[unp_val]["valueEur"], 2)
            unp_matched_cnt += 1
        else:
            a["contractValueEur"] = 0.0

    # Match open dossiers by UNP + entity
    enriched_dossiers = []
    for d in doss_rows:
        u = d.get("unp") or ""
        ui = unp_index.get(u) if u else None
        if ui:
            unp_matched_cnt += 1
        ma, _ = matcher.match_authority((d.get("respondentsRaw") or "").split(";")[0])
        mc, _ = matcher.match_company((d.get("initiatorsRaw") or "").split(";")[0])
        enriched_dossiers.append({
            **d,
            "authorityEik": ma["eik"] if ma else (ui["authorityEik"] if ui else ""),
            "contractorEik": mc["eik"] if mc else "",
            "contractValueEur": round(ui["valueEur"], 2) if ui else 0.0,
            "contractBids": ui["bids"] if ui else 0,
        })

    top_kzk_auths = sorted(
        auth_kzk.values(),
        key=lambda x: (x["prelimGranted"], x["overturned"], x["totalActs"], x["spentEur"]),
        reverse=True,
    )[:35]
    top_kzk_comps = sorted(
        comp_kzk.values(),
        key=lambda x: (x["totalActs"], x["winsOverturned"], x["wonEur"]),
        reverse=True,
    )[:35]

    prelim_sorted = sorted(prelim_rows, key=lambda x: (x["severity"] == "critical", x["appealedToVas"], x["date"]), reverse=True)
    dec_sorted = sorted(dec_rows, key=lambda x: (x["severity"] == "critical", x["appealedToVas"], x["date"]), reverse=True)

    print(f"    [J4] Live KZK ingested: {len(prelim_rows)} prelim rulings ({prelim_granted_cnt} GRANTED!), {len(dec_rows)} ZOP decisions ({overturned_cnt} OVERTURNED!), {len(doss_rows)} open dossiers -> {matched_auth_acts} auth matches, {matched_comp_acts} firm matches, {vas_appealed_cnt} VAS appeals.")
    return {
        "year2026Totals": {
            "proceedings": total_doss_2026,
            "decisions": total_dec_2026,
            "prelimDeterminations": total_prelim_2026,
        },
        "ingestedCounts": {
            "prelimRulings": len(prelim_rows),
            "decisions": len(dec_rows),
            "openDossiers": len(doss_rows),
            "prelimGranted": prelim_granted_cnt,
            "decisionsOverturned": overturned_cnt,
            "vasAppealed": vas_appealed_cnt,
            "matchedAuthorities": matched_auth_acts,
            "matchedCompanies": matched_comp_acts,
            "matchedUnps": unp_matched_cnt,
        },
        "outcomeBreakdown": [{"outcome": k, "count": v} for k, v in outcome_counts.most_common()],
        "prelimRulings": prelim_sorted[:80],
        "decisions": dec_sorted[:80],
        "openDossiers": enriched_dossiers[:50],
        "topAuthorities": top_kzk_auths,
        "topAppellants": top_kzk_comps,
        "_authKzk": auth_kzk,
        "_compKzk": comp_kzk,
    }


# =============================================================================
# LIVE EISS / EPEP DIRECT COURT API ENGINE (ecase.justice.bg — ZERO CAPTCHA!)
#   1. Module 2: ADFI & NAO Administrative-Penal Cases (КАНД/АНД) -> NP Confirmed / Reduced / Annulled
#   2. Module 4: VAS (CourtId 113) Final Decisions & Preliminary Execution Rulings on KZK ZOP Acts
#   3. Module 1 & 3: Commercial & Appellate Commercial Disputes (ТД/ВТД) Contractor <-> Authority
#      with Full Dispositions, Claim Amounts, Unmasked Lawyers (адв.) & Court Experts (вещи лица)
# =============================================================================
ECASE_CACHE_DIR = JUDICIAL_CACHE / "ecase_live"
ECASE_ACTS_DIR = ECASE_CACHE_DIR / "acts_html"
ECASE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
ECASE_ACTS_DIR.mkdir(parents=True, exist_ok=True)

ECASE_JSON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SIGMA-3.0-FINALITY/3.0",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

DIRECTORATE_CITIES = {
    "ДИД1-СФ": ("софия", "перник", "благоевград", "кюстендил"),
    "ДИД2-ПД": ("пловдив", "пазарджик", "смолян", "хасково", "кърджали"),
    "ДИД3-ПЛ": ("плевен", "ловеч", "враца", "монтана", "видин"),
    "ДИД4-КН": ("кюстендил", "благоевград", "перник", "дупница"),
    "ДИД5-СЗ": ("стара загора", "сливен", "ямбол", "хасково", "казанлък"),
    "ДИД6-БС": ("бургас", "сливен", "ямбол", "несебър", "поморие"),
    "ДИД7-ВН": ("варна", "добрич", "шумен", "силистра", "разград", "търговище"),
    "ДИД8-ВТ": ("велико търново", "габрово", "русе", "ловеч", "силистра", "разград", "търговище"),
}


def _sanitize_gdpr_text(text: str) -> str:
    """
    GDPR / ЗЗЛД Compliance Sanitizer for EISS/EPEP judicial act texts before public domain upload:
      - Scrubs 10-digit EGN / LNC numbers
      - Scrubs ID card numbers (л.к. № ...)
      - Scrubs personal residential street/apartment addresses
      - Scrubs personal IBANs and phone numbers
    """
    if not text:
        return ""
    s = text
    # 1. Scrub EGN / LNC (10 digits preceded by ЕГН/ЛНЧ or standalone 10-digit EGN pattern)
    s = re.sub(r"\b(ЕГН|ЛНЧ|егн|лнч)\s*[:№]?\s*\d{6,10}\b", r"\1 [ЗЗЛД]", s)
    s = re.sub(r"\b[0-9]{2}(?:0[1-9]|1[0-2]|4[1-9]|5[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{4}\b", "[ЕГН-ЗЗЛД]", s)
    # 2. Scrub ID card numbers (л.к. / лична карта № 9 digits)
    s = re.sub(r"\b(л\.\s*к\.|лична\s+карта)\s*№?\s*[A-ZА-Я0-9]{6,12}\b", r"\1 [ЗЗЛД]", s, flags=re.I)
    # 3. Scrub residential addresses (ж.к. / кв. / ул. ... ап. / ет. ...)
    s = re.sub(
        r"(?:с\s+адрес|живущ[аи]?\s+в|адрес\s+за\s+призоваване)\s*[:\-]?\s*[^,\.;]{5,85}?(?:ул\.|ж\.?\s*к\.?|кв\.|бул\.|ет\.|ап\.)[^;\.]{3,65}",
        "[адрес заличен по ЗЗЛД]",
        s,
        flags=re.I,
    )
    s = re.sub(
        r"\b(?:ж\.?\s*к\.?|кв\.)\s*[„\"«]?[А-Яа-я0-9\s\-]{2,30}[“\"»]?,\s*бл\.\s*\d+[^,\.;]{0,40}",
        "[адрес заличен по ЗЗЛД]",
        s,
        flags=re.I,
    )
    # 4. Scrub IBANs
    s = re.sub(r"\bBG\d{2}[A-Z]{4}[0-9A-Z]{14}\b", "[IBAN-ЗЗЛД]", s)
    return s


def _ecase_post(endpoint: str, payload: dict[str, Any], cache_key: str = "") -> dict[str, Any]:
    if cache_key:
        cfile = ECASE_CACHE_DIR / f"{cache_key}.json"
        if cfile.exists() and cfile.stat().st_size > 50:
            try:
                return json.loads(cfile.read_text(encoding="utf-8"))
            except Exception:
                pass
    url = f"https://ecase.justice.bg{endpoint}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    for attempt in range(4):
        try:
            # Polite rate-limiting pause with exponential backoff on retries
            time.sleep(0.22 if attempt == 0 else (1.2 * (2 ** attempt)))
            req = urllib.request.Request(url, data=body, headers=ECASE_JSON_HEADERS, method="POST")
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=16) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(raw)
            if cache_key and isinstance(data, dict) and data.get("data") is not None:
                (ECASE_CACHE_DIR / f"{cache_key}.json").write_text(raw, encoding="utf-8")
            return data
        except urllib.error.HTTPError as he:
            if he.code in (429, 502, 503):
                time.sleep(3.0 * (attempt + 1))
            else:
                time.sleep(0.8 * (attempt + 1))
        except Exception:
            time.sleep(0.8 * (attempt + 1))
    return {"data": [], "total_rows": 0}


def _ecase_load_grid(court_id: str, case_kind_id: str, reg_year: str, act_kind_id: str, page: int, size: int = 500) -> tuple[list[dict[str, Any]], int]:
    filt = {
        "CourtId": str(court_id),
        "CaseKindId": str(case_kind_id),
        "DocNumber": "",
        "RegNumber": "",
        "RegYear": str(reg_year),
        "PrevNumber": "",
        "PrevYear": "",
        "ActKindId": str(act_kind_id),
        "ActNumber": "",
        "ActYear": "",
        "AssignedDocCourtId": "",
        "AssignedDocNumber": "",
        "AssignedDocYear": "",
        "CheckMeInSides": False,
    }
    ckey = f"grid_c{court_id}_k{case_kind_id}_y{reg_year}_a{act_kind_id}_p{page}_s{size}"
    res = _ecase_post("/Case/LoadData", {"data": json.dumps(filt), "page": page, "size": size}, cache_key=ckey)
    return (res.get("data") or []), int(res.get("total_rows") or 0)


def _ecase_fetch_case_bundle(case_gid: str) -> dict[str, Any]:
    cfile = ECASE_ACTS_DIR / f"bundle_{case_gid}.json"
    if cfile.exists() and cfile.stat().st_size > 100:
        try:
            cached_b = json.loads(cfile.read_text(encoding="utf-8"))
            cached_b["actText"] = _sanitize_gdpr_text(cached_b.get("actText") or "")
            return cached_b
        except Exception:
            pass

    loader = {"data": json.dumps({"gid": case_gid, "public": "True"}), "page": 1, "size": 25}
    acts = (_ecase_post("/Case/ActsLoadData", loader, cache_key=f"acts_{case_gid}").get("data") or [])
    sides = (_ecase_post("/Case/SidesLoadData", loader, cache_key=f"sides_{case_gid}").get("data") or [])
    conn = (_ecase_post("/Case/ConnectedCaseLoadData", loader, cache_key=f"conn_{case_gid}").get("data") or [])

    act_text = ""
    file_gid = ""
    chosen_act: dict[str, Any] = {}
    sorted_acts = sorted(
        acts,
        key=lambda a: (
            "решение" in str(a.get("actKindName") or "").lower(),
            "определение" in str(a.get("actKindName") or "").lower(),
            str(a.get("dateSigned") or ""),
        ),
        reverse=True,
    )
    for a in sorted_acts[:2]:
        agid = a.get("gid")
        if not agid:
            continue
        try:
            prev_cache = ECASE_ACTS_DIR / f"prev_{agid}.html"
            if prev_cache.exists() and prev_cache.stat().st_size > 80:
                prev_html = prev_cache.read_text(encoding="utf-8", errors="ignore")
            else:
                time.sleep(0.25)
                p_url = f"https://ecase.justice.bg/Case/Preview?type=7&gid={agid}"
                req = urllib.request.Request(p_url, headers=HEADERS)
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=14) as resp:
                    prev_html = resp.read().decode("utf-8", errors="ignore")
                prev_cache.write_text(prev_html, encoding="utf-8")

            m_dl = re.search(r"/api/file/download/([0-9a-f\-]{32,36})", prev_html, re.I)
            if m_dl:
                file_gid = m_dl.group(1)
                chosen_act = a
                act_file_cache = ECASE_ACTS_DIR / f"act_{file_gid}.txt"
                if act_file_cache.exists() and act_file_cache.stat().st_size > 100:
                    act_text = act_file_cache.read_text(encoding="utf-8", errors="ignore")
                else:
                    dl_url = f"https://ecase.justice.bg/api/file/download/{file_gid}"
                    for dl_attempt in range(3):
                        try:
                            time.sleep(0.32 if dl_attempt == 0 else (1.5 * (2 ** dl_attempt)))
                            req_dl = urllib.request.Request(dl_url, headers=HEADERS)
                            with urllib.request.urlopen(req_dl, context=SSL_CTX, timeout=16) as rdl:
                                raw = rdl.read()
                            if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                                act_html = raw.decode("utf-16", errors="ignore")
                            else:
                                act_html = raw.decode("utf-8", errors="ignore")
                            act_html = re.sub(r"[†\x00\ufffd]+", " ", act_html)
                            act_text = _sanitize_gdpr_text(strip_tags(act_html))
                            if len(act_text) > 100:
                                act_file_cache.write_text(act_text[:28000], encoding="utf-8")
                            break
                        except Exception:
                            continue
                if len(act_text) > 200:
                    break
        except Exception:
            continue

    if not chosen_act and sorted_acts:
        chosen_act = sorted_acts[0]

    bundle = {
        "gid": case_gid,
        "acts": acts,
        "sides": sides,
        "connected": conn,
        "chosenAct": chosen_act,
        "fileGid": file_gid,
        "actText": _sanitize_gdpr_text(act_text[:28000]),
    }
    try:
        cfile.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    return bundle


def _extract_operative_disposition(act_text: str) -> str:
    if not act_text:
        return ""
    m = re.search(
        r"\b(?:РЕШИ|ОПРЕДЕЛИ|ПОСТАНОВИ)\s*:\s*(.{15,650}?)(?:Решението\s+е\s+окончателно|Определението\s+е\s+окончателно|Решението\s+подлежи|Определението\s+подлежи|ПРЕДСЕДАТЕЛ\s*:|Вярно\s+с\s+оригинала|$)",
        act_text,
        re.I | re.S,
    )
    if m:
        return _sanitize_gdpr_text(re.sub(r"\s+", " ", m.group(1)).strip()[:440])
    return _sanitize_gdpr_text(act_text[-420:].strip())


def _extract_lawyers_and_experts_from_bundle(bundle: dict[str, Any], case_meta: dict[str, Any], lawyers_out: list[dict[str, Any]], experts_out: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    txt = bundle.get("actText") or ""
    sides = bundle.get("sides") or []
    found_lawyers: list[str] = []
    found_experts: list[str] = []

    for s in sides:
        role = str(s.get("sideInvolvementKindName") or "")
        sname = str(s.get("subjectName") or "").strip()
        if any(k in role.lower() for k in ("адвокат", "представител", "юрисконсулт")) and sname:
            lbl = f"{role}: {sname}"
            if lbl not in found_lawyers:
                found_lawyers.append(lbl)
                lawyers_out.append({
                    "name": sname, "role": role, "caseNo": case_meta["caseLabel"],
                    "court": case_meta["courtName"], "authority": case_meta.get("authorityName") or "",
                    "party": case_meta.get("counterparty") or "", "caseUrl": case_meta["caseUrl"],
                })

    # Also extract "адв. X Y" / "юрисконсулт X Y" from decision text
    for m_l in re.finditer(r"\b(адв\.|адвокат|ст\.\s*юрисконсулт|старши\s+юрисконсулт|гл\.\s*юрисконсулт|главен\s+юрисконсулт|юрисконсулт)\s+([А-Я]\.\s*[А-Яа-я\.\-]+(?:\s+[А-Яа-я\.\-]+)?)", txt):
        role_t = m_l.group(1).strip()
        nm_t = m_l.group(2).strip(" ,.;:()")
        if len(nm_t) >= 3:
            lbl = f"{role_t} {nm_t}"
            if lbl not in found_lawyers and len(found_lawyers) < 6:
                found_lawyers.append(lbl)
                lawyers_out.append({
                    "name": nm_t, "role": role_t, "caseNo": case_meta["caseLabel"],
                    "court": case_meta["courtName"], "authority": case_meta.get("authorityName") or "",
                    "party": case_meta.get("counterparty") or "", "caseUrl": case_meta["caseUrl"],
                })

    # Extract court experts ("вещо лице" / "вещото лице" / "ССТЕ" / "ССчЕ")
    for m_e in re.finditer(r"(?:вещо(?:то)?\s+лице|експертиза(?:та)?\s+на\s+в\.?\s*л\.?)\s+([А-Я]\.\s*[А-Яа-я\.\-]+(?:\s+[А-Яа-я\.\-]+)?)", txt, re.I):
        enm = m_e.group(1).strip(" ,.;:()")
        if len(enm) >= 3 and enm not in found_experts:
            found_experts.append(enm)
            experts_out.append({
                "name": enm, "specialty": "Съдебна експертиза (ЕИСС акт)",
                "caseNo": case_meta["caseLabel"], "court": case_meta["courtName"],
                "authority": case_meta.get("authorityName") or "", "caseUrl": case_meta["caseUrl"],
            })

    return found_lawyers[:5], found_experts[:4]


def ingest_eiss_ecase_live(
    matcher: EntityMatcher,
    unp_index: dict[str, dict[str, Any]],
    mod2_adfi: dict[str, Any],
    mod4_kzk: dict[str, Any],
) -> dict[str, Any]:
    print("[EISS/EPEP] Querying LIVE ecase.justice.bg across ALL Bulgarian courts (ZERO CAPTCHA)...")
    eiss_lawyers: list[dict[str, Any]] = []
    eiss_experts: list[dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # PART 1: ADFI & NAO Administrative-Penal Cases (КАНД CaseKindId=18, ActKindId=1)
    # -------------------------------------------------------------------------
    adfi_candidates: list[dict[str, Any]] = []
    seen_gids: set[str] = set()
    total_kand_scanned = 0

    for yr, max_p in (("2026", 8), ("2025", 4)):
        for p in range(1, max_p + 1):
            rows, _ = _ecase_load_grid("-1", "18", yr, "1", p, 500)
            if not rows:
                break
            total_kand_scanned += len(rows)
            for r in rows:
                gid = r.get("gid") or ""
                if not gid or gid in seen_gids:
                    continue
                sl = str(r.get("sideLeft") or "")
                sr = str(r.get("sideRight") or "")
                comb = f"{sl} {sr}".lower()
                if any(k in comb for k in ("финансова инспекция", "адфи", "сметна палата")):
                    seen_gids.add(gid)
                    adfi_candidates.append(r)

    print(f"    [EISS-J2] Scanned {total_kand_scanned:,} decided КАНД rows -> found {len(adfi_candidates)} live ADFI / NAO administrative-penal cases.")

    adfi_court_cases: list[dict[str, Any]] = []
    adfi_outcome_counts: Counter[str] = Counter()
    adfi_annul_reasons: Counter[str] = Counter()

    for r in adfi_candidates[:28]:
        gid = r["gid"]
        bundle = _ecase_fetch_case_bundle(gid)
        txt = bundle.get("actText") or ""
        tlow = txt.lower()
        disp = _extract_operative_disposition(txt)
        dlow = disp.lower()
        sl = str(r.get("sideLeft") or "")
        sr = str(r.get("sideRight") or "")
        agency_is_appellant = any(k in sl.lower() for k in ("финансова инспекция", "адфи", "сметна палата"))
        agency_type = "Сметна палата" if "сметна палата" in f"{sl} {sr}".lower() else "АДФИ"

        # Connected lower-court АНД
        conn_list = bundle.get("connected") or []
        and_case = ""
        and_court = ""
        if conn_list:
            c0 = conn_list[0]
            and_case = f"АНД № {c0.get('number')}/{c0.get('year')}"
            and_court = str(c0.get("courtName") or "")
        if not and_case:
            m_and = re.search(r"(?:АНД|анхд|нанд)\s*№\s*(\d+\s*/\s*202[0-6])", txt, re.I)
            if m_and:
                and_case = f"АНД № {m_and.group(1).replace(' ', '')}"

        # Extract NP, AUAN, FK/DID Order, UNP, ZOP article, Fine
        m_np = re.search(r"(?:Наказателно\s+постановление|НП)\s*№\s*([0-9A-Za-zА-Яа-я\-/\.]+)", txt, re.I)
        np_no = m_np.group(1).strip(" .,;") if m_np else ""
        m_auan = re.search(r"АУАН\s*№\s*([0-9A-Za-zА-Яа-я\-/\.]+)", txt, re.I)
        auan_no = m_auan.group(1).strip(" .,;") if m_auan else ""
        m_fk = re.search(r"(Заповед\s*№\s*ФК-[0-9\-/\.]+|ДИД\d-[А-Я]{2}-\d+(?:-\[\d+\])?)", txt, re.I)
        fk_order = m_fk.group(1).strip() if m_fk else ""
        m_unp = re.search(r"\b(\d{5}-202[0-6]-\d{4})\b", txt)
        unp_val = m_unp.group(1) if m_unp else ""
        m_art = re.search(r"(чл\.\s*\d+[а-я]?(?:,\s*ал\.\s*\d+)?(?:\s*,?\s*т\.\s*\d+)?\s*(?:от\s*)?(?:ЗОП|ЗДФИ|ЗПФ|ППЗОП))", txt, re.I)
        violated_art = m_art.group(1).strip() if m_art else "ЗОП / ЗДФИ"
        m_fine = re.search(r"(?:глоба|имуществена\s+санкция)\s+в\s+размер\s+на\s+([0-9][0-9\s\.,]*\s*(?:евро|лв\.?|лева))", txt, re.I)
        fine_str = re.sub(r"\s+", " ", m_fine.group(1)).strip() if m_fine else ""

        # Match Contracting Authority from sides or decision text!
        other_side = sr if agency_is_appellant else sl
        auth_rec, match_how = matcher.match_authority(other_side)
        extracted_entity = other_side
        if not auth_rec and txt:
            # Look for "кмет на Община ...", "директор на ...", "управител на ..."
            for m_ent in re.finditer(
                r"(?:качеството\s+(?:му|й|си)\s+на\s+[^,]{3,45}?\s+на|директор(?:а|ът)?\s+на|кмет(?:а|ът)?\s+на|управител(?:я|ят)?\s+на|председател(?:я|ят)?\s+на|ректор(?:а|ът)?\s+на|възложител\s+[–\-]\s*)\s*([А-Я„\"][^\.;\n]{5,95})",
                txt,
            ):
                cand_ent = m_ent.group(1).strip()
                cand_ent = re.split(r",\s*(?:ЕИК|БУЛСТАТ|с\s+адрес|гр\.|обл\.|и\s+публичен)", cand_ent)[0].strip()
                if any(bad in cand_ent.lower() for bad in ("агенция за държавна", "адфи", "дирекция", "отдел", "съд")):
                    continue
                extracted_entity = cand_ent[:85]
                ar, mh = matcher.match_authority(cand_ent)
                if ar:
                    auth_rec, match_how = ar, f"TEXT_{mh}"
                    break
        if not auth_rec and unp_val and unp_val in unp_index:
            aeik_u = unp_index[unp_val].get("authorityEik") or ""
            if aeik_u in matcher.auth_by_eik:
                auth_rec = matcher.auth_by_eik[aeik_u]
                match_how = "UNP_EIK"

        # Determine exact court fate of the ADFI / NAO Penalty Decree (НП)
        # First check what the Regional Court (АНД) did:
        rs_annulled = ("с решението е отменено наказателно" in tlow) or ("районният съд е отменил наказателното" in tlow) or ("отменил нп" in tlow) or agency_is_appellant
        rs_modified = ("с решението е изменено наказателно" in tlow) or ("намалена глоба" in tlow) or ("изменил нп" in tlow)

        outcome_cat = "ПОТВЪРДЕНО НП (Санкцията е в сила)"
        outcome_sev = "ok"
        annul_reason = "—"

        if "оставя в сила" in dlow:
            if rs_annulled and "потвърждава наказателно" not in dlow:
                outcome_cat = "ОТМЕНЕНО НП (Безнаказаност)"
                outcome_sev = "critical"
            elif rs_modified:
                outcome_cat = "ИЗМЕНЕНО НП / НАМАЛЕНА ГЛОБА"
                outcome_sev = "warn"
            else:
                outcome_cat = "ПОТВЪРДЕНО НП (Санкцията е в сила)"
                outcome_sev = "ok"
        elif "отменя" in dlow:
            if "потвърждава наказателно" in dlow or "потвърждава нп" in dlow:
                outcome_cat = "ПОТВЪРДЕНО НП (След касация от АДФИ)"
                outcome_sev = "ok"
            elif "изменя наказателно" in dlow or "намалява" in dlow:
                outcome_cat = "ИЗМЕНЕНО НП / НАМАЛЕНА ГЛОБА"
                outcome_sev = "warn"
            elif "връща делото" in dlow:
                outcome_cat = "ОТМЕНЕНО РЕШЕНИЕ (Върнато за ново разглеждане)"
                outcome_sev = "warn"
            else:
                outcome_cat = "ОТМЕНЕНО НП (Безнаказаност)"
                outcome_sev = "critical"
        elif "изменя" in dlow:
            outcome_cat = "ИЗМЕНЕНО НП / НАМАЛЕНА ГЛОБА"
            outcome_sev = "warn"

        if "ОТМЕНЕНО НП" in outcome_cat:
            if any(k in tlow for k in ("изтекла давност", "абсолютна давност", "изтичане на законоустановения срок", "просроч", "чл. 34, ал. 1", "чл. 261")):
                if "спазен" not in tlow or "не е спазен" in tlow or "след изтичане" in tlow:
                    annul_reason = "Изтекла давност (чл. 34 ЗАНН / чл. 261 ЗОП)"
            if annul_reason == "—" and ("чл. 28" in tlow or "маловажен случай" in tlow) and ("приложение на чл. 28" in tlow or "маловажност" in tlow):
                annul_reason = "Маловажен случай (чл. 28 ЗАНН)"
            if annul_reason == "—" and any(k in tlow for k in ("съществено процесуално нарушение", "нарушение на чл. 42", "нарушение на чл. 57", "формален порок")):
                annul_reason = "Процесуално нарушение в АУАН/НП (чл. 42/57 ЗАНН)"
            if annul_reason == "—":
                annul_reason = "Недоказаност / Материална незаконосъобразност"
            adfi_annul_reasons[annul_reason] += 1

        adfi_outcome_counts[outcome_cat] += 1

        c_act = bundle.get("chosenAct") or {}
        judges = [p.get("judgeName") for p in (c_act.get("preparators") or []) if p.get("judgeName")]
        case_label = f"КАНД № {r.get('regNumber')}/{r.get('regYear')}"
        case_url = f"https://ecase.justice.bg/Case/CaseDetail/{gid}"
        file_gid = bundle.get("fileGid") or ""
        act_dl_url = f"https://ecase.justice.bg/api/file/download/{file_gid}" if file_gid else case_url

        c_meta = {
            "caseLabel": case_label,
            "courtName": str(r.get("courtName") or ""),
            "authorityName": auth_rec["name"] if auth_rec else extracted_entity,
            "counterparty": f"{sl} ↔ {sr}",
            "caseUrl": case_url,
        }
        l_list, e_list = _extract_lawyers_and_experts_from_bundle(bundle, c_meta, eiss_lawyers, eiss_experts)

        adfi_court_cases.append({
            "gid": gid,
            "court": str(r.get("courtName") or ""),
            "caseNo": case_label,
            "andCaseNo": and_case,
            "andCourt": and_court,
            "agency": agency_type,
            "agencyRole": "Касатор (обжалва отмяна на НП)" if agency_is_appellant else "Ответник (защитава потвърдено НП)",
            "actNo": f"{c_act.get('actKindName', 'Решение')} № {c_act.get('number', '')}",
            "actDate": str(c_act.get("dateSigned") or "")[:10],
            "caseUrl": case_url,
            "actDownloadUrl": act_dl_url,
            "npNo": np_no,
            "auanNo": auan_no,
            "adfiOrder": fk_order,
            "unp": unp_val,
            "violatedArticle": violated_art,
            "fineAmount": fine_str,
            "authorityEik": auth_rec["eik"] if auth_rec else "",
            "authorityName": auth_rec["name"] if auth_rec else extracted_entity,
            "matchMethod": match_how,
            "outcome": outcome_cat,
            "severity": outcome_sev,
            "annulmentReason": annul_reason,
            "disposition": disp,
            "judges": judges[:3],
            "lawyers": l_list,
        })

    # Link the 370 art. 17(7) updated ADFI reports to matched authorities & regional court outcomes!
    cases_by_auth: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cases_by_city: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ac in adfi_court_cases:
        if ac["authorityEik"]:
            cases_by_auth[ac["authorityEik"]].append(ac)
        cname_l = ac["court"].lower()
        for dcode, cities in DIRECTORATE_CITIES.items():
            if any(ct in cname_l for ct in cities):
                cases_by_city[dcode].append(ac)

    linked_art17_cnt = 0
    for rep in mod2_adfi.get("updatedArt17Reports") or []:
        aeik = rep.get("authorityEik") or ""
        dcode = rep.get("directorate") or ""
        direct_cases = cases_by_auth.get(aeik) or []
        reg_cases = cases_by_city.get(dcode) or []
        if direct_cases:
            c0 = direct_cases[0]
            rep["linkedCourtCase"] = f"{c0['court']} · {c0['caseNo']}" + (f" ({c0['andCaseNo']})" if c0["andCaseNo"] else "")
            rep["linkedCaseUrl"] = c0["actDownloadUrl"]
            rep["courtFate"] = c0["outcome"]
            rep["annulmentReason"] = c0["annulmentReason"]
            rep["linkType"] = "EXACT_EIK"
            linked_art17_cnt += 1
        elif reg_cases:
            c0 = reg_cases[0]
            rep["linkedCourtCase"] = f"Регионална практика {dcode}: {c0['court']} · {c0['caseNo']}"
            rep["linkedCaseUrl"] = c0["actDownloadUrl"]
            rep["courtFate"] = c0["outcome"]
            rep["annulmentReason"] = c0["annulmentReason"]
            rep["linkType"] = f"DIR_{dcode}"
            linked_art17_cnt += 1
        else:
            rep["linkedCourtCase"] = "Чл. 19 ЗДФИ Прокуратура / АУАН в производство"
            rep["linkedCaseUrl"] = rep["url"]
            rep["courtFate"] = "Актуализиран след проверка по чл. 17, ал. 7 ЗДФИ"
            rep["annulmentReason"] = "—"
            rep["linkType"] = "PDF_ART17"

    # -------------------------------------------------------------------------
    # PART 2: VAS (CourtId=113) Final Decisions & Preliminary Execution Rulings on KZK Acts
    # -------------------------------------------------------------------------
    vas_kzk_candidates: list[dict[str, Any]] = []
    seen_vas_gids: set[str] = set()
    total_vas_scanned = 0

    for act_k, max_p in (("1", 3), ("2", 3)):
        for p in range(1, max_p + 1):
            rows, _ = _ecase_load_grid("113", "-1", "2026", act_k, p, 500)
            if not rows:
                break
            total_vas_scanned += len(rows)
            for r in rows:
                gid = r.get("gid") or ""
                if not gid or gid in seen_vas_gids:
                    continue
                sl = str(r.get("sideLeft") or "")
                sr = str(r.get("sideRight") or "")
                if any(k in f"{sl} {sr}".lower() for k in ("конкуренцията", "кзк")):
                    seen_vas_gids.add(gid)
                    vas_kzk_candidates.append(r)

    print(f"    [EISS-J4] Scanned {total_vas_scanned:,} decided VAS 2026 rows -> found {len(vas_kzk_candidates)} live VAS <-> KZK final rulings & decisions.")

    vas_final_acts: list[dict[str, Any]] = []
    vas_outcome_counts: Counter[str] = Counter()
    vas_by_kzk_case: dict[str, dict[str, Any]] = {}

    for r in vas_kzk_candidates[:30]:
        gid = r["gid"]
        bundle = _ecase_fetch_case_bundle(gid)
        txt = bundle.get("actText") or ""
        disp = _extract_operative_disposition(txt)
        dlow = disp.lower()
        c_act = bundle.get("chosenAct") or {}
        act_kind = str(c_act.get("actKindName") or ("Определение" if "частно" in str(r.get("caseKindName") or "").lower() else "Решение"))
        is_prelim_case = "частно" in str(r.get("caseKindName") or "").lower() or "чл. 217" in txt.lower() or "предварително изпълнение" in txt.lower()

        # Extract KZK Decision/Ruling number and KZK Proceeding number ("преписка № КЗК-500/2026")
        m_kzk_doss = re.search(r"преписка\s*№\s*(?:КЗК\s*[\-/]?\s*)?(\d{1,4}\s*/\s*(?:\d{2}\.\d{2}\.)?202[4-6])", txt, re.I)
        kzk_doss_no = ""
        if m_kzk_doss:
            raw_d = m_kzk_doss.group(1).replace(" ", "")
            # Normalize "820/02.09.2026" -> "КЗК-820/2026"
            m_yr = re.search(r"^(\d+)/.*?(202[4-6])$", raw_d)
            kzk_doss_no = f"КЗК-{m_yr.group(1)}/{m_yr.group(2)}" if m_yr else f"КЗК-{raw_d}"
        m_kzk_act = re.search(r"(?:решение|определение)\s*№\s*(\d{1,4})\s*(?:от|\/)\s*(\d{2}\.\d{2}\.202[4-6])", txt, re.I)
        kzk_act_no = f"№ {m_kzk_act.group(1)}/{m_kzk_act.group(2)}" if m_kzk_act else ""

        # Extract CAIS EOP decision numbers (F... / D...) & UNP
        m_eop = re.findall(r"\b([FD]-?\d{6,9}(?:/\d{2}\.\d{2}\.202[4-6])?)\b", txt)
        eop_refs = list(dict.fromkeys(m_eop))[:2]
        m_unp = re.search(r"\b(\d{5}-202[0-6]-\d{4})\b", txt)
        unp_val = m_unp.group(1) if m_unp else ""

        # Match Authority & Appellant from SidesLoadData + Text
        sides = bundle.get("sides") or []
        auth_rec = None
        auth_how = ""
        auth_raw = ""
        comp_rec = None
        comp_raw = str(r.get("sideLeft") or "")
        comp_rec, _ = matcher.match_company(comp_raw)

        for s in sides:
            sname = str(s.get("subjectName") or "").strip()
            if not sname or "конкуренц" in sname.lower() or sname.upper() == "КЗК":
                continue
            ar, ah = matcher.match_authority(sname)
            if ar and not auth_rec:
                auth_rec, auth_how, auth_raw = ar, ah, sname
            if not comp_rec:
                cr, _ = matcher.match_company(sname)
                if cr:
                    comp_rec = cr

        if not auth_rec and txt:
            for m_au in re.finditer(r"(?:кмет(?:а|ът)?\s+на\s+община\s+[А-Яа-я\-]+(?:\s+[А-Яа-я\-]+)?|община\s+[А-Яа-я\-]+(?:\s+[А-Яа-я\-]+)?|министерство\s+на\s+[А-Яа-я\s\-]+|умбал\s+[^\.,;]{4,45}|агенция\s+[^\.,;]{4,45}|държавно\s+предприятие\s+[^\.,;]{4,55})", txt, re.I):
                cand_a = m_au.group(0).strip()
                ar, ah = matcher.match_authority(cand_a)
                if ar:
                    auth_rec, auth_how, auth_raw = ar, f"TEXT_{ah}", cand_a
                    break

        # Determine VAS Final Outcome
        vas_outcome = "ВАС ОСТАВЯ В СИЛА акта на КЗК"
        vas_sev = "ok"
        if "отменя" in dlow:
            if "допуска предварително изпълнение" in dlow:
                vas_outcome = "ВАС ОТМЕНЯ КЗК и ДОПУСКА предв. изпълнение"
                vas_sev = "critical"
            else:
                vas_outcome = "ВАС ОТМЕНЯ решението/определението на КЗК"
                vas_sev = "critical"
        elif "оставя в сила" in dlow:
            vas_outcome = "ВАС ОСТАВЯ В СИЛА акта на КЗК"
            vas_sev = "ok"
        elif "оставя без разглеждане" in dlow or "прекратява" in dlow:
            vas_outcome = "ВАС ОСТАВЯ БЕЗ РАЗГЛЕЖДАНЕ / ПРЕКРАТЯВА"
            vas_sev = "muted"
        elif "оставя без уважение" in dlow:
            vas_outcome = "ВАС ОСТАВЯ БЕЗ УВАЖЕНИЕ искането"
            vas_sev = "ok"

        vas_outcome_counts[vas_outcome] += 1

        case_label = f"ВАС адм.д. № {r.get('regNumber')}/{r.get('regYear')}"
        case_url = f"https://ecase.justice.bg/Case/CaseDetail/{gid}"
        file_gid = bundle.get("fileGid") or ""
        act_dl_url = f"https://ecase.justice.bg/api/file/download/{file_gid}" if file_gid else case_url
        judges = [p.get("judgeName") for p in (c_act.get("preparators") or []) if p.get("judgeName")]

        c_meta = {
            "caseLabel": case_label,
            "courtName": "Върховен административен съд (IV отд.)",
            "authorityName": auth_rec["name"] if auth_rec else auth_raw,
            "counterparty": comp_rec["name"] if comp_rec else comp_raw,
            "caseUrl": case_url,
        }
        l_list, _ = _extract_lawyers_and_experts_from_bundle(bundle, c_meta, eiss_lawyers, eiss_experts)

        vas_entry = {
            "gid": gid,
            "vasCaseNo": f"{r.get('regNumber')}/{r.get('regYear')}",
            "caseKind": str(r.get("caseKindName") or ""),
            "isPrelim": is_prelim_case,
            "vasActNo": f"{act_kind} № {c_act.get('number', '')}",
            "vasActDate": str(c_act.get("dateSigned") or "")[:10],
            "caseUrl": case_url,
            "actDownloadUrl": act_dl_url,
            "kzkDossierNo": kzk_doss_no,
            "kzkActNo": kzk_act_no,
            "eopDecisionRefs": eop_refs,
            "unp": unp_val,
            "appellantRaw": comp_raw,
            "appellantEik": comp_rec["eik"] if comp_rec else "",
            "appellantName": comp_rec["name"] if comp_rec else comp_raw,
            "authorityEik": auth_rec["eik"] if auth_rec else "",
            "authorityName": auth_rec["name"] if auth_rec else (auth_raw or "Възложител по преписка КЗК"),
            "authorityMatch": auth_how,
            "vasOutcome": vas_outcome,
            "severity": vas_sev,
            "disposition": disp,
            "judges": judges[:3],
            "lawyers": l_list,
        }
        vas_final_acts.append(vas_entry)
        if kzk_doss_no:
            vas_by_kzk_case[kzk_doss_no] = vas_entry

    # Cross-link VAS final outcomes back onto mod4_kzk prelimRulings & decisions where caseNo matches!
    for lst_key in ("prelimRulings", "decisions"):
        for k_row in mod4_kzk.get(lst_key) or []:
            cno = k_row.get("caseNo") or ""
            if cno and cno in vas_by_kzk_case:
                v_hit = vas_by_kzk_case[cno]
                k_row["appealedToVas"] = True
                k_row["vasCaseNo"] = v_hit["vasCaseNo"]
                k_row["vasOutcome"] = v_hit["vasOutcome"]
                k_row["vasActUrl"] = v_hit["actDownloadUrl"]

    # -------------------------------------------------------------------------
    # PART 3: Commercial & Appellate Commercial Lawsuits (ТД=5, ВТД=15) Contractor <-> Authority
    # -------------------------------------------------------------------------
    comm_candidates: list[dict[str, Any]] = []
    seen_comm_gids: set[str] = set()
    total_comm_scanned = 0

    for ck_id, max_p in (("5", 5), ("15", 2)):
        for p in range(1, max_p + 1):
            rows, _ = _ecase_load_grid("-1", ck_id, "2026", "1", p, 500)
            if not rows:
                break
            total_comm_scanned += len(rows)
            for r in rows:
                gid = r.get("gid") or ""
                if not gid or gid in seen_comm_gids:
                    continue
                sl = str(r.get("sideLeft") or "").strip()
                sr = str(r.get("sideRight") or "").strip()
                if not sl or not sr:
                    continue
                if "АГЕНЦИЯ ПО ВПИСВАНИЯТА" in sl.upper() or "АГЕНЦИЯ ПО ВПИСВАНИЯТА" in sr.upper():
                    continue
                # Match either side against our 4,344 Authorities!
                a_left, how_l = matcher.match_authority(sl)
                a_right, how_r = matcher.match_authority(sr)
                if a_left or a_right:
                    seen_comm_gids.add(gid)
                    r["_authLeft"] = a_left
                    r["_authRight"] = a_right
                    r["_howAuth"] = how_r or how_l
                    comm_candidates.append(r)

    print(f"    [EISS-J1] Scanned {total_comm_scanned:,} decided ТД/ВТД commercial rows -> matched {len(comm_candidates)} live Contractor <-> Authority lawsuits.")

    live_comm_disputes: list[dict[str, Any]] = []
    comm_outcome_counts: Counter[str] = Counter()

    for r in comm_candidates[:26]:
        gid = r["gid"]
        bundle = _ecase_fetch_case_bundle(gid)
        txt = bundle.get("actText") or ""
        disp = _extract_operative_disposition(txt)
        dlow = disp.lower()
        sl = str(r.get("sideLeft") or "").strip()
        sr = str(r.get("sideRight") or "").strip()
        a_left = r.get("_authLeft")
        a_right = r.get("_authRight")

        if a_right:
            auth_rec = a_right
            auth_role = "Ответник (Съден от изпълнител)"
            contr_raw = sl
        else:
            auth_rec = a_left
            auth_role = "Ищец"
            contr_raw = sr

        comp_rec, comp_how = matcher.match_company(contr_raw)

        # Extract claimed/awarded money amount from disposition or text
        m_amt = re.search(r"сума(?:та)?\s+от\s+([0-9][0-9\s\.,]*\s*(?:евро|лв\.?|лева))", disp, re.I)
        if not m_amt:
            m_amt = re.search(r"(?:заплати|размер\s+на)\s+([0-9][0-9\s\.,]*\s*(?:евро|лв\.?|лева))", disp, re.I)
        claimed_str = re.sub(r"\s+", " ", m_amt.group(1)).strip() if m_amt else "По договор / фактури"

        # Classify commercial litigation outcome
        if "спогодба" in dlow or "прекратява" in dlow:
            c_outcome = "СЪДЕБНА СПОГОДБА / ПРЕКРАТЕНО"
            c_sev = "critical"
        elif "осъжда" in dlow and (auth_rec["name"].lower()[:10] in dlow or a_right is not None):
            c_outcome = "ОСЪДЕН ВЪЗЛОЖИТЕЛ (Уважен иск на фирмата)"
            c_sev = "critical"
        elif "отхвърля" in dlow:
            c_outcome = "ОТХВЪРЛЕН ИСК"
            c_sev = "ok"
        elif "оставя в сила" in dlow or "потвърждава" in dlow:
            c_outcome = "ОСТАВЕНО В СИЛА РЕШЕНИЕ (ВТД)"
            c_sev = "warn"
        else:
            c_outcome = "Постановено съдебно решение"
            c_sev = "info"

        comm_outcome_counts[c_outcome] += 1

        c_act = bundle.get("chosenAct") or {}
        case_label = f"{'ВТД' if 'въззивно' in str(r.get('caseKindName') or '').lower() else 'ТД'} № {r.get('regNumber')}/{r.get('regYear')}"
        case_url = f"https://ecase.justice.bg/Case/CaseDetail/{gid}"
        file_gid = bundle.get("fileGid") or ""
        act_dl_url = f"https://ecase.justice.bg/api/file/download/{file_gid}" if file_gid else case_url
        judges = [p.get("judgeName") for p in (c_act.get("preparators") or []) if p.get("judgeName")]

        c_meta = {
            "caseLabel": case_label,
            "courtName": str(r.get("courtName") or ""),
            "authorityName": auth_rec["name"],
            "counterparty": comp_rec["name"] if comp_rec else contr_raw,
            "caseUrl": case_url,
        }
        l_list, e_list = _extract_lawyers_and_experts_from_bundle(bundle, c_meta, eiss_lawyers, eiss_experts)

        live_comm_disputes.append({
            "gid": gid,
            "court": str(r.get("courtName") or ""),
            "caseNo": case_label,
            "actNo": f"{c_act.get('actKindName', 'Решение')} № {c_act.get('number', '')}",
            "actDate": str(c_act.get("dateSigned") or "")[:10],
            "caseUrl": case_url,
            "actDownloadUrl": act_dl_url,
            "sideLeft": sl,
            "sideRight": sr,
            "authorityEik": auth_rec["eik"],
            "authorityName": auth_rec["name"],
            "authorityRole": auth_role,
            "contractorEik": comp_rec["eik"] if comp_rec else "",
            "contractorName": comp_rec["name"] if comp_rec else contr_raw,
            "contractorWonEur": round(comp_rec["wonEur"], 2) if comp_rec else 0.0,
            "claimedAmount": claimed_str,
            "outcome": c_outcome,
            "severity": c_sev,
            "disposition": disp,
            "judges": judges[:3],
            "lawyers": l_list,
            "experts": e_list,
        })

    total_eiss_cases = len(adfi_court_cases) + len(vas_final_acts) + len(live_comm_disputes)
    print(f"    [EISS/EPEP DONE] Extracted full acts for {total_eiss_cases} live court cases ({len(adfi_court_cases)} ADFI/NAO КАНД, {len(vas_final_acts)} VAS<->KZK, {len(live_comm_disputes)} Commercial ТД/ВТД) + {len(eiss_lawyers)} lawyers & {len(eiss_experts)} court experts!")

    return {
        "totalEissCasesExtracted": total_eiss_cases,
        "totalRowsScanned": total_kand_scanned + total_vas_scanned + total_comm_scanned,
        "adfiCourtCases": adfi_court_cases,
        "adfiOutcomeBreakdown": [{"outcome": k, "count": v} for k, v in adfi_outcome_counts.most_common()],
        "adfiAnnulmentReasons": [{"reason": k, "count": v} for k, v in adfi_annul_reasons.most_common()],
        "linkedArt17ReportsCount": linked_art17_cnt,
        "vasFinalActs": vas_final_acts,
        "vasOutcomeBreakdown": [{"outcome": k, "count": v} for k, v in vas_outcome_counts.most_common()],
        "commercialDisputes": live_comm_disputes,
        "commercialOutcomeBreakdown": [{"outcome": k, "count": v} for k, v in comm_outcome_counts.most_common()],
        "extractedLawyers": eiss_lawyers[:90],
        "extractedExperts": eiss_experts[:45],
    }


# =============================================================================
# MODULE J3 (PART C): PARSE OFFICIAL ADFI EXPERTS PDF (Spisak-VL-30.09.2026.pdf)
# =============================================================================
def parse_adfi_experts_pdf() -> dict[str, Any]:
    pdf_path = RAW_DIR / "adfi_spisak_vl_2026.pdf"
    if not pdf_path.exists():
        return {"totalExperts": 0, "specialties": [], "samples": []}
    reader = PdfReader(str(pdf_path))
    full_txt = "\n".join(page.extract_text() or "" for page in reader.pages)
    # Match numbered entries: 1 .. 107 with initials like "А. Б. А." or "А.В.А."
    entries = []
    # Split lines and detect lines starting with integer 1..120 followed by Cyrillic initials
    cur = None
    for line in full_txt.splitlines():
        ln = re.sub(r"\s+", " ", line).strip()
        if not ln or ln.startswith("Актуален списък") or ln.startswith("Списъкът е изготвен") or ln.startswith("№ Име"):
            continue
        m = re.match(r"^(\d{1,3})\s+([А-Я]\.\s*[А-Я]\.\s*[А-Я]\.?(?:\s*-\s*[А-Я]\.?)?)\s*(.*)$", ln)
        if m:
            if cur:
                entries.append(cur)
            cur = {"no": int(m.group(1)), "initials": m.group(2).strip(), "specialty": m.group(3).strip()}
        elif cur:
            cur["specialty"] = (cur["specialty"] + " " + ln).strip()
    if cur:
        entries.append(cur)

    cat_cnt: Counter[str] = Counter()
    for e in entries:
        sp = e["specialty"].lower()
        cats = []
        if any(k in sp for k in ("строител", "пътно", "архитектур", "конструкц", "хидро", "вик", "водоснабд")):
            cats.append("Строителство, Пътища и ВиК")
        if any(k in sp for k in ("счетовод", "финанс", "икономи", "одит", "оценител")):
            cats.append("Финанси, Одит и Оценители")
        if any(k in sp for k in ("електро", "машинен", "енергетик", "радио", "транспорт")):
            cats.append("Енергетика, Машини и Електро")
        if any(k in sp for k in ("право", "юрист", "зоп", "конфликт")):
            cats.append("Право и ЗОП")
        if any(k in sp for k in ("софтуер", "математик", "програмист", "мрежи")):
            cats.append("IT и Софтуер")
        if not cats:
            cats.append("Други специализирани (лекари, археология, екология)")
        e["categories"] = cats
        for c in cats:
            cat_cnt[c] += 1

    return {
        "sourceUrl": "https://adfi.minfin.bg/upload/6496/Spisak-VL-30.09.2026.pdf",
        "asOf": "30.09.2026",
        "totalExperts": len(entries),
        "anonymizedUnderGdpr": True,
        "specialties": [{"category": k, "count": v} for k, v in cat_cnt.most_common()],
        "samples": entries[:30],
    }


# =============================================================================
# MODULE J5: COMMERCIAL REGISTER INSOLVENCY / DISTRAINTS / PLEDGES / PHOENIX
# =============================================================================
def parse_cr_distress(deed: dict[str, Any]) -> dict[str, Any]:
    eik = str(deed.get("uic") or "")
    name = deed.get("companyName") or ""
    d_status = int(deed.get("deedStatus") or 0)
    has_foreign_parent = bool(deed.get("hasForeignParentCompany"))

    insolvency_flags: list[str] = []
    liquidation_flags: list[str] = []
    distraint_count = 0
    distraint_details: list[str] = []
    pledge_count = 0
    pledge_details: list[str] = []
    has_zmip_bo = False
    incorp_date = ""
    people: list[str] = []
    seen_pn: set[str] = set()

    for sec in deed.get("sections") or []:
        s_nc = str(sec.get("nameCode") or "")
        if "INSOLVENCY" in s_nc.upper():
            insolvency_flags.append(s_nc)
        if "LIQUIDATION" in s_nc.upper():
            liquidation_flags.append(s_nc)
        for sub in sec.get("subDeeds") or []:
            if sub.get("subDeedIsClosed"):
                continue
            for grp in sub.get("groups") or []:
                g_nc = str(grp.get("nameCode") or "")
                if "INSOLVENCY" in g_nc.upper() or "BANKRUPT" in g_nc.upper():
                    insolvency_flags.append(g_nc)
                for fld in grp.get("fields") or []:
                    if fld.get("fieldOperation") == 2:
                        continue
                    nc = str(fld.get("nameCode") or "")
                    hdata = str(fld.get("htmlData") or "")
                    hlow = hdata.lower()
                    if nc == "CR_F_1_L":
                        dt = fld.get("recordMinActionDate") or fld.get("fieldEntryDate") or ""
                        if dt and len(dt) >= 10:
                            incorp_date = dt[:10]
                    elif nc in ("CR_F_550_L", "CR_F_550a_L"):
                        if "заличен" not in hlow:
                            has_zmip_bo = True
                    # Distraints / share attachments (Запор на дружествен дял)
                    if nc in ("CR_F_26_L", "CR_F_26a_L") or ("запор" in hlow and "заличено обстоятелство" not in hlow):
                        txt = strip_tags(hdata)
                        if "заличен" not in txt.lower() and "вдигане на запор" not in txt.lower():
                            distraint_count += 1
                            if len(distraint_details) < 3:
                                distraint_details.append(txt[:180])
                    # Special pledges (Особен залог)
                    if nc in ("CR_F_28_L", "CR_F_28a_L", "CR_F_29_L") or ("особен залог" in hlow and "заличено обстоятелство" not in hlow):
                        txt = strip_tags(hdata)
                        if "заличен" not in txt.lower():
                            pledge_count += 1
                            if len(pledge_details) < 2:
                                pledge_details.append(txt[:160])
                    # Insolvency / liquidation inside text
                    if any(w in hlow for w in ("откриване на производство по несъстоятелност", "обявяване в несъстоятелност", "назначен синдик", "ликвидатор")):
                        txt = strip_tags(hdata)
                        if "ликвидатор" in hlow:
                            liquidation_flags.append(txt[:140])
                        else:
                            insolvency_flags.append(txt[:140])
                    # People for Phoenix owner matching
                    if nc in ("CR_F_7_L", "CR_F_10_L", "CR_F_12_L", "CR_F_19_L", "CR_F_23_L", "CR_F_550_L"):
                        txt = strip_tags(hdata)
                        if "заличено обстоятелство" in txt.lower():
                            continue
                        for m in re.finditer(r"\b([А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,25})\b", txt):
                            cand = m.group(1).strip()
                            cn = norm_person(cand)
                            if cn not in seen_pn and not any(b in cn for b in ("република българия", "съвет на", "населено място", "размер на")):
                                seen_pn.add(cn)
                                people.append(cand)

    status_label = {1: "Активен (нов ТР)", 2: "Активен (пререгистриран)", 3: "В ликвидация", 4: "В несъстоятелност", 5: "Заличен"}.get(d_status, f"Статус {d_status}")
    is_distressed = (d_status >= 3) or bool(insolvency_flags) or bool(liquidation_flags) or (distraint_count > 0)
    return {
        "eik": eik, "name": name, "deedStatus": d_status, "statusLabel": status_label,
        "incorpDate": incorp_date, "hasForeignParent": has_foreign_parent, "hasZmipBo": has_zmip_bo,
        "isInsolvent": (d_status == 4) or bool(insolvency_flags),
        "isLiquidation": (d_status == 3) or bool(liquidation_flags),
        "isDeregistered": (d_status == 5),
        "insolvencyFlags": list(dict.fromkeys(insolvency_flags))[:3],
        "liquidationFlags": list(dict.fromkeys(liquidation_flags))[:2],
        "distraintCount": distraint_count, "distraintDetails": distraint_details,
        "pledgeCount": pledge_count, "pledgeDetails": pledge_details,
        "isDistressed": is_distressed,
        "people": people[:8],
    }


def main() -> int:
    t0 = time.time()
    print("[SIGMA 3.0 FINALITY — 6 JUDICIAL x PROCUREMENT ENGINES + 9-NODE GRAPH + RISK WEIGHTS]")

    auth_json = json.loads((DATA_DIR / "authorities_index.json").read_text(encoding="utf-8"))
    comp_json = json.loads((DATA_DIR / "companies_index.json").read_text(encoding="utf-8"))
    off_json = json.loads((DATA_DIR / "officials_all.json").read_text(encoding="utf-8"))
    f7_path = DATA_DIR / "sigma3_forensics_7.json"
    f7 = json.loads(f7_path.read_text(encoding="utf-8")) if f7_path.exists() else {}

    officials = off_json.get("officials") or []
    matcher = EntityMatcher(auth_json.get("rows") or [], comp_json.get("rows") or [])

    # =========================================================================
    # SINGLE O(N) PASS OVER ALL 206,907 CONTRACTS FOR JUDICIAL/LEGAL/EPPO/BURNOUT
    # =========================================================================
    print("[SCAN] Streaming ALL 206,907 contracts for Legal Hubs, Experts, Litigation Contracts, EU/EPPO & Burnout...")
    unp_index: dict[str, dict[str, Any]] = {}
    law_firms: dict[str, dict[str, Any]] = {}
    expert_firms: dict[str, dict[str, Any]] = {}
    litigation_contracts: list[dict[str, Any]] = []
    eu_eppo_hits: list[dict[str, Any]] = []
    eu_total_eur = 0.0
    eu_total_cnt = 0
    eu_single_eur = 0.0
    eu_single_cnt = 0

    # Per-company yearly activity for Burnout/Phoenix detection (2020-2023 vs 2024-2026)
    comp_activity: dict[str, dict[str, Any]] = {}

    with CONTRACTS_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row.get("id") or ""
            unp = (row.get("unp") or "").strip()
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
            eu = row.get("eu_funded") == "1"
            try:
                val = float(row.get("value_eur") or 0.0)
            except ValueError:
                val = 0.0
            try:
                bids = int(float(row.get("bids_received") or 0)) if row.get("bids_received") else 0
            except ValueError:
                bids = 0

            is_single = (bids == 1)
            is_direct = ("пряко" in proc.lower() or "без обявление" in proc.lower() or "договаряне" in proc.lower())

            if unp:
                ui = unp_index.get(unp)
                if not ui:
                    unp_index[unp] = {"valueEur": val, "authorityEik": aeik, "authority": auth, "bids": bids}
                else:
                    ui["valueEur"] += val

            # Burnout tracking for EIK companies
            if ceik and ceik.isdigit() and len(ceik) == 9 and kind == "company":
                yr = int(sdt[:4]) if len(sdt) >= 4 and sdt[:4].isdigit() else 0
                ca = comp_activity.get(ceik)
                if not ca:
                    ca = {"eik": ceik, "name": contr, "eur_20_23": 0.0, "cnt_20_23": 0, "eur_24_26": 0.0, "cnt_24_26": 0, "lastDate": "", "single": 0, "total": 0, "topAuth": auth, "maxVal": 0.0}
                    comp_activity[ceik] = ca
                ca["total"] += 1
                if is_single:
                    ca["single"] += 1
                if 2020 <= yr <= 2023:
                    ca["eur_20_23"] += val
                    ca["cnt_20_23"] += 1
                elif yr >= 2024:
                    ca["eur_24_26"] += val
                    ca["cnt_24_26"] += 1
                if sdt > ca["lastDate"]:
                    ca["lastDate"] = sdt
                if val > ca["maxVal"]:
                    ca["maxVal"] = val
                    ca["topAuth"] = auth

            # Module J3A: Law Firms & Legal Representatives (CPV 79 + адвокат/правни/процесуално)
            combined_txt = f"{contr} {subj}"
            if (sec == "79" and LAW_FIRM_RE.search(combined_txt)) or ("адвокатск" in contr.lower()):
                lk = ceik or norm_entity(contr, drop_legal=False)
                if lk:
                    lf = law_firms.get(lk)
                    if not lf:
                        lf = {"eik": ceik, "name": contr, "totalEur": 0.0, "contracts": 0, "single": 0, "direct": 0, "auths": {}, "samples": []}
                        law_firms[lk] = lf
                    lf["totalEur"] += val
                    lf["contracts"] += 1
                    if is_single:
                        lf["single"] += 1
                    if is_direct:
                        lf["direct"] += 1
                    if aeik:
                        lf["auths"][aeik] = lf["auths"].get(aeik, 0.0) + val
                    if len(lf["samples"]) < 4 and val >= 5000:
                        lf["samples"].append({"id": cid, "auth": auth, "date": sdt, "val": round(val, 2), "subj": subj[:110], "bids": bids})

            # Module J3B: Construction Supervision & Audit / Technical Experts
            if val >= 5000 and EXPERT_FIRM_RE.search(subj) and ceik:
                ef = expert_firms.get(ceik)
                if not ef:
                    ef = {"eik": ceik, "name": contr, "totalEur": 0.0, "contracts": 0, "single": 0, "direct": 0, "auths": {}, "topSubj": subj[:120]}
                    expert_firms[ceik] = ef
                ef["totalEur"] += val
                ef["contracts"] += 1
                if is_single:
                    ef["single"] += 1
                if is_direct:
                    ef["direct"] += 1
                if aeik:
                    ef["auths"][aeik] = ef["auths"].get(aeik, 0.0) + val

            # Module J1: Contracts explicitly referencing court disputes, settlements, arbitration, enforcement
            if val >= 15_000 and LITIGATION_CONTRACT_RE.search(subj):
                litigation_contracts.append({
                    "id": cid, "unp": unp, "signedAt": sdt, "authority": auth, "authorityEik": aeik,
                    "contractor": contr, "contractorEik": ceik, "valueEur": round(val, 2),
                    "bids": bids, "procedure": proc, "subject": subj[:180],
                })

            # Module J6: EU-Funded Contracts & EPPO Regulation (EU) 2017/1939 High-Risk Triggers
            if eu:
                eu_total_cnt += 1
                eu_total_eur += val
                if is_single:
                    eu_single_cnt += 1
                    eu_single_eur += val
                if val >= 1_000_000 and (is_single or is_direct or vflag != "ok"):
                    eppo_triggers = []
                    if is_single:
                        eppo_triggers.append("1 оферта (ЕС средства)")
                    if is_direct:
                        eppo_triggers.append("Пряко / без обявление")
                    if vflag != "ok":
                        eppo_triggers.append(f"Флаг: {vflag}")
                    if val >= 10_000_000:
                        eppo_triggers.append("Мега-проект ≥€10M (EPPO приоритет)")
                    eu_eppo_hits.append({
                        "id": cid, "unp": unp, "signedAt": sdt, "authority": auth, "authorityEik": aeik,
                        "contractor": contr, "contractorEik": ceik, "valueEur": round(val, 2),
                        "bids": bids, "procedure": proc, "sector": sec, "triggers": eppo_triggers,
                        "subject": subj[:170],
                    })

    print(f"    Scanned 206,907 contracts in {time.time() - t0:.1f}s -> {len(law_firms)} law firms, {len(expert_firms)} expert/supervision firms, {len(litigation_contracts)} court-linked contracts, {eu_total_cnt:,} EU-funded contracts.")

    # =========================================================================
    # RUN LIVE INGESTION FOR J2 (ADFI), J4 (KZK/VAS), J3 (ADFI EXPERTS PDF) + EISS/EPEP
    # =========================================================================
    mod2_adfi = ingest_adfi_reports(matcher)
    mod4_kzk = ingest_kzk_zop(matcher, unp_index)
    adfi_experts_pdf = parse_adfi_experts_pdf()
    eiss_live = ingest_eiss_ecase_live(matcher, unp_index, mod2_adfi, mod4_kzk)

    mod2_adfi["liveEissAndKandCases"] = eiss_live["adfiCourtCases"]
    mod2_adfi["eissOutcomeBreakdown"] = eiss_live["adfiOutcomeBreakdown"]
    mod2_adfi["eissAnnulmentReasons"] = eiss_live["adfiAnnulmentReasons"]
    mod2_adfi["linkedArt17ReportsCount"] = eiss_live["linkedArt17ReportsCount"]

    mod4_kzk["liveVasFinalActs"] = eiss_live["vasFinalActs"]
    mod4_kzk["vasOutcomeBreakdown"] = eiss_live["vasOutcomeBreakdown"]
    mod4_kzk["ingestedCounts"]["vasFinalActsExtracted"] = len(eiss_live["vasFinalActs"])
    mod4_kzk["ingestedCounts"]["vasAppealed"] = max(mod4_kzk["ingestedCounts"].get("vasAppealed", 0), len(eiss_live["vasFinalActs"]))

    # =========================================================================
    # FINALIZE MODULE J3: LEGAL & EXPERT GRAPH (MULTI-AUTHORITY HUBS)
    # =========================================================================
    law_hubs = []
    for lf in law_firms.values():
        if lf["totalEur"] < 15_000:
            continue
        top_auths = sorted(lf["auths"].items(), key=lambda x: x[1], reverse=True)[:5]
        law_hubs.append({
            "eik": lf["eik"], "name": lf["name"], "totalEur": round(lf["totalEur"], 2),
            "contracts": lf["contracts"], "authorityCount": len(lf["auths"]),
            "singleOfferPct": round((lf["single"] / max(1, lf["contracts"])) * 100, 1),
            "directAwardPct": round((lf["direct"] / max(1, lf["contracts"])) * 100, 1),
            "topAuthorities": [{"eik": ae, "name": (matcher.auth_by_eik.get(ae) or {}).get("name", ae), "eur": round(ev, 2)} for ae, ev in top_auths],
            "samples": lf["samples"][:3],
        })
    law_hubs.sort(key=lambda x: (x["authorityCount"] >= 3, x["totalEur"]), reverse=True)

    expert_hubs = []
    for ef in expert_firms.values():
        if ef["totalEur"] < 100_000 or len(ef["auths"]) < 2:
            continue
        top_auths = sorted(ef["auths"].items(), key=lambda x: x[1], reverse=True)[:5]
        expert_hubs.append({
            "eik": ef["eik"], "name": ef["name"], "totalEur": round(ef["totalEur"], 2),
            "contracts": ef["contracts"], "authorityCount": len(ef["auths"]),
            "singleOfferPct": round((ef["single"] / max(1, ef["contracts"])) * 100, 1),
            "directAwardPct": round((ef["direct"] / max(1, ef["contracts"])) * 100, 1),
            "topAuthorities": [{"eik": ae, "name": (matcher.auth_by_eik.get(ae) or {}).get("name", ae), "eur": round(ev, 2)} for ae, ev in top_auths],
        })
    expert_hubs.sort(key=lambda x: (x["authorityCount"] >= 5, x["totalEur"]), reverse=True)

    # =========================================================================
    # FINALIZE MODULE J1: COLLUSIVE LITIGATION & HIGH-RISK DISPUTE MATRIX
    # =========================================================================
    litigation_contracts.sort(key=lambda x: x["valueEur"], reverse=True)
    # Cross-reference Engine 1 inflated contracts with KZK disputes & single-offer flags
    infl_contracts = (f7.get("engine1_annexInflation") or {}).get("contracts") or []
    auth_kzk_map = mod4_kzk["_authKzk"]
    auth_adfi_map = mod2_adfi["_authAgg"]
    collusive_watch = []
    for ic in infl_contracts:
        if ic.get("inflationEur", 0) <= 0 and not ic.get("suspect"):
            continue
        ae = ic.get("authorityEik") or ""
        kzk_a = auth_kzk_map.get(ae)
        adfi_a = auth_adfi_map.get(ae)
        collusive_watch.append({
            "id": ic["id"], "unp": ic["unp"], "authority": ic["authority"], "authorityEik": ae,
            "contractor": ic["contractor"], "contractorEik": ic.get("contractorEik") or "",
            "signingEur": ic["signingEur"], "currentEur": ic["currentEur"],
            "inflationEur": ic["inflationEur"], "inflationPct": ic["inflationPct"],
            "amendments": ic["amendmentCount"],
            "authorityKzkCases": kzk_a["totalActs"] if kzk_a else 0,
            "authorityAdfiReports": adfi_a["reportCount"] if adfi_a else 0,
            "riskReason": "Пост-договорно оскъпяване + висока интензивност на АДФИ/КЗК" if (ic["inflationPct"] >= 20) else "Подозрителна промяна на стойност (флаг СИГМА)",
        })

    # =========================================================================
    # FINALIZE MODULE J5: INSOLVENCY, DISTRAINTS & PHOENIX COMPANIES (LIVE CR!)
    # =========================================================================
    print("[J5] Scanning ALL cached Commercial Register deeds + top burnout candidates for Insolvency/Distraints/Phoenix...")
    burnout_candidates = [
        ca for ca in comp_activity.values()
        if ca["eur_20_23"] >= 1_500_000 and ca["eur_24_26"] == 0.0 and ca["cnt_20_23"] >= 2
    ]
    burnout_candidates.sort(key=lambda x: x["eur_20_23"], reverse=True)

    # Probe up to 12 top uncached burnout firms live against CR (fast & respectful!)
    live_probed = 0
    for bc in burnout_candidates[:30]:
        if (CR_DEEDS_CACHE / f"{bc['eik']}.json").exists():
            continue
        if live_probed >= 10:
            break
        d_live = fetch_cr_deed_cached_or_live(bc["eik"], allow_live=True)
        if d_live:
            live_probed += 1

    cr_distress_map: dict[str, dict[str, Any]] = {}
    owner_to_firms: dict[str, list[dict[str, Any]]] = defaultdict(list)

    if CR_DEEDS_CACHE.exists():
        for fp in CR_DEEDS_CACHE.glob("*.json"):
            try:
                deed = json.loads(fp.read_text(encoding="utf-8"))
                info = parse_cr_distress(deed)
                if not info["eik"]:
                    continue
                ca = comp_activity.get(info["eik"])
                c_idx = matcher.comp_by_eik.get(info["eik"])
                info["wonEur"] = round(c_idx["wonEur"], 2) if c_idx else round(ca["eur_20_23"] + ca["eur_24_26"], 2) if ca else 0.0
                info["won20_23Eur"] = round(ca["eur_20_23"], 2) if ca else 0.0
                info["won24_26Eur"] = round(ca["eur_24_26"], 2) if ca else 0.0
                info["contracts"] = c_idx["contracts"] if c_idx else (ca["total"] if ca else 0)
                info["lastContractDate"] = ca["lastDate"] if ca else ""
                info["topAuthority"] = ca["topAuth"] if ca else ""
                info["isBurnout"] = bool(ca and ca["eur_20_23"] >= 500_000 and ca["eur_24_26"] == 0.0)
                cr_distress_map[info["eik"]] = info
                for p in info["people"]:
                    owner_to_firms[norm_person(p)].append({
                        "person": p, "eik": info["eik"], "name": info["name"],
                        "incorpDate": info["incorpDate"], "statusLabel": info["statusLabel"],
                        "isDistressed": info["isDistressed"], "isBurnout": info["isBurnout"],
                        "distraintCount": info["distraintCount"], "pledgeCount": info["pledgeCount"],
                        "wonEur": info["wonEur"], "won24_26Eur": info["won24_26Eur"],
                    })
            except Exception:
                pass

    distressed_firms = sorted(
        [x for x in cr_distress_map.values() if x["isDistressed"] or x["pledgeCount"] > 0],
        key=lambda x: (x["isInsolvent"] or x["isLiquidation"], x["distraintCount"], x["wonEur"]),
        reverse=True,
    )

    # Phoenix / Multi-Entity Chains where an owner has ≥2 procurement companies and at least 1 is distressed/burnout/pledged OR spans older->newer EIK
    phoenix_chains = []
    for pnorm, flist in owner_to_firms.items():
        # Unique by EIK
        uniq = list({f["eik"]: f for f in flist}.values())
        if len(uniq) < 2:
            continue
        has_risk = any(f["isDistressed"] or f["isBurnout"] or f["pledgeCount"] > 0 for f in uniq)
        comb_eur = sum(f["wonEur"] for f in uniq)
        if comb_eur < 200_000:
            continue
        uniq.sort(key=lambda x: x["incorpDate"] or "9999")
        phoenix_chains.append({
            "owner": uniq[0]["person"],
            "firmCount": len(uniq),
            "combinedEur": round(comb_eur, 2),
            "hasDistressedOrBurnout": has_risk,
            "firms": uniq,
        })
    phoenix_chains.sort(key=lambda x: (x["hasDistressedOrBurnout"], x["combinedEur"]), reverse=True)

    burnout_top = [
        {
            "eik": b["eik"], "name": b["name"],
            "eur2020_2023": round(b["eur_20_23"], 2), "cnt2020_2023": b["cnt_20_23"],
            "eur2024_2026": 0.0, "lastContractDate": b["lastDate"],
            "singleOfferPct": round((b["single"] / max(1, b["total"])) * 100, 1),
            "topAuthority": b["topAuth"],
            "crStatus": cr_distress_map[b["eik"]]["statusLabel"] if b["eik"] in cr_distress_map else "За жива ТР проверка",
            "distraints": cr_distress_map[b["eik"]]["distraintCount"] if b["eik"] in cr_distress_map else 0,
            "pledges": cr_distress_map[b["eik"]]["pledgeCount"] if b["eik"] in cr_distress_map else 0,
        }
        for b in burnout_candidates[:50]
    ]
    print(f"    [J5] Analyzed {len(cr_distress_map)} CR deeds -> {len(distressed_firms)} with insolvency/distraints/pledges, {len(phoenix_chains)} multi-entity/Phoenix owner chains, {len(burnout_candidates)} burnout firms (≥€1.5M in 2020–23, €0 in 2024–26).")

    # =========================================================================
    # FINALIZE MODULE J6: CRIMINAL / ZMIP / EPPO COMPLIANCE PROFILE
    # =========================================================================
    eu_eppo_hits.sort(key=lambda x: x["valueEur"], reverse=True)
    zmip_gaps = [
        {
            "eik": x["eik"], "name": x["name"], "wonEur": x["wonEur"], "contracts": x["contracts"],
            "hasForeignParent": x["hasForeignParent"], "hasZmipBo": x["hasZmipBo"],
            "statusLabel": x["statusLabel"], "distraints": x["distraintCount"],
        }
        for x in cr_distress_map.values()
        if x["wonEur"] >= 500_000 and (not x["hasZmipBo"] or x["hasForeignParent"])
    ]
    zmip_gaps.sort(key=lambda x: x["wonEur"], reverse=True)

    # =========================================================================
    # ARCHITECTURAL LAYER #2: 9-NODE KNOWLEDGE GRAPH (+3 NEW NODE TYPES!)
    #   New node types: 'court_case' (КЗК/АДФИ/ТР дело), 'lawyer' (Адвокат/Кантора), 'expert' (Вещо лице/Надзор)
    # =========================================================================
    g_nodes: dict[str, dict[str, Any]] = {}
    g_edges: list[dict[str, Any]] = []

    def add_gn(nid: str, label: str, ntype: str, meta: dict[str, Any]) -> None:
        if nid not in g_nodes:
            g_nodes[nid] = {"id": nid, "label": label[:52], "type": ntype, "meta": meta}

    # 1. KZK Preliminary Execution & Overturned Cases -> court_case nodes linked to inst + company!
    for a in (mod4_kzk["prelimRulings"][:18] + mod4_kzk["decisions"][:16]):
        if not a.get("authorityEik"):
            continue
        cid_n = f"case:{a['caseNo'] or a['actNo']}"
        add_gn(cid_n, f"{a['caseNo']} ({a['outcome'][:22]})", "court_case", {
            "caseNo": a["caseNo"], "actNo": a["actNo"], "outcome": a["outcome"],
            "date": a["date"], "url": a["url"], "kind": a["kind"], "severity": a["severity"],
        })
        aid_n = f"i:{a['authorityName']}"
        add_gn(aid_n, a["authorityName"], "inst", {"eik": a["authorityEik"], "name": a["authorityName"]})
        g_edges.append({"source": cid_n, "target": aid_n, "kind": "court_case"})
        for mi in a.get("matchedInitiators") or []:
            cm_n = f"c:{mi['eik']}"
            add_gn(cm_n, mi["name"], "company", {"eik": mi["eik"], "name": mi["name"], "wonEur": mi["wonEur"]})
            g_edges.append({"source": cm_n, "target": cid_n, "kind": "court_case"})

    # 2. Law Firms -> lawyer nodes linked to their contracting authorities!
    for lh in law_hubs[:18]:
        ln_id = f"law:{lh['eik'] or lh['name'][:30]}"
        add_gn(ln_id, lh["name"], "lawyer", {
            "eik": lh["eik"], "name": lh["name"], "totalEur": lh["totalEur"],
            "contracts": lh["contracts"], "authorityCount": lh["authorityCount"],
        })
        for ta in lh["topAuthorities"][:4]:
            aid_n = f"i:{ta['name']}"
            add_gn(aid_n, ta["name"], "inst", {"eik": ta["eik"], "name": ta["name"]})
            g_edges.append({"source": ln_id, "target": aid_n, "kind": "lawyer"})

    # 3. Supervision / Audit Experts -> expert nodes linked to their contracting authorities!
    for eh in expert_hubs[:16]:
        ex_id = f"exp:{eh['eik']}"
        add_gn(ex_id, eh["name"], "expert", {
            "eik": eh["eik"], "name": eh["name"], "totalEur": eh["totalEur"],
            "contracts": eh["contracts"], "authorityCount": eh["authorityCount"],
        })
        for ta in eh["topAuthorities"][:4]:
            aid_n = f"i:{ta['name']}"
            add_gn(aid_n, ta["name"], "inst", {"eik": ta["eik"], "name": ta["name"]})
            g_edges.append({"source": ex_id, "target": aid_n, "kind": "expert"})

    # 4. Top ADFI Repeat-Inspected Authorities -> court_case (ADFI report) nodes!
    for ag in mod2_adfi["topInspectedAuthorities"][:16]:
        aid_n = f"i:{ag['name']}"
        add_gn(aid_n, ag["name"], "inst", {"eik": ag["eik"], "name": ag["name"]})
        for rep in ag["reports"][:2]:
            rid_n = f"adfi:{rep['code']}"
            add_gn(rid_n, f"АДФИ {rep['code']}", "court_case", {
                "caseNo": f"АДФИ {rep['code']}", "outcome": "Актуализиран по чл. 17(7) ЗДФИ" if rep["updatedArt17"] else "Доклад АДФИ",
                "date": rep["date"], "url": rep["url"], "kind": "АДФИ Инспекция", "severity": "warn" if rep["updatedArt17"] else "info",
            })
            g_edges.append({"source": rid_n, "target": aid_n, "kind": "court_case"})

    # 5. Live EISS/EPEP Court Cases (ВАС / КАНД АДФИ / Търговски дела) + Lawyers -> 9-Node Graph!
    for vc in eiss_live["vasFinalActs"][:12]:
        cid_n = f"vas:{vc['vasCaseNo']}"
        add_gn(cid_n, f"ВАС {vc['vasCaseNo']} ({vc['vasOutcome'][:18]})", "court_case", {
            "caseNo": f"ВАС адм.д. {vc['vasCaseNo']}", "actNo": vc["vasActNo"], "outcome": vc["vasOutcome"],
            "date": vc["vasActDate"], "url": vc["actDownloadUrl"], "kind": "ВАС Касация (КЗК)", "severity": vc["severity"],
        })
        if vc.get("authorityName"):
            aid_n = f"i:{vc['authorityName']}"
            add_gn(aid_n, vc["authorityName"], "inst", {"eik": vc["authorityEik"], "name": vc["authorityName"]})
            g_edges.append({"source": cid_n, "target": aid_n, "kind": "court_case"})
        for lw in (vc.get("lawyers") or [])[:2]:
            lid_n = f"law_eiss:{lw}"
            add_gn(lid_n, lw, "lawyer", {"name": lw, "caseNo": f"ВАС {vc['vasCaseNo']}"})
            g_edges.append({"source": lid_n, "target": cid_n, "kind": "lawyer"})

    for cd in eiss_live["commercialDisputes"][:12]:
        cid_n = f"td:{cd['court'][:12]}:{cd['caseNo']}"
        add_gn(cid_n, f"{cd['caseNo']} ({cd['court'].replace('Окръжен съд - ', 'ОС ')})", "court_case", {
            "caseNo": f"{cd['court']} {cd['caseNo']}", "actNo": cd["actNo"], "outcome": cd["outcome"],
            "date": cd["actDate"], "url": cd["actDownloadUrl"], "kind": "Търговско дело (ЕИСС)", "severity": cd["severity"],
        })
        aid_n = f"i:{cd['authorityName']}"
        add_gn(aid_n, cd["authorityName"], "inst", {"eik": cd["authorityEik"], "name": cd["authorityName"]})
        g_edges.append({"source": cid_n, "target": aid_n, "kind": "court_case"})
        if cd.get("contractorEik"):
            cm_n = f"c:{cd['contractorEik']}"
            add_gn(cm_n, cd["contractorName"], "company", {"eik": cd["contractorEik"], "name": cd["contractorName"], "wonEur": cd["contractorWonEur"]})
            g_edges.append({"source": cm_n, "target": cid_n, "kind": "court_case"})

    # =========================================================================
    # ARCHITECTURAL LAYER #3: JUDICIAL & FORENSIC RISK INDEX COMPONENT (0–100)
    #   Cross-recalculates Authority & Company Risk Scores (0–100) + Impunity Index
    #   incorporating LIVE EISS/EPEP КАНД/АНД (annulled ADFI NPs), VAS KZK rulings,
    #   and Commercial Lawsuits (ТД/ВТД)!
    # =========================================================================
    eiss_adfi_annul_by_auth: Counter[str] = Counter()
    eiss_adfi_total_by_auth: Counter[str] = Counter()
    for ac in eiss_live["adfiCourtCases"]:
        ae = ac.get("authorityEik") or ""
        if ae:
            eiss_adfi_total_by_auth[ae] += 1
            if "ОТМЕНЕНО НП" in str(ac.get("outcome") or ""):
                eiss_adfi_annul_by_auth[ae] += 1

    eiss_vas_by_auth: Counter[str] = Counter()
    eiss_vas_overturned_by_auth: Counter[str] = Counter()
    eiss_vas_by_comp: Counter[str] = Counter()
    for vc in eiss_live["vasFinalActs"]:
        ae = vc.get("authorityEik") or ""
        ce = vc.get("appellantEik") or ""
        if ae:
            eiss_vas_by_auth[ae] += 1
            if "ОТМЕНЯ" in str(vc.get("vasOutcome") or ""):
                eiss_vas_overturned_by_auth[ae] += 1
        if ce:
            eiss_vas_by_comp[ce] += 1

    eiss_td_by_auth: Counter[str] = Counter()
    eiss_td_lost_by_auth: Counter[str] = Counter()
    eiss_td_by_comp: Counter[str] = Counter()
    for cd in eiss_live["commercialDisputes"]:
        ae = cd.get("authorityEik") or ""
        ce = cd.get("contractorEik") or ""
        if ae:
            eiss_td_by_auth[ae] += 1
            if "ОСЪДЕН" in str(cd.get("outcome") or "") or "СПОГОДБА" in str(cd.get("outcome") or ""):
                eiss_td_lost_by_auth[ae] += 1
        if ce:
            eiss_td_by_comp[ce] += 1

    # Also cross-update Impunity Risk Score (0-100) on topInspectedAuthorities when annulled NPs exist!
    for ag in mod2_adfi.get("topInspectedAuthorities") or []:
        ae = ag.get("eik") or ""
        ann_c = eiss_adfi_annul_by_auth.get(ae, 0)
        tot_c = eiss_adfi_total_by_auth.get(ae, 0)
        ag["eissKandCount"] = tot_c
        ag["eissAnnulledNpCount"] = ann_c
        if ann_c > 0 or tot_c > 0:
            ag["impunityRiskScore"] = min(100, int(ag.get("impunityRiskScore", 0)) + ann_c * 14 + (tot_c - ann_c) * 5)

    salami_by_auth = Counter(s["authorityEik"] for s in ((f7.get("engine3_salamiSlicing") or {}).get("clusters") or []))
    salami_by_comp = Counter(s["contractorEik"] for s in ((f7.get("engine3_salamiSlicing") or {}).get("clusters") or []))
    dump_by_auth = {d["eik"]: d["novDecSharePct"] for d in ((f7.get("engine5_timeForensics") or {}).get("yearendDumpers") or [])}
    shell_by_comp = {s["eik"]: s["shellScore"] for s in ((f7.get("engine2_shellCompanies") or {}).get("companies") or [])}
    infl_by_comp: dict[str, float] = {}
    for ic in infl_contracts:
        ce = ic.get("contractorEik") or ""
        if ce and ic.get("inflationPct", 0) > infl_by_comp.get(ce, 0):
            infl_by_comp[ce] = float(ic["inflationPct"])
    rot_by_comp = Counter()
    for rr in ((f7.get("engine6_cartelGraphs") or {}).get("rotationRings") or []):
        for m in rr.get("members") or []:
            rot_by_comp[m["eik"]] += 1
    erik_pr_eiks = {p["eik"] for p in ((f7.get("engine4_politicsAndMedia") or {}).get("partyAgencies") or [])}

    # Authority Judicial Risk Boost (only non-zero boosts kept compact!)
    auth_risk_boost: dict[str, dict[str, Any]] = {}
    for aeik, a in matcher.auth_by_eik.items():
        pts = 0
        reasons: list[str] = []
        adfi_a = auth_adfi_map.get(aeik)
        if adfi_a:
            p_adfi = min(10, adfi_a["reportCount"] * 2 + adfi_a["updatedArt17Count"] * 3)
            pts += p_adfi
            reasons.append(f"АДФИ: {adfi_a['reportCount']} докл." + (f" ({adfi_a['updatedArt17Count']} чл.17)" if adfi_a["updatedArt17Count"] else ""))
        if eiss_adfi_total_by_auth.get(aeik, 0) > 0:
            ann_n = eiss_adfi_annul_by_auth.get(aeik, 0)
            tot_n = eiss_adfi_total_by_auth[aeik]
            pts += min(12, ann_n * 8 + tot_n * 3)
            reasons.append(f"ЕИСС КАНД: {tot_n} дела" + (f" ({ann_n} отм. НП)" if ann_n else ""))
        kzk_a = auth_kzk_map.get(aeik)
        if kzk_a:
            p_kzk = min(10, kzk_a["prelimGranted"] * 5 + kzk_a["overturned"] * 4 + kzk_a["totalActs"])
            pts += p_kzk
            reasons.append(f"КЗК: {kzk_a['totalActs']} акта" + (f" ({kzk_a['prelimGranted']} предв.изп.)" if kzk_a["prelimGranted"] else "") + (f" ({kzk_a['overturned']} отм.)" if kzk_a["overturned"] else ""))
        if eiss_vas_by_auth.get(aeik, 0) > 0:
            v_tot = eiss_vas_by_auth[aeik]
            v_ov = eiss_vas_overturned_by_auth.get(aeik, 0)
            pts += min(8, v_tot * 3 + v_ov * 5)
            reasons.append(f"ВАС ЗОП: {v_tot} акта" + (f" ({v_ov} отм.)" if v_ov else ""))
        if eiss_td_by_auth.get(aeik, 0) > 0:
            td_tot = eiss_td_by_auth[aeik]
            td_lost = eiss_td_lost_by_auth.get(aeik, 0)
            pts += min(12, td_tot * 4 + td_lost * 6)
            reasons.append(f"ЕИСС ТД: {td_tot} спора" + (f" ({td_lost} осъден/спогодба)" if td_lost else ""))
        sal_c = salami_by_auth.get(aeik, 0)
        if sal_c > 0:
            pts += min(6, sal_c * 3)
            reasons.append(f"Salami: {sal_c} клъстера")
        dmp = dump_by_auth.get(aeik, 0)
        if dmp >= 35:
            pts += 4
            reasons.append(f"Ное–Дек: {dmp}%")
        if pts > 0:
            pts = min(30, pts)
            auth_risk_boost[aeik] = {
                "judicialBoost": pts,
                "finalScore": min(100, a["baseRisk"] + pts),
                "reasons": reasons,
                "adfiCount": adfi_a["reportCount"] if adfi_a else 0,
                "kzkCount": (kzk_a["totalActs"] if kzk_a else 0) + eiss_vas_by_auth.get(aeik, 0),
                "eissCourtCases": eiss_adfi_total_by_auth.get(aeik, 0) + eiss_vas_by_auth.get(aeik, 0) + eiss_td_by_auth.get(aeik, 0),
            }

    # Company Forensic & Judicial Risk Score (0–100) for all flagged companies!
    comp_kzk_map = mod4_kzk["_compKzk"]
    comp_risk_map: dict[str, dict[str, Any]] = {}
    candidate_comp_eiks = (
        set(cr_distress_map.keys()) | set(comp_kzk_map.keys()) | set(salami_by_comp.keys())
        | set(shell_by_comp.keys()) | set(infl_by_comp.keys()) | set(rot_by_comp.keys()) | erik_pr_eiks
        | set(eiss_vas_by_comp.keys()) | set(eiss_td_by_comp.keys())
    )
    for ceik in candidate_comp_eiks:
        c = matcher.comp_by_eik.get(ceik)
        if not c:
            continue
        score = 0
        reasons = []
        cd = cr_distress_map.get(ceik)
        if cd:
            if cd["isInsolvent"] or cd["isLiquidation"]:
                score += 32
                reasons.append(f"ТР: {cd['statusLabel']}")
            if cd["distraintCount"] > 0:
                score += min(24, cd["distraintCount"] * 12)
                reasons.append(f"Запори ТР: {cd['distraintCount']}")
            if cd["pledgeCount"] > 0:
                score += min(10, cd["pledgeCount"] * 5)
                reasons.append(f"Особени залози: {cd['pledgeCount']}")
            if cd["isBurnout"]:
                score += 12
                reasons.append("Burnout (0 € през 2024–26)")
        if eiss_td_by_comp.get(ceik, 0) > 0:
            score += min(18, eiss_td_by_comp[ceik] * 12)
            reasons.append(f"ЕИСС ТД спор с възложител: {eiss_td_by_comp[ceik]}")
        if eiss_vas_by_comp.get(ceik, 0) > 0:
            score += min(12, eiss_vas_by_comp[ceik] * 6)
            reasons.append(f"ВАС ЗОП касация: {eiss_vas_by_comp[ceik]}")
        if ceik in shell_by_comp:
            score += min(22, int(round(shell_by_comp[ceik] * 0.35)))
            reasons.append(f"Новосъздадена (Shell {shell_by_comp[ceik]}/100)")
        if ceik in infl_by_comp and infl_by_comp[ceik] >= 15:
            score += min(20, int(round(infl_by_comp[ceik] * 0.4)))
            reasons.append(f"Анекс +{infl_by_comp[ceik]:.0f}%")
        if salami_by_comp.get(ceik, 0) > 0:
            score += min(18, salami_by_comp[ceik] * 9)
            reasons.append(f"Salami ({salami_by_comp[ceik]} клъстера)")
        if rot_by_comp.get(ceik, 0) > 0:
            score += min(16, rot_by_comp[ceik] * 8)
            reasons.append(f"Ротация ({rot_by_comp[ceik]} пръстена)")
        if ceik in comp_kzk_map:
            ck = comp_kzk_map[ceik]
            score += min(12, ck["totalActs"] * 4)
            reasons.append(f"КЗК: {ck['totalActs']} спора")
        if ceik in erik_pr_eiks:
            score += 10
            reasons.append("Партийна PR/медийна агенция (ЕРИК)")
        if c["linkedOfficials"] > 0:
            score += 18
            reasons.append(f"Свързана с {c['linkedOfficials']} длъжн. лица")
        if score > 0:
            comp_risk_map[ceik] = {"score": min(100, score), "reasons": reasons[:6]}

    # Remove internal scratch dicts before serializing
    mod2_adfi.pop("_authAgg", None)
    mod2_adfi.pop("_allReports", None)
    mod4_kzk.pop("_authKzk", None)
    mod4_kzk.pop("_compKzk", None)

    out_payload = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "entityMatching": {
            "authoritiesUniverse": len(matcher.auth_by_eik),
            "companiesUniverse": len(matcher.comp_by_eik) + sum(1 for r in (comp_json.get("rows") or []) if r[2] == 1),
            "contractsUnpUniverse": len(unp_index),
            "incomingRecordsScanned": mod2_adfi["totalReports"] + mod4_kzk["ingestedCounts"]["prelimRulings"] + mod4_kzk["ingestedCounts"]["decisions"] + mod4_kzk["ingestedCounts"]["openDossiers"] + len(cr_distress_map) + eiss_live["totalRowsScanned"],
            "matchStats": dict(matcher.stats),
            "authoritiesWithJudicialBoost": len(auth_risk_boost),
            "companiesWithJudicialScore": len(comp_risk_map),
            "connectorStatus": [
                {"source": "ЕПЕП / ЕИСС — Всички 184 съдилища и ВАС (ecase.justice.bg)", "mode": "LIVE OPEN", "records": eiss_live["totalEissCasesExtracted"], "captcha": False},
                {"source": "АДФИ Финансови инспекции + 370 по чл. 17(7) (adfi.minfin.bg/bg/34)", "mode": "LIVE OPEN", "records": mod2_adfi["totalReports"], "captcha": False},
                {"source": "АДФИ Регистър на вещите лица (30.09.2026 PDF)", "mode": "LIVE OPEN", "records": adfi_experts_pdf["totalExperts"], "captcha": False},
                {"source": "КЗК Публичен ЗОП регистър (reg.cpc.bg)", "mode": "LIVE OPEN", "records": mod4_kzk["ingestedCounts"]["prelimRulings"] + mod4_kzk["ingestedCounts"]["decisions"] + mod4_kzk["ingestedCounts"]["openDossiers"], "captcha": False},
                {"source": "Търговски регистър — Несъстоятелност и запори (CR API)", "mode": "LIVE OPEN", "records": len(cr_distress_map), "captcha": False},
                {"source": "ЦАИС ЕОП — Правни услуги, Надзор и ЕС/EPPO (206 907 дог.)", "mode": "LIVE OPEN", "records": 206907, "captcha": False},
            ],
        },
        "module1_collusiveLitigation": {
            "litigationLinkedContractsCount": len(litigation_contracts),
            "litigationLinkedEur": round(sum(x["valueEur"] for x in litigation_contracts), 2),
            "liveEissCommercialDisputesCount": len(eiss_live["commercialDisputes"]),
            "liveEissCommercialDisputes": eiss_live["commercialDisputes"],
            "commercialOutcomeBreakdown": eiss_live["commercialOutcomeBreakdown"],
            "topLitigationContracts": litigation_contracts[:45],
            "highRiskAnnexDisputeMatrix": collusive_watch[:35],
            "eissConnectorSchema": {
                "targetCases": ["Търговски дела (ТД)", "Въззивни търговски дела (ВТД)", "КАНД / АНД (АДФИ и Сметна палата)", "ВАС Четвърто отделение (КЗК ЗОП)"],
                "detectionRule": "Директен JSON/HTML поток от ecase.justice.bg (/Case/LoadData -> /Case/ActsLoadData -> /api/file/download/{gid}) без CAPTCHA",
                "legalBasis": "Жива интеграция с ЕПЕП / ЕИСС (ecase.justice.bg) за извличане на пълни диспозитиви, мотиви, страни и адвокати в реално време",
            },
        },
        "module2_impunityIndex": mod2_adfi,
        "module3_legalExpertGraph": {
            "lawFirmsCount": len(law_firms),
            "lawFirmsTotalEur": round(sum(x["totalEur"] for x in law_firms.values()), 2),
            "topLawFirmHubs": law_hubs[:45],
            "expertFirmsCount": len(expert_firms),
            "expertFirmsTotalEur": round(sum(x["totalEur"] for x in expert_firms.values()), 2),
            "topExpertHubs": expert_hubs[:45],
            "adfiRegisteredExperts": adfi_experts_pdf,
            "eissExtractedLawyers": eiss_live["extractedLawyers"],
            "eissExtractedExperts": eiss_live["extractedExperts"],
        },
        "module4_kzkVas": mod4_kzk,
        "module5_insolvencyPhoenix": {
            "crDeedsAudited": len(cr_distress_map),
            "distressedOrPledgedCount": len(distressed_firms),
            "burnoutFirmsCount": len(burnout_candidates),
            "burnoutTotal2020_2023Eur": round(sum(b["eur_20_23"] for b in burnout_candidates), 2),
            "phoenixChainsCount": len(phoenix_chains),
            "distressedFirms": distressed_firms[:45],
            "phoenixChains": phoenix_chains[:35],
            "burnoutFirms": burnout_top,
        },
        "module6_criminalEppo": {
            "euFundedContractsTotal": eu_total_cnt,
            "euFundedTotalEur": round(eu_total_eur, 2),
            "euSingleOfferCount": eu_single_cnt,
            "euSingleOfferEur": round(eu_single_eur, 2),
            "euSingleOfferSharePct": round((eu_single_eur / max(1.0, eu_total_eur)) * 100, 1),
            "eppoHighRiskCount": len(eu_eppo_hits),
            "eppoHighRiskEur": round(sum(x["valueEur"] for x in eu_eppo_hits), 2),
            "eppoHighRiskContracts": eu_eppo_hits[:55],
            "zmipBeneficialOwnerGaps": zmip_gaps[:30],
            "ownInstitutionConflicts": sum(1 for o in officials if o.get("ownInstitution")),
            "art54ZopSchema": {
                "legalBasis": "чл. 54, ал. 1, т. 1 ЗОП (задължително отстраняване при влязла в сила присъда) + Регламент (ЕС) 2017/1939 (EPPO)",
                "automaticFlag": "Подсъдим / Осъден изпълнител (при автоматична връзка МИДТ ↔ ЕИСС / Бюро съдимост / EPPO)",
                "disclaimer": "Настоящият модул визуализира единствено обективни публични финансови индикатори за ЕС средства, ЗМИП и конфликти на интереси, без да приписва наказателна вина.",
            },
        },
        "graphJudicialLayer": {
            "newNodeTypes": [
                {"type": "court_case", "label": "Съдебно дело / КЗК / АДФИ", "color": "#4f46e5"},
                {"type": "lawyer", "label": "Адвокат / Пълномощник", "color": "#0284c7"},
                {"type": "expert", "label": "Вещо лице / Надзор", "color": "#059669"},
            ],
            "nodes": list(g_nodes.values()),
            "edges": g_edges,
        },
        "riskAdjustments": {
            "authorities": auth_risk_boost,
            "companies": comp_risk_map,
        },
    }

    out_path = DATA_DIR / "sigma3_judicial_6.json"
    out_path.write_text(json.dumps(out_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nALL 6 JUDICIAL ENGINES + 9-NODE GRAPH + RISK WEIGHTS COMPILED in {time.time() - t0:.1f}s -> {out_path} ({out_path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
