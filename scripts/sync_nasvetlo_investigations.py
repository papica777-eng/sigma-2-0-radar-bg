#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NAsvetlo — Live Open-Data Cross-Link Investigations Generator
Downloads official CC0/CC-BY 4.0 datasets from data.egov.bg and deterministically
cross-links them (by exact 9-digit EIK or strict normalized legal entity name)
against NAsvetlo's verified ZOP procurement universe:
  - 17,428 ZOP contractors (docs/data/companies_index.json)
  - 4,344 contracting authorities (docs/data/authorities_index.json)
  - 571 politically connected officials (docs/data/officials_all.json)
  - 206,907 ZOP contracts (contracts.csv when available locally)
  - Ж5 Insolvency / Phoenix registry (docs/data/sigma3_judicial_6.json)

Outputs: docs/data/nasvetlo_investigations.json
"""

from __future__ import annotations

import csv
import io
import json
import re
import ssl
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
CACHE_DIR = REPO_ROOT / ".cache_nasvetlo_50"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = DATA_DIR / "nasvetlo_investigations.json"
CONTRACTS_CSV = Path(r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api\contracts.csv")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NAsvetlo-Investigations/1.0",
    "Accept": "text/csv,application/json,text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.7",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

LEGAL_FORM_RE = re.compile(
    r"\b(еоод|оод|еад|ад|сд|кд|кда|ет|дззд|консорциум|обединение|сдружение|фондация|кооперация|дп|оп|гп)\b",
    re.I,
)
EIK_RE = re.compile(r"\b(\d{9})\b")

RESOURCE_FEEDS: dict[str, list[dict[str, str]]] = {
    "mvr_security": [
        {"rv": "54488d81-d6fc-4b13-8af4-96539627be91", "label": "МВР — Лицензи за частна охранителна дейност (архив/отнемания/откази)"},
        {"rv": "9ad987bd-7518-4cb3-95d2-83851cc8b1e6", "label": "МВР — Актуални лицензи по ЗЧОД"},
    ],
    "me_concessions": [
        {"rv": "52a85f74-0c67-47c5-8726-b398f90df621", "label": "МЕ — Концесии за добив на подземни богатства (кариери и руди)"},
    ],
    "dnsk_consultants": [
        {"rv": "1e76fffa-00dd-4e71-ae18-477f8c6bfc8f", "label": "ДНСК — Регистър на консултантите (строителен надзор по чл. 166 ЗУТ)"},
    ],
    "dnsk_illegal": [
        {"rv": "62643a3c-4ee0-4bfe-9497-6ccd4f453a42", "label": "ДНСК — Влезли в сила заповеди за премахване на незаконни строежи"},
    ],
    "iaaa_bus": [
        {"rv": "ce9ea56c-4b73-4ac6-b969-e9aa0dd9b761", "label": "ИААА — Валидни лицензи на Общността за автобусен превоз"},
    ],
    "iaaa_cargo": [
        {"rv": "ed19d48a-1f42-4c0b-97a0-f7102ef27a7d", "label": "ИААА — Валидни лицензи за обществен превоз на товари"},
    ],
    "rezerv_obliged": [
        {"rv": "b3707555-f9c5-4feb-ab69-d331fe7337eb", "label": "ДА Държавен резерв — Задължени лица по ЗЗНН (горива)"},
    ],
    "rezerv_warehouses": [
        {"rv": "603eec5c-ced6-4e77-9736-8f52765b2be3", "label": "ДА Държавен резерв — Регистър на петролните складови бази"},
    ],
    "me_ozob": [
        {"rv": "097371cb-d9f4-4e18-976c-db6b9dfda90f", "label": "МЕ — Получатели на държавна енергийна помощ (Наредба Е-РД-04-06)"},
    ],
    "mf_pvu": [
        {"rv": "b5d57361-d8d1-476c-a3af-b0a5ffd897a8", "label": "МФ — Финансово изпълнение на ПВУ към 30.09.2026"},
    ],
    "dfz_2025": [
        {"rv": "2b533076-23ae-4a6e-9864-87277d3b45b9", "label": "ДФЗ — Изплатени земеделски субсидии за финансова 2025 г."},
    ],
    "babh_wholesale": [
        {"rv": "20462b29-9a33-42ba-8061-e0389ca3ffa7", "label": "БАБХ — Обекти за търговия и производство на храни от животински произход"},
    ],
    "nap_gambling": [
        {"rv": "3ebe7205-988b-4dde-87d4-032a6a061db6", "label": "НАП — Регистър на лицензите за организиране на хазартни игри"},
    ],
}


def download_csv_cached(rv_uuid: str, name: str, timeout: int = 45, max_bytes: int | None = None) -> Path | None:
    out_path = CACHE_DIR / f"feed_{name}_{rv_uuid[:8]}.csv"
    if out_path.exists() and out_path.stat().st_size > 150:
        head = out_path.read_bytes()[:80].decode("utf-8", errors="ignore").lstrip().lower()
        if not head.startswith("<!doctype") and not head.startswith("<html"):
            return out_path

    url = f"https://data.egov.bg/resource/download/{rv_uuid}/csv"
    try:
        time.sleep(0.25)
        req = urllib.request.Request(url, headers=HEADERS, method="GET")
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "text/html" in ctype:
                return None
            chunks: list[bytes] = []
            total = 0
            while True:
                buf = resp.read(262144)
                if not buf:
                    break
                if total == 0:
                    head = buf[:120].decode("utf-8", errors="ignore").lstrip().lower()
                    if head.startswith("<!doctype") or head.startswith("<html"):
                        return None
                chunks.append(buf)
                total += len(buf)
                if max_bytes and total >= max_bytes:
                    break
            data = b"".join(chunks)
            if len(data) < 80:
                return None
            out_path.write_bytes(data)
            print(f"    [DL] {name} ({rv_uuid[:8]}): {len(data):,} bytes")
            return out_path
    except Exception as ex:
        print(f"    [WARN] Failed {name} ({rv_uuid[:8]}): {type(ex).__name__}: {ex}")
        return None


def norm_company_name(name: str, drop_legal: bool = True) -> str:
    s = (name or "").lower()
    for ch in ("„", "“", '"', "'", "`", "«", "»", "–", "—", "(", ")", "[", "]", ",", ";", ".", ":"):
        s = s.replace(ch, " ")
    s = re.sub(r"[^а-яa-z0-9\-\s]", " ", s)
    if drop_legal:
        s = LEGAL_FORM_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s


def read_csv_rows(path: Path) -> list[list[str]]:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    # Detect delimiter from first 5 lines
    sample = "\n".join(text.splitlines()[:5])
    delim = ";" if sample.count(";") > sample.count(",") * 2 else ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    return [row for row in reader if any(cell.strip() for cell in row)]


def parse_bg_float(val: str) -> float:
    s = re.sub(r"[^\d,\.-]", "", (val or "").strip())
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # Check if comma is decimal separator (1 or 2 digits after last comma)
        if re.search(r",\d{1,2}$", s):
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def build_universe() -> dict[str, Any]:
    comp_raw = json.loads((DATA_DIR / "companies_index.json").read_text(encoding="utf-8"))
    comp_rows = comp_raw.get("rows", [])
    comp_by_eik: dict[str, dict[str, Any]] = {}
    comp_by_norm_full: dict[str, dict[str, Any]] = {}
    comp_by_norm_core: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for r in comp_rows:
        eik = str(r[0] or "").strip()
        rec = {
            "eik": eik,
            "name": str(r[1] or "").strip(),
            "isConsortium": r[2] == 1,
            "settlement": str(r[3] or "").strip(),
            "wonEur": round(float(r[4] or 0), 2),
            "contracts": int(r[5] or 0),
            "authorities": int(r[6] or 0),
            "sector": str(r[7] or ""),
            "linkedOfficials": int(r[8] or 0),
            "consortiumCount": int(r[9] or 0),
            "consortiumEur": round(float(r[10] or 0), 2),
        }
        if eik and len(eik) == 9 and eik.isdigit():
            comp_by_eik[eik] = rec
        nf = norm_company_name(rec["name"], drop_legal=False)
        nc = norm_company_name(rec["name"], drop_legal=True)
        if nf and len(nf) >= 5 and nf not in comp_by_norm_full:
            comp_by_norm_full[nf] = rec
        if nc and len(nc) >= 5:
            comp_by_norm_core[nc].append(rec)

    off_raw = json.loads((DATA_DIR / "officials_all.json").read_text(encoding="utf-8"))
    officials = off_raw.get("officials", [])
    official_by_eik: dict[str, list[dict[str, str]]] = defaultdict(list)
    for o in officials:
        for c in (o.get("companies") or []):
            ce = str(c.get("eik") or "").strip()
            if ce:
                official_by_eik[ce].append({
                    "name": o["name"],
                    "slug": o["slug"],
                    "institution": o.get("primaryInstitution", ""),
                    "circle": o.get("circle", ""),
                    "riskScore": o.get("riskScore", 0),
                })

    j6_raw = json.loads((DATA_DIR / "sigma3_judicial_6.json").read_text(encoding="utf-8"))
    j5_eiks: set[str] = set()
    for p in (j6_raw.get("module5_phoenix", {}).get("deedFindings") or []):
        if p.get("eik"):
            j5_eiks.add(str(p["eik"]))

    return {
        "comp_by_eik": comp_by_eik,
        "comp_by_norm_full": comp_by_norm_full,
        "comp_by_norm_core": comp_by_norm_core,
        "official_by_eik": official_by_eik,
        "j5_eiks": j5_eiks,
    }


def clean_city_suffix(name: str) -> str:
    s = (name or "").strip()
    s = re.sub(r",?\s*\b(?:гр\.|с\.|обл\.|общ\.|кв\.|ж\.к\.|ул\.|бул\.)\s+.*$", "", s, flags=re.I)
    return s.strip(" ,;\"")


def extract_legal_form(name: str) -> str:
    tokens = re.findall(r"\b(еоод|оод|еад|ад|сд|кд|кда|ет|дззд|дп|оп|гп)\b", (name or "").lower())
    return tokens[-1] if tokens else ""


def strict_match_company(raw_name: str, raw_eik: str, uni: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    """Match deterministically by 9-digit EIK or unique normalized legal name (>=2 words, compatible legal form)."""
    m_eik = EIK_RE.search(raw_eik or "")
    if m_eik:
        eik = m_eik.group(1)
        if eik in uni["comp_by_eik"]:
            return uni["comp_by_eik"][eik], "eik_exact"
    cleaned = clean_city_suffix(raw_name)
    if not cleaned:
        return None, ""
    nf = norm_company_name(cleaned, drop_legal=False)
    if nf and nf in uni["comp_by_norm_full"]:
        return uni["comp_by_norm_full"][nf], "name_legal_exact"
    nc = norm_company_name(cleaned, drop_legal=True)
    lf_raw = extract_legal_form(cleaned)
    if nc and (len(nc.split()) >= 2 or len(nc) >= 10) and nc in uni["comp_by_norm_core"]:
        cands = uni["comp_by_norm_core"][nc]
        if len(cands) == 1 and not cands[0]["isConsortium"]:
            lf_cand = extract_legal_form(cands[0]["name"])
            if not lf_raw or not lf_cand or lf_raw == lf_cand:
                return cands[0], "name_unique_core"
    return None, ""


def clean_subject_display(subj: str, unp: str = "") -> str:
    s = re.sub(r"\s+", " ", (subj or "").replace('""', '"')).strip()
    if "Благоевтрад" in s:
        s = s.replace("Благоевтрад", "Благоевтрад [sic, дословно в ЦАИС ЕОП]")
    if len(s) > 280:
        cut = s[:280].rsplit(" ", 1)[0].rstrip(" ,;:-")
        s = cut + "…"
    if unp:
        s = f"{s} (УНП {unp})"
    return s


def build_security_contract_index() -> dict[str, dict[str, Any]]:
    """Index actual ZOP guarding/security contracts per contractor EIK from contracts.csv."""
    idx: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "eur": 0.0, "sampleSubject": ""})
    if not CONTRACTS_CSV.exists():
        return idx
    sec_kw = re.compile(r"(охрана|охранител|\bсот\b|сигнално-охранител|видеонаблюдени|пропусквател|въоръжена|физическа защита|патрул|инкасо)", re.I)
    with CONTRACTS_CSV.open("r", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            ceik = (row.get("contractor_eik") or "").strip()
            subj = (row.get("subject") or "").strip()
            unp = (row.get("unp") or "").strip()
            if not ceik or not subj:
                continue
            if sec_kw.search(subj):
                val = parse_bg_float(row.get("value_eur") or "0")
                st = idx[ceik]
                st["count"] += 1
                st["eur"] += val
                if not st["sampleSubject"]:
                    st["sampleSubject"] = clean_subject_display(subj, unp)
    return idx


def analyze_mvr_security(uni: dict[str, Any], sec_contracts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    rows_all: list[list[str]] = []
    for item in RESOURCE_FEEDS["mvr_security"]:
        p = download_csv_cached(item["rv"], f"mvr_sec_{item['rv'][:6]}")
        if p:
            r = read_csv_rows(p)
            if len(r) > 1:
                rows_all.extend(r[1:])

    by_eik: dict[str, dict[str, Any]] = {}
    status_counts: Counter[str] = Counter()
    revoked_or_refused_statuses = ("отнет", "прекратен", "отказ", "обезсилен", "анулиран")
    explicit_revoked_kw = ("отнет", "отказ", "обезсилен", "анулиран")

    for r in rows_all:
        if len(r) < 9:
            continue
        doc_no, issue_date, eik_raw, subj, addr, acts, scope, _, status = [c.strip() for c in r[:9]]
        m_eik = EIK_RE.search(eik_raw)
        if not m_eik:
            continue
        eik = m_eik.group(1)
        status_low = status.lower()
        status_counts[status or "Непосочен"] += 1
        is_revoked = any(k in status_low for k in revoked_or_refused_statuses)
        is_explicit_rev = any(k in status_low for k in explicit_revoked_kw)

        rec = by_eik.setdefault(eik, {
            "eik": eik,
            "name": subj,
            "addr": addr,
            "activities": acts[:140],
            "licenses": [],
            "hasRevokedOrTerminated": False,
            "hasExplicitRevoked": False,
            "hasActive": False,
        })
        rec["licenses"].append({"docNo": doc_no, "date": issue_date, "status": status})
        if is_revoked:
            rec["hasRevokedOrTerminated"] = True
        else:
            rec["hasActive"] = True
        if is_explicit_rev:
            rec["hasExplicitRevoked"] = True

    zop_hits: list[dict[str, Any]] = []
    no_active_zop_hits: list[dict[str, Any]] = []
    explicit_revoked_no_active: list[dict[str, Any]] = []
    security_contract_no_active: list[dict[str, Any]] = []
    politician_hits: list[dict[str, Any]] = []
    total_zop_eur = 0.0

    for eik, sec in by_eik.items():
        comp = uni["comp_by_eik"].get(eik)
        offs = uni["official_by_eik"].get(eik) or []
        sc = sec_contracts.get(eik) or {"count": 0, "eur": 0.0, "sampleSubject": ""}
        if comp:
            total_zop_eur += comp["wonEur"]
            no_active = sec["hasRevokedOrTerminated"] and not sec["hasActive"]
            explicit_no_active = sec["hasExplicitRevoked"] and not sec["hasActive"]
            active_lics = [l for l in sec["licenses"] if not any(k in l["status"].lower() for k in revoked_or_refused_statuses)]
            latest_lic = active_lics[-1] if active_lics else sec["licenses"][-1]
            hit = {
                "eik": eik,
                "name": comp["name"],
                "registryName": sec["name"],
                "wonEur": comp["wonEur"],
                "contracts": comp["contracts"],
                "authorities": comp["authorities"],
                "sector": comp["sector"],
                "hasActive": sec["hasActive"],
                "noActiveLicense": no_active,
                "explicitRevokedNoActive": explicit_no_active,
                "hasHistoricalRevoked": sec["hasRevokedOrTerminated"],
                "latestStatus": latest_lic["status"],
                "latestDoc": f"{latest_lic['docNo']} ({latest_lic['date']})",
                "licenseCount": len(sec["licenses"]),
                "securityContracts": sc["count"],
                "securityContractsEur": round(sc["eur"], 2),
                "securitySampleSubject": sc["sampleSubject"],
                "linkedOfficials": [o["name"] for o in offs],
            }
            zop_hits.append(hit)
            if no_active:
                no_active_zop_hits.append(hit)
                if sc["count"] > 0:
                    security_contract_no_active.append(hit)
            if explicit_no_active:
                explicit_revoked_no_active.append(hit)
        if offs:
            politician_hits.append({
                "eik": eik,
                "companyName": (comp["name"] if comp else sec["name"]),
                "wonEur": comp["wonEur"] if comp else 0.0,
                "hasActive": sec["hasActive"],
                "noActiveLicense": sec["hasRevokedOrTerminated"] and not sec["hasActive"],
                "securityContractsEur": round(sc["eur"], 2),
                "officials": offs,
            })

    zop_hits.sort(key=lambda x: (x["noActiveLicense"] and x["securityContracts"] > 0, x["securityContractsEur"], x["wonEur"]), reverse=True)
    no_active_zop_hits.sort(key=lambda x: (x["explicitRevokedNoActive"], x["securityContractsEur"], x["wonEur"]), reverse=True)
    security_contract_no_active.sort(key=lambda x: x["securityContractsEur"], reverse=True)

    return {
        "id": "mvr_security",
        "title": "МВР (ЗЧОД) × Охранителни поръчки по ЗОП",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/fefb3301-7718-4ba9-b6f4-0700808ad769",
        "totalRegistryRecords": len(rows_all),
        "uniqueEiksInRegistry": len(by_eik),
        "zopMatchedCompanies": len(zop_hits),
        "zopMatchedTotalEur": round(total_zop_eur, 2),
        "noActiveLicenseZopCount": len(no_active_zop_hits),
        "noActiveLicenseZopEur": round(sum(x["wonEur"] for x in no_active_zop_hits), 2),
        "explicitRevokedNoActiveCount": len(explicit_revoked_no_active),
        "securityContractNoActiveCount": len(security_contract_no_active),
        "securityContractNoActiveEur": round(sum(x["securityContractsEur"] for x in security_contract_no_active), 2),
        "securityContractTotalZopCount": sum(1 for x in zop_hits if x["securityContracts"] > 0),
        "securityContractTotalZopEur": round(sum(x["securityContractsEur"] for x in zop_hits), 2),
        "politicianLinkedCount": len(politician_hits),
        "statusBreakdown": dict(status_counts.most_common(6)),
        "topFindings": zop_hits[:30],
        "noActiveSecurityHighlights": security_contract_no_active[:25],
        "revokedHighlights": no_active_zop_hits[:25],
        "politicianHits": politician_hits,
    }


def analyze_me_concessions(uni: dict[str, Any]) -> dict[str, Any]:
    p = download_csv_cached(RESOURCE_FEEDS["me_concessions"][0]["rv"], "me_concessions")
    if not p:
        return {"id": "me_concessions", "error": "download_failed"}
    rows = read_csv_rows(p)
    header = rows[0] if rows else []
    data_rows = rows[1:] if len(rows) > 1 else []

    concession_hits: list[dict[str, Any]] = []
    matched_eiks: set[str] = set()
    by_mineral: Counter[str] = Counter()
    total_concessions = 0
    matched_total_eur = 0.0

    for r in data_rows:
        if len(r) < 10:
            continue
        total_concessions += 1
        conc_name = r[2].strip()
        deposit = r[3].strip()
        muni = r[4].strip()
        region = r[5].strip()
        group = r[6].strip()
        mineral = r[7].strip()
        term = r[8].strip()
        signed = r[9].strip()
        by_mineral[group or "Други"] += 1

        # Split multiple concessionaires ONLY on ; or /, NEVER on hyphen inside company names
        sub_names = [s.strip() for s in re.split(r"[;/]", conc_name) if len(s.strip()) >= 5]
        for sn in sub_names:
            comp, how = strict_match_company(sn, sn, uni)
            if comp and comp["eik"] not in matched_eiks:
                matched_eiks.add(comp["eik"])
                matched_total_eur += comp["wonEur"]
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                concession_hits.append({
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "concessionaire": conc_name,
                    "deposit": deposit,
                    "municipality": muni,
                    "region": region,
                    "mineralGroup": group,
                    "mineralType": mineral,
                    "term": term,
                    "signedDate": signed,
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "consortiumEur": comp["consortiumEur"],
                    "sector": comp["sector"],
                    "matchMethod": how,
                    "linkedOfficials": [o["name"] for o in offs],
                })
                break

    concession_hits.sort(key=lambda x: x["wonEur"] + x["consortiumEur"], reverse=True)
    return {
        "id": "me_concessions",
        "title": "МЕ (Кариери и подземни богатства) × Строители по ЗОП",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/63bb3f23-0df0-478d-b163-690f1b301742",
        "totalConcessions": total_concessions,
        "mineralGroups": dict(by_mineral.most_common(8)),
        "zopMatchedCompanies": len(concession_hits),
        "zopMatchedDirectEur": round(matched_total_eur, 2),
        "zopMatchedConsortiumEur": round(sum(x["consortiumEur"] for x in concession_hits), 2),
        "topFindings": concession_hits[:30],
    }


def analyze_dnsk(uni: dict[str, Any]) -> dict[str, Any]:
    # 1. Construction Supervision Consultants (Art. 166 ZUT)
    p_cons = download_csv_cached(RESOURCE_FEEDS["dnsk_consultants"][0]["rv"], "dnsk_consultants")
    cons_hits: list[dict[str, Any]] = []
    seen_eik: set[str] = set()
    total_consultants = 0
    expired_consultants_zop = 0

    if p_cons:
        rows = read_csv_rows(p_cons)
        start_idx = 2 if len(rows) > 2 and "име" in (rows[1][1] if len(rows[1]) > 1 else "").lower() else 1
        for r in rows[start_idx:]:
            if len(r) < 9:
                continue
            cname, city, addr, mgr, phone, issued, valid_until, cert = [c.strip() for c in r[1:9]]
            if not cname:
                continue
            total_consultants += 1
            comp, how = strict_match_company(cname, cname, uni)
            # Parse validity date DD.MM.YYYY
            is_expired = False
            m_d = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", valid_until)
            if m_d:
                dt = datetime(int(m_d.group(3)), int(m_d.group(2)), int(m_d.group(1)))
                is_expired = dt < datetime(2026, 11, 22)
            if comp and comp["eik"] not in seen_eik:
                seen_eik.add(comp["eik"])
                if is_expired:
                    expired_consultants_zop += 1
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                cons_hits.append({
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "city": city,
                    "manager": mgr,
                    "cert": cert,
                    "issued": issued,
                    "validUntil": valid_until,
                    "isExpired": is_expired,
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "authorities": comp["authorities"],
                    "matchMethod": how,
                    "linkedOfficials": [o["name"] for o in offs],
                })
    cons_hits.sort(key=lambda x: (x["isExpired"], x["wonEur"]), reverse=True)

    # 2. Enforced Demolition Orders for Illegal Constructions
    p_ill = download_csv_cached(RESOURCE_FEEDS["dnsk_illegal"][0]["rv"], "dnsk_illegal")
    total_orders = 0
    in_procedure = 0
    executed_count = 0
    suspended_court = 0
    action_counts: Counter[str] = Counter()
    city_in_proc: Counter[str] = Counter()
    oldest_unexecuted: list[dict[str, Any]] = []

    if p_ill:
        rows = read_csv_rows(p_ill)
        for r in rows[2:]:
            if len(r) < 5:
                continue
            order_no = r[1].strip()
            obj_name = r[2].strip()
            loc = r[3].strip()
            action = r[4].strip()
            rem_date = r[5].strip() if len(r) > 5 else ""
            if not obj_name and not order_no:
                continue
            total_orders += 1
            al = action.lower()
            action_counts[action or "Непосочено"] += 1
            if "изпълнен" in al or "премахнат" in al:
                executed_count += 1
            elif "спрян" in al or "съд" in al or "адм" in al:
                suspended_court += 1
            else:
                in_procedure += 1
                m_city = re.search(r"(?:гр\.?|с\.?)\s*([А-Яа-я\-]{3,20})", loc)
                if m_city:
                    city_in_proc[m_city.group(1).title()] += 1
                m_yr = re.search(r"(19\d{2}|20[0-2]\d)", order_no)
                yr = int(m_yr.group(1)) if m_yr else 9999
                if yr <= 2016 and len(oldest_unexecuted) < 80:
                    oldest_unexecuted.append({
                        "orderNo": order_no,
                        "year": yr,
                        "object": obj_name[:120],
                        "location": loc[:120],
                        "action": action,
                    })
    oldest_unexecuted.sort(key=lambda x: x["year"])

    return {
        "id": "dnsk",
        "title": "ДНСК — Строителен надзор (чл. 166 ЗУТ) и Незаконни строежи",
        "datasetUrlConsultants": "https://data.egov.bg/organisation/dataset/23d781fe-3eea-4426-b8a9-b360df323eaf",
        "datasetUrlIllegal": "https://data.egov.bg/organisation/dataset/cc096ffe-47d6-4106-a489-aa339148ee0d",
        "totalConsultantsRegistry": total_consultants,
        "zopMatchedConsultants": len(cons_hits),
        "zopConsultantsTotalEur": round(sum(x["wonEur"] for x in cons_hits), 2),
        "expiredConsultantsInZop": expired_consultants_zop,
        "topConsultants": cons_hits[:25],
        "illegalOrdersTotal": total_orders,
        "illegalInProcedure": in_procedure,
        "illegalExecuted": executed_count,
        "illegalSuspendedCourt": suspended_court,
        "illegalActions": dict(action_counts.most_common(6)),
        "topCitiesUnexecuted": [{"city": k, "count": v} for k, v in city_in_proc.most_common(12)],
        "oldestUnexecutedOrders": oldest_unexecuted[:15],
    }


def analyze_iaaa(uni: dict[str, Any]) -> dict[str, Any]:
    p_bus = download_csv_cached(RESOURCE_FEEDS["iaaa_bus"][0]["rv"], "iaaa_bus")
    p_cargo = download_csv_cached(RESOURCE_FEEDS["iaaa_cargo"][0]["rv"], "iaaa_cargo")

    hits: list[dict[str, Any]] = []
    seen_eiks: set[str] = set()
    bus_count = 0
    cargo_count = 0

    if p_bus:
        for r in read_csv_rows(p_bus)[1:]:
            if len(r) < 3:
                continue
            bus_count += 1
            lic_no, name, eik_raw = r[0].strip(), r[1].strip(), r[2].strip()
            region = r[3].strip() if len(r) > 3 else ""
            copies = r[7].strip() if len(r) > 7 else ""
            comp, how = strict_match_company(name, eik_raw, uni)
            if comp and comp["eik"] not in seen_eiks:
                seen_eiks.add(comp["eik"])
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                hits.append({
                    "kind": "Пътнически превози (Общностен лиценз)",
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "licenseNo": lic_no,
                    "vehicles": copies,
                    "region": region,
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "authorities": comp["authorities"],
                    "linkedOfficials": [o["name"] for o in offs],
                })

    if p_cargo:
        for r in read_csv_rows(p_cargo)[1:]:
            if len(r) < 5:
                continue
            cargo_count += 1
            lic_no, name, region = r[1].strip(), r[2].strip(), r[3].strip()
            comp, how = strict_match_company(name, "", uni)
            if comp and comp["eik"] not in seen_eiks:
                seen_eiks.add(comp["eik"])
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                hits.append({
                    "kind": "Обществен превоз на товари",
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "licenseNo": lic_no,
                    "vehicles": "—",
                    "region": region,
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "authorities": comp["authorities"],
                    "linkedOfficials": [o["name"] for o in offs],
                })

    hits.sort(key=lambda x: x["wonEur"], reverse=True)
    return {
        "id": "iaaa",
        "title": "ИААА (Автомобилна администрация) × Транспортни поръчки по ЗОП",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/8ae518c0-bce3-46ac-b151-a5609820e38e",
        "busLicensesCount": bus_count,
        "cargoLicensesCount": cargo_count,
        "zopMatchedCompanies": len(hits),
        "zopMatchedTotalEur": round(sum(x["wonEur"] for x in hits), 2),
        "topFindings": hits[:25],
    }


def analyze_state_reserve_and_energy(uni: dict[str, Any]) -> dict[str, Any]:
    p_obl = download_csv_cached(RESOURCE_FEEDS["rezerv_obliged"][0]["rv"], "rezerv_obl")
    p_wh = download_csv_cached(RESOURCE_FEEDS["rezerv_warehouses"][0]["rv"], "rezerv_wh")
    p_ozob = download_csv_cached(RESOURCE_FEEDS["me_ozob"][0]["rv"], "me_ozob")

    fuel_hits: list[dict[str, Any]] = []
    seen: set[str] = set()
    obl_count = 0
    wh_count = 0

    if p_obl:
        for r in read_csv_rows(p_obl)[1:]:
            if len(r) < 4:
                continue
            obl_count += 1
            reg_no, obliged, basis, period = [c.strip() for c in r[:4]]
            comp, how = strict_match_company(obliged, obliged, uni)
            if comp and comp["eik"] not in seen:
                seen.add(comp["eik"])
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                fuel_hits.append({
                    "source": "Задължено лице по ЗЗНН (Държавен резерв)",
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "detail": f"{basis} ({period})",
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "linkedOfficials": [o["name"] for o in offs],
                })

    if p_wh:
        for r in read_csv_rows(p_wh)[1:]:
            if len(r) < 5:
                continue
            wh_count += 1
            keeper, reg_date, _, base_addr = r[1].strip(), r[2].strip(), r[3].strip(), r[4].strip()
            comp, how = strict_match_company(keeper, keeper, uni)
            if comp and comp["eik"] not in seen:
                seen.add(comp["eik"])
                offs = uni["official_by_eik"].get(comp["eik"]) or []
                fuel_hits.append({
                    "source": "Петролен склад (Държавен резерв)",
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "detail": f"Склад от {reg_date}: {base_addr[:80]}",
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                    "linkedOfficials": [o["name"] for o in offs],
                })

    ozob_hits: list[dict[str, Any]] = []
    ozob_total = 0
    if p_ozob:
        seen_oz: set[str] = set()
        for r in read_csv_rows(p_ozob)[1:]:
            if len(r) < 4:
                continue
            ozob_total += 1
            eik_raw, bname = r[2].strip(), r[3].strip()
            comp, _ = strict_match_company(bname, eik_raw, uni)
            if comp and comp["eik"] not in seen_oz:
                seen_oz.add(comp["eik"])
                ozob_hits.append({
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                })
        ozob_hits.sort(key=lambda x: x["wonEur"], reverse=True)

    fuel_hits.sort(key=lambda x: x["wonEur"], reverse=True)
    return {
        "id": "reserve_energy",
        "title": "Държавен резерв (Горива/Складове) & МЕ (Енергийни помощи) × ЗОП",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/e73de8a3-2dbe-48b4-8705-059b35d5fac5",
        "obligedCount": obl_count,
        "warehousesCount": wh_count,
        "zopMatchedFuelCompanies": len(fuel_hits),
        "zopMatchedFuelEur": round(sum(x["wonEur"] for x in fuel_hits), 2),
        "ozobTotalRecords": ozob_total,
        "ozobZopMatched": len(ozob_hits),
        "topFuelFindings": fuel_hits[:25],
        "topOzobFindings": ozob_hits[:15],
    }


def analyze_dfz_and_gambling(uni: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    # Try DFZ 2025 subsidies (short timeout if data.egov.bg backend hangs on full bulk SQL CSV)
    p_dfz = download_csv_cached(RESOURCE_FEEDS["dfz_2025"][0]["rv"], "dfz_2025", timeout=8, max_bytes=35_000_000)
    dfz_by_eik: dict[str, dict[str, Any]] = {}
    dfz_rows = 0
    dfz_headers: list[str] = []

    if p_dfz:
        rows = read_csv_rows(p_dfz)
        if rows:
            dfz_headers = rows[0]
            for r in rows[1:]:
                if len(r) < 3:
                    continue
                dfz_rows += 1
                joined = " ".join(r[:4])
                m_eik = EIK_RE.search(joined)
                bname = r[0].strip() if not re.match(r"^\d+$", r[0].strip()) else (r[1].strip() if len(r) > 1 else "")
                cand_names = [c.strip() for c in r[:5] if re.search(r"[А-Яа-я]{3,}", c)]
                if cand_names and (not bname or len(bname) < 4):
                    bname = cand_names[0]
                comp, how = strict_match_company(bname, m_eik.group(1) if m_eik else "", uni)
                amt = 0.0
                for c in reversed(r):
                    if re.search(r"\d", c) and not re.match(r"^\d{4}$", c.strip()):
                        v = parse_bg_float(c)
                        if v > 0:
                            amt = v
                            break
                if comp:
                    rec = dfz_by_eik.setdefault(comp["eik"], {
                        "eik": comp["eik"],
                        "name": comp["name"],
                        "wonEur": comp["wonEur"],
                        "contracts": comp["contracts"],
                        "authorities": comp["authorities"],
                        "subsidySum": 0.0,
                        "subsidyPayments": 0,
                        "linkedOfficials": [o["name"] for o in (uni["official_by_eik"].get(comp["eik"]) or [])],
                    })
                    rec["subsidySum"] = round(rec["subsidySum"] + amt, 2)
                    rec["subsidyPayments"] += 1

    dfz_hits = sorted(dfz_by_eik.values(), key=lambda x: (len(x["linkedOfficials"]) > 0, x["subsidySum"] + x["wonEur"]), reverse=True)

    dfz_res = {
        "id": "dfz_2025",
        "title": "ДФЗ (Агросубсидии 2025) × Изпълнители по ЗОП и Свързани лица",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/f764215a-0a73-43b7-ae8a-d0acd7b0d7f4",
        "headers": dfz_headers[:10],
        "rowsScanned": dfz_rows,
        "exportBlockedTimeout": p_dfz is None,
        "zopMatchedBeneficiaries": len(dfz_hits),
        "zopMatchedWonEur": round(sum(x["wonEur"] for x in dfz_hits), 2),
        "zopMatchedSubsidySum": round(sum(x["subsidySum"] for x in dfz_hits), 2),
        "politicianLinked": [x for x in dfz_hits if x["linkedOfficials"]],
        "topFindings": dfz_hits[:25],
    }

    # Gambling licenses (NAP) & BABH wholesale food facilities
    p_nap = download_csv_cached(RESOURCE_FEEDS["nap_gambling"][0]["rv"], "nap_gambling", timeout=35)
    nap_rows = 0
    nap_unique_eiks: set[str] = set()
    nap_by_eik: dict[str, dict[str, Any]] = {}
    if p_nap:
        raw_text = p_nap.read_bytes().decode("utf-8-sig", errors="replace")
        for line in raw_text.splitlines():
            s = line.strip()
            if not s or not s.startswith('"Хазартни') and not s.startswith("Хазартни"):
                # Try parsing line anyway if it looks like record
                if "," not in s:
                    continue
            try:
                outer = next(csv.reader(io.StringIO(s)))
                cols = next(csv.reader(io.StringIO(outer[0]))) if (len(outer) >= 1 and "," in outer[0]) else outer
            except Exception:
                continue
            if len(cols) < 10:
                continue
            nap_rows += 1
            comp_raw = f"{cols[4].strip()} {cols[5].strip()}".strip()
            eik_cand = cols[6].strip()
            city = cols[7].strip() if len(cols) > 7 else ""
            activity = cols[15].strip() if len(cols) > 15 else ""
            status = cols[28].strip() if len(cols) > 28 else ""
            m_eik = EIK_RE.search(eik_cand)
            if not m_eik:
                continue
            eik = m_eik.group(1)
            nap_unique_eiks.add(eik)
            comp = uni["comp_by_eik"].get(eik)
            offs = uni["official_by_eik"].get(eik) or []
            if comp or offs:
                rec = nap_by_eik.setdefault(eik, {
                    "eik": eik,
                    "name": (comp["name"] if comp else comp_raw),
                    "city": city,
                    "activity": activity,
                    "status": status or "—",
                    "licenseCount": 0,
                    "wonEur": comp["wonEur"] if comp else 0.0,
                    "contracts": comp["contracts"] if comp else 0,
                    "linkedOfficials": [o["name"] for o in offs],
                })
                rec["licenseCount"] += 1
                if status and "Валиден" in status:
                    rec["status"] = "Валиден"
    nap_hits = sorted(nap_by_eik.values(), key=lambda x: (len(x["linkedOfficials"]) > 0, x["wonEur"]), reverse=True)

    p_babh = download_csv_cached(RESOURCE_FEEDS["babh_wholesale"][0]["rv"], "babh_wholesale")
    babh_hits: list[dict[str, Any]] = []
    if p_babh:
        seen_b: set[str] = set()
        for r in read_csv_rows(p_babh)[1:]:
            if len(r) < 5:
                continue
            name, addr, status = r[3].strip(), r[4].strip(), r[-1].strip()
            comp, _ = strict_match_company(name, "", uni)
            if comp and comp["eik"] not in seen_b:
                seen_b.add(comp["eik"])
                babh_hits.append({
                    "eik": comp["eik"],
                    "name": comp["name"],
                    "status": status,
                    "addr": addr[:80],
                    "wonEur": comp["wonEur"],
                    "contracts": comp["contracts"],
                })
        babh_hits.sort(key=lambda x: x["wonEur"], reverse=True)

    other_res = {
        "napGamblingRows": nap_rows,
        "napGamblingUniqueEiks": len(nap_unique_eiks),
        "napGamblingZopMatched": len(nap_hits),
        "napGamblingZopEur": round(sum(x["wonEur"] for x in nap_hits), 2),
        "napGamblingTop": nap_hits[:20],
        "napDatasetUrl": "https://data.egov.bg/organisation/dataset/6181a5c3-ac0b-40c0-9bf8-53a0b5185adf",
        "babhZopMatched": len(babh_hits),
        "babhZopEur": round(sum(x["wonEur"] for x in babh_hits), 2),
        "babhTop": babh_hits[:15],
        "babhDatasetUrl": "https://data.egov.bg/organisation/dataset/b119fd70-e1aa-456d-aa92-7b1f0f578533",
    }
    return dfz_res, other_res


def analyze_mf_pvu(uni: dict[str, Any]) -> dict[str, Any]:
    p = download_csv_cached(RESOURCE_FEEDS["mf_pvu"][0]["rv"], "mf_pvu")
    if not p:
        return {"id": "mf_pvu", "error": "download_failed"}
    rows = read_csv_rows(p)
    items: list[dict[str, Any]] = []
    total_budget = 0.0
    total_paid = 0.0

    for r in rows[3:]:
        if len(r) < 12:
            continue
        code = r[1].strip()
        title = r[2].strip()
        ministry = r[3].strip()
        if not title or "общо" in title.lower() or "общо" in code.lower():
            continue
        budget = parse_bg_float(r[7])
        paid = parse_bg_float(r[11])
        if budget <= 0:
            continue
        total_budget += budget
        total_paid += paid
        pct = round((paid / budget) * 100.0, 2) if budget > 0 else 0.0
        items.append({
            "code": code,
            "investment": title,
            "ministry": ministry,
            "budgetTotal": round(budget, 2),
            "paidTotal": round(paid, 2),
            "executionPct": pct,
        })

    items.sort(key=lambda x: x["budgetTotal"], reverse=True)
    zero_paid = [x for x in items if x["paidTotal"] <= 0 and x["budgetTotal"] >= 10_000_000]
    return {
        "id": "mf_pvu",
        "title": "МФ — Финансово изпълнение на Плана за възстановяване и устойчивост (ПВУ)",
        "datasetUrl": "https://data.egov.bg/organisation/dataset/045c6ffa-6cbd-4416-a299-dad41120681e",
        "investmentsCount": len(items),
        "totalBudgetEur": round(total_budget, 2),
        "totalPaidEur": round(total_paid, 2),
        "executionPct": round((total_paid / total_budget) * 100.0, 2) if total_budget > 0 else 0.0,
        "zeroPaidBigProjectsCount": len(zero_paid),
        "zeroPaidBigProjects": zero_paid[:15],
        "topBudgetProjects": items[:20],
    }


def analyze_top_blackbox_contracts(admins_payload: dict[str, Any]) -> dict[str, Any]:
    """Use local contracts.csv (206,907 contracts) to audit single-offer & non-competitive contractors inside ALL Black Box agencies."""
    if not CONTRACTS_CSV.exists():
        return {"available": False}

    target_eiks = {
        "000695089": "Агенция „Пътна инфраструктура“ (АПИ)",
        "175203478": "„Булгартрансгаз“ ЕАД",
        "106513772": "„АЕЦ Козлодуй“ ЕАД",
        "130823243": "НКЖИ",
        "175201304": "ЕСО ЕАД",
        "831913661": "ДА „Държавен резерв и военновременни запаси“",
        "833017552": "„Мини Марица-изток“ ЕАД",
        "203740812": "Фонд на фондовете (ФМФИБ) ЕАД",
        "129009070": "ДП „Фонд затворно дело“",
        "000649348": "„Национална електрическа компания“ (НЕК) ЕАД",
        "000697179": "ДП „Ръководство на въздушното движение“ (ДП РВД)",
        "130316140": "ДП „Пристанищна инфраструктура“ (ДППИ)",
    }

    per_auth: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "totalContracts": 0, "totalEur": 0.0,
        "singleOfferCount": 0, "singleOfferEur": 0.0,
        "nonCompetitiveCount": 0, "nonCompetitiveEur": 0.0,
        "topContractors": defaultdict(lambda: {"name": "", "eik": "", "eur": 0.0, "contracts": 0, "single": 0}),
    })

    with CONTRACTS_CSV.open("r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            aeik = (row.get("authority_eik") or row.get("authorityEik") or "").strip()
            if aeik not in target_eiks:
                continue
            val = parse_bg_float(row.get("value_eur") or row.get("valueEur") or "0")
            bids_raw = (row.get("bids_received") or row.get("bids") or row.get("offers") or "").strip()
            proc = (row.get("procedure") or "").lower()
            ceik = (row.get("contractor_eik") or row.get("contractorEik") or "").strip()
            cname = (row.get("contractor") or row.get("contractor_name") or "").strip()

            st = per_auth[aeik]
            st["totalContracts"] += 1
            st["totalEur"] += val
            is_single = False
            if bids_raw:
                try:
                    is_single = float(bids_raw) == 1.0
                except ValueError:
                    is_single = bids_raw == "1"
            if is_single:
                st["singleOfferCount"] += 1
                st["singleOfferEur"] += val
            if "без предварително" in proc or "пряко" in proc or "договаряне" in proc:
                st["nonCompetitiveCount"] += 1
                st["nonCompetitiveEur"] += val

            ck = ceik or cname[:60]
            if ck:
                tc = st["topContractors"][ck]
                tc["name"] = cname[:100]
                tc["eik"] = ceik
                tc["eur"] += val
                tc["contracts"] += 1
                if is_single:
                    tc["single"] += 1

    out_list = []
    for aeik, label in target_eiks.items():
        st = per_auth.get(aeik)
        if not st or st["totalContracts"] == 0:
            continue
        top_c = sorted(st["topContractors"].values(), key=lambda x: x["eur"], reverse=True)[:5]
        for tc in top_c:
            tc["eur"] = round(tc["eur"], 2)
        out_list.append({
            "eik": aeik,
            "name": label,
            "contracts": st["totalContracts"],
            "totalEur": round(st["totalEur"], 2),
            "singleOfferCount": st["singleOfferCount"],
            "singleOfferEur": round(st["singleOfferEur"], 2),
            "singleOfferSharePct": round((st["singleOfferCount"] / st["totalContracts"]) * 100.0, 1),
            "nonCompetitiveCount": st["nonCompetitiveCount"],
            "nonCompetitiveEur": round(st["nonCompetitiveEur"], 2),
            "topContractors": top_c,
        })

    out_list.sort(key=lambda x: x["totalEur"], reverse=True)
    return {
        "available": True,
        "totalBlackBoxContracts": sum(x["contracts"] for x in out_list),
        "totalBlackBoxEur": round(sum(x["totalEur"] for x in out_list), 2),
        "totalSingleOfferCount": sum(x["singleOfferCount"] for x in out_list),
        "totalSingleOfferEur": round(sum(x["singleOfferEur"] for x in out_list), 2),
        "blackBoxBreakdown": out_list,
    }


def main() -> None:
    print("=== NAsvetlo Live Investigations & Cross-Link Builder ===")
    uni = build_universe()
    print(f"[1/6] Loaded ZOP universe: {len(uni['comp_by_eik']):,} companies w/EIK, {len(uni['official_by_eik']):,} politician-linked EIKs")
    sec_contracts = build_security_contract_index()
    print(f"      Indexed security ZOP contracts across {len(sec_contracts):,} contractors")

    print("[2/6] Cross-linking MVR Security Licenses (ЗЧОД)...")
    mvr_res = analyze_mvr_security(uni, sec_contracts)

    print("[3/6] Cross-linking ME Underground & Quarry Concessions...")
    me_res = analyze_me_concessions(uni)

    print("[4/6] Cross-linking DNSK Supervision Consultants & Illegal Constructions...")
    dnsk_res = analyze_dnsk(uni)

    print("[5/6] Cross-linking IAAA Transport, State Reserve Oil, MF PVU, NAP, BABH...")
    iaaa_res = analyze_iaaa(uni)
    reserve_res = analyze_state_reserve_and_energy(uni)
    dfz_res, other_res = analyze_dfz_and_gambling(uni)
    pvu_res = analyze_mf_pvu(uni)

    print("[6/6] Aggregating Black-Box single-offer telemetry from 206,907 contracts...")
    admins50 = json.loads((DATA_DIR / "nasvetlo_50_admins.json").read_text(encoding="utf-8"))
    bb_res = analyze_top_blackbox_contracts(admins50)

    payload = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "totalCrossLinkedRegistries": 11,
            "mvrSecurityZopCompanies": mvr_res.get("zopMatchedCompanies", 0),
            "mvrNoActiveZopCompanies": mvr_res.get("noActiveLicenseZopCount", 0),
            "mvrExplicitRevokedNoActive": mvr_res.get("explicitRevokedNoActiveCount", 0),
            "mvrSecurityContractNoActiveCount": mvr_res.get("securityContractNoActiveCount", 0),
            "mvrSecurityContractNoActiveEur": mvr_res.get("securityContractNoActiveEur", 0),
            "mvrSecurityZopEur": mvr_res.get("zopMatchedTotalEur", 0),
            "meConcessionsZopCompanies": me_res.get("zopMatchedCompanies", 0),
            "meConcessionsDirectEur": me_res.get("zopMatchedDirectEur", 0),
            "meConcessionsConsortiumEur": me_res.get("zopMatchedConsortiumEur", 0),
            "dnskConsultantsZopCompanies": dnsk_res.get("zopMatchedConsultants", 0),
            "dnskExpiredInZop": dnsk_res.get("expiredConsultantsInZop", 0),
            "dnskIllegalOrdersTotal": dnsk_res.get("illegalOrdersTotal", 0),
            "dnskIllegalInProcedure": dnsk_res.get("illegalInProcedure", 0),
            "iaaaTransportZopCompanies": iaaa_res.get("zopMatchedCompanies", 0),
            "iaaaTransportZopEur": iaaa_res.get("zopMatchedTotalEur", 0),
            "reserveFuelZopCompanies": reserve_res.get("zopMatchedFuelCompanies", 0),
            "reserveFuelZopEur": reserve_res.get("zopMatchedFuelEur", 0),
            "ozobZopMatched": reserve_res.get("ozobZopMatched", 0),
            "babhZopMatched": other_res.get("babhZopMatched", 0),
            "napGamblingZopMatched": other_res.get("napGamblingZopMatched", 0),
            "mfPvBudgetEur": pvu_res.get("totalBudgetEur", 0),
            "mfPvPaidEur": pvu_res.get("totalPaidEur", 0),
            "mfPvExecutionPct": pvu_res.get("executionPct", 0),
            "blackBoxTotalSingleOfferCount": bb_res.get("totalSingleOfferCount", 0),
            "blackBoxTotalSingleOfferEur": bb_res.get("totalSingleOfferEur", 0),
        },
        "investigations": {
            "mvrSecurity": mvr_res,
            "meConcessions": me_res,
            "dnsk": dnsk_res,
            "iaaa": iaaa_res,
            "reserveAndEnergy": reserve_res,
            "dfz2025": dfz_res,
            "otherRegistries": other_res,
            "mfPvu": pvu_res,
            "blackBoxContracts": bb_res,
        },
    }

    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSAVED: {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")
    print("SUMMARY:", json.dumps(payload["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
