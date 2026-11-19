#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIGMA 2.0 Deep Link & Multi-Hop Investigator (Beyond 1-Hop Direct Shares)
Forensically cross-references:
  1. Official KPKONPI / Bulgarian National Audit Office XML declarations (2025-2026, register.cacbg.bg)
     for ALL Senior State Officials (President, MPs, Ministers, Deputy Ministers, MEPs,
     Agency/Regulator Heads, Regional Mayors) across ALL XML tables (both PublicPerson & PublicPersonDekl3):
       - Private Loans / Receivables (Table 6) & Non-bank Debts (Table 7)
       - Transferred / Sold Shares (Table 11) & Direct OOD/EOOD Shares (Table 10)
       - Outside Income / Dividends / Rent (Table 12) & Third-Party Expenses/Guarantees (Tables 13/14)
       - Third-Party Real Estate / Vehicles Used (Tables 1.2 / 3.4)
       - Dekl3 Change/Interest Disclosures (Management, Shares, Regulated Contracts, Related Interests)
       - Joint-Stock Securities / Bonds in Top Public Procurement Winners (Table 9)
  2. Strict Zero-False-Positive Verification:
       - Legal-form consistency lock (AD/EAD vs OOD/EOOD)
       - City / Settlement verification against companies.csv AND live Commercial Register seat (CR_F_5_L)
  3. Hidden Consortium (ДЗЗД) Multiplier:
       - Cross-checks all 571 SIGMA officials' companies against ALL blank-EIK consortia in companies.csv
  4. Top 25 Mega-Consortia (ДЗЗД) Live Commercial Register Explosion:
       - Parses exact CR_F_* fields (Managers, Representatives, Board, Sole Owner, Partners, ZMIP Beneficial Owners)
       - Follows 1-hop holding-company parent EIKs & cross-matches owners against 2025/2026 KPKONPI politicians
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
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
RAW_DIR = REPO_ROOT.parent / "SIGMA_2_0_CORRUPTION_AUDIT" / "raw_api"
DECL_CACHE_DIR = RAW_DIR / "cacbg_xml"
DEED_CACHE_DIR = RAW_DIR / "cr_deeds"
KPKONPI_CACHE_DIR = Path(r"C:\Users\papic\Desktop\AETERNA-MILLENNIUM-SINGULARITY\data\kpkonpi_cache")

HEADERS = {
    "User-Agent": "SIGMA-2.0-Deep-Civic-Audit/2.0 (+https://github.com/papica777-eng/sigma-2-0-radar-bg)",
    "Accept": "application/xml, application/json, text/plain, */*",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Exclude banks, utilities, telecoms, insurers, retail chains & public institutions
EXCLUDED_CORP_SUBSTRINGS = [
    "банка", "банк ", "дск", "уникредит", "булбанк", "юробанк", "пощенска", "обб",
    "обединена българска", "първа инвестиционна", "пиб", "цкб", "централна кооперативна",
    "инвестбанк", "прокредит", "алианц", "ти би ай", "tbi", "бакб", "общинска банка",
    "токуда", "интернешънъл асет", "ббр", "бнб", "райфайзен", "кбц", "kbc", "дзи", "булстрад",
    "армеец", "лев инс", "евроинс", "озоф", "доверие", "съгласие", "виваком", "бтк", "а1 българия",
    "йеттел", "теленор", "мтел", "евн", "чез", "електрохолд", "енерго-про", "топлофикация",
    "софийска вода", "овергаз", "български пощи", "бдз", "бдж", "бнт", "бнр", "университет",
    "академия", "институт", "училище", "гимназия", "читалище", "болница", "умбал", "мбал",
    "нап", "нои", "нзок", "министерство", "община", "парламент", "народно събрание", "лизинг",
    "кредит", "капитал лизинг", "порше лизинг", "уникредит лизинг", "мото-пфое", "софия ауто",
    "кауфланд", "лидл", "билла", "фантастико", "метро кеш", "технополис", "лукойл", "шел",
    "омв", "еко българия", "ромпетрол", "петрол", "сименс", "siemens", "амазон", "amazon",
    "епъл", "apple", "майкрософт", "microsoft", "гугъл", "google", "тесла", "tesla",
    "медицински център", "дкц", "диагностично", "кооперация",
]

LEGAL_SUFFIX_RE = re.compile(
    r"\b(еоод|оод|еад|ад|адсиц|ет|сд|кд|кда|дззд|нпо|кооперация|сдружение|фондация|консорциум|обединение|фирма|дружество)\b",
    flags=re.I,
)

AD_FORM_RE = re.compile(r"\b(еад|ад|адсиц)\b", flags=re.I)
OOD_FORM_RE = re.compile(r"\b(еоод|оод|ет|сд|кд)\b", flags=re.I)
DZZD_FORM_RE = re.compile(r"\b(дззд|консорциум|обединение)\b", flags=re.I)

INLINE_COMPANY_RE = re.compile(
    r'(?:["„“\'«])?([А-Яа-яA-Za-z0-9][А-Яа-яA-Za-z0-9\-\.\s&]{2,65}?)(?:["„“\'»])?\s*\b(ЕООД|ООД|ЕАД|АД|АДСИЦ|ДЗЗД)\b',
    flags=re.I,
)

PRIORITY_CATEGORY_KEYWORDS = [
    "президент и вицепрезидент",
    "народни представители",
    "министър-председател",
    "членове на еп",
    "членовете на европейската комисия",
    "омбудсман",
    "кзк",
    "кфн",
    "кевр",
    "крс",
    "бнб",
    "сметната палата",
    "нзок",
    "нои",
    "кпк",
    "конпи",
    "митници",
    "изпълнителни директори на изпълнителните агенции",
    "председатели и зам. председатели на държавни агенции",
    "областни управители",
]

PRIORITY_MAYOR_CITIES = {
    "софия", "столична", "пловдив", "варна", "бургас", "русе", "стара загора", "плевен",
    "сливен", "добрич", "шумен", "перник", "хасково", "ямбол", "пазарджик", "благоевград",
    "велико търново", "враца", "габрово", "асеновград", "видин", "казанлък", "кюстендил",
    "кърджали", "монтана", "димитровград", "търговище", "ловеч", "силистра", "разград",
    "смолян", "поморие", "несебър", "созопол", "приморско", "царево", "сандански", "петрич",
}

GENERIC_CORES = {
    "строителство", "инженеринг", "консулт", "търговия", "транспорт", "медика",
    "фарма", "енергия", "българия", "софия", "варна", "бургас", "пловдив",
    "агро", "инвест", "груп", "холд", "холдинг", "трейд", "сервиз", "система",
    "системи", "проект", "проекти", "техно", "евро", "интер", "глобал", "медия",
    "прес", "нюз", "клуб", "център", "агенция", "фонд", "съюз", "камара",
    "чистота", "корект", "импулс", "каприз", "комфорт", "прогрес", "универсал",
    "стандарт", "партнерс", "партнърс", "актив", "вектор", "спектър", "контакт",
    "фокус", "модул", "ресурс", "престиж", "оптима", "максима", "алфа", "бета",
    "омега", "делта", "сигма", "матрикс", "нова", "класик", "елит", "модерн",
}


def norm_company_core(name: str) -> str:
    if not name:
        return ""
    s = name.lower()
    s = s.replace("„", " ").replace("“", " ").replace('"', " ").replace("'", " ").replace("`", " ").replace("«", " ").replace("»", " ")
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"[^а-яa-z0-9\-\s]", " ", s)
    s = LEGAL_SUFFIX_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s


def norm_city(city: str) -> str:
    if not city:
        return ""
    s = city.lower().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(гр\.?|с\.?|град|село|община|обл\.?|област|столица)\b", " ", s)
    s = re.sub(r"[^а-яa-z\s\-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s


def detect_legal_bucket(name: str) -> str:
    if DZZD_FORM_RE.search(name or ""):
        return "DZZD"
    if AD_FORM_RE.search(name or ""):
        return "AD"
    if OOD_FORM_RE.search(name or ""):
        return "OOD"
    return ""


def is_excluded_company(name: str) -> bool:
    low = f" {(name or '').lower()} "
    return any(ex in low for ex in EXCLUDED_CORP_SUBSTRINGS)


def norm_person_name(name: str) -> str:
    s = re.sub(r"\s+", " ", (name or "").strip().lower())
    s = s.replace("-", " ")
    return s


def classify_xml_table(root_tag: str, tnum: str, desc: str) -> tuple[str, str, str] | None:
    """
    Classify XML table strictly using BOTH root tag AND official Bulgarian Description attribute.
    Returns (label, code, tier) where tier is 'private_link' or 'public_stock'.
    """
    dl = (desc or "").lower()
    is_dekl3 = "dekl3" in root_tag.lower()

    if is_dekl3:
        if "договори с лица" in dl:
            return ("Договор в сферата на правомощията (Декл. чл. 35)", "regulated_contract", "private_link")
        if "свързани лица" in dl and "частен интерес" in dl:
            return ("Свързано лице с частен интерес (Декл. чл. 35)", "related_interest", "private_link")
        if "предсрочно погасяване" in dl:
            return ("Предсрочно погасен заем (Декл. чл. 35)", "early_repayment", "private_link")
        if "управител или член на орган" in dl:
            return ("Орган на управление / контрол (Декл. чл. 35)", "board_management_dekl3", "private_link")
        if "участие в следните търговски дружества" in dl:
            return ("Участие в търговско дружество (Декл. чл. 35)", "shares_dekl3", "private_link")
        if "едноличен търговец" in dl:
            return ("Едноличен търговец (Декл. чл. 35)", "et_dekl3", "private_link")
        return None

    # Standard <PublicPerson> property & interests declaration
    if "чуждо недвижимо" in dl or tnum == "1.2":
        return ("Ползван чужд недвижим имот", "property_used", "private_link")
    if "прехвърляне на имоти" in dl or tnum == "2":
        return ("Сделка / прехвърляне на имот", "property_transfer", "private_link")
    if "чужди моторни" in dl or tnum == "3.4":
        return ("Ползвано чуждо МПС", "vehicle_used", "private_link")
    if "вземания над" in dl or tnum == "6":
        return ("Вземане / Даден заем (Табл. 6)", "receivable_loan", "private_link")
    if "задължения на обща стойност" in dl or tnum == "7":
        return ("Частен заем / Задължение (Табл. 7)", "private_debt", "private_link")
    if "ценни книги" in dl or tnum == "9":
        return ("Акции / Облигации в АД (Табл. 9)", "securities_ad", "public_stock")
    if "прехвърляне на дялове" in dl or tnum == "11":
        return ("Прехвърлен / продаден дял (Табл. 11)", "transferred_shares", "private_link")
    if "дялове в дружества" in dl or tnum == "10":
        return ("Дял в ООД / ЕООД (Табл. 10)", "shares_ood", "private_link")
    if "доходи извън" in dl or tnum == "12":
        return ("Доход извън длъжността / Дивидент / Наем (Табл. 12)", "outside_income", "private_link")
    if "дадени обезпечения" in dl or tnum == "13":
        return ("Обезпечение от трето лице (Табл. 13)", "third_party_guarantee", "private_link")
    if "направени разходи" in dl or tnum == "14":
        return ("Разход, платен от трето лице (Табл. 14)", "third_party_expense", "private_link")
    return None


def load_companies_index() -> tuple[
    dict[str, dict[str, Any]],
    dict[str, list[dict[str, Any]]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    csv_path = RAW_DIR / "companies.csv"
    if not csv_path.exists():
        req = urllib.request.Request("https://sigma.midt.bg/companies.csv", headers=HEADERS)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as resp:
            csv_path.write_bytes(resp.read())

    by_eik: dict[str, dict[str, Any]] = {}
    by_core: dict[str, list[dict[str, Any]]] = defaultdict(list)
    all_consortia: list[dict[str, Any]] = []
    mega_consortia: list[dict[str, Any]] = []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            eik = (row.get("eik") or "").strip()
            name = (row.get("name") or "").strip()
            kind = (row.get("kind") or "").strip()
            won_eur = float(row.get("won_eur") or 0.0)
            contracts = int(float(row.get("contracts") or 0))
            authorities = int(float(row.get("authorities") or 0))
            settlement = (row.get("settlement") or "").strip()
            rec = {
                "eik": eik,
                "name": name,
                "kind": kind,
                "settlement": settlement,
                "cityNorm": norm_city(settlement),
                "legalBucket": detect_legal_bucket(name),
                "wonEur": round(won_eur, 2),
                "contracts": contracts,
                "authorities": authorities,
                "sector": (row.get("primary_sector") or "").strip(),
            }
            if eik and eik.isdigit() and len(eik) in (9, 13):
                by_eik[eik] = rec
            if kind == "consortium" or ";" in name:
                all_consortia.append(rec)
                if won_eur >= 25_000_000:
                    mega_consortia.append(rec)

            core = norm_company_core(name)
            if eik and eik.isdigit() and len(eik) == 9 and len(core) >= 5 and won_eur >= 2000 and not is_excluded_company(name):
                by_core[core].append(rec)

    mega_consortia.sort(key=lambda x: x["wonEur"], reverse=True)
    print(f"[1/6] Loaded {len(by_eik)} EIK companies, {len(by_core)} name keys, {len(all_consortia)} total consortia ({len(mega_consortia)} >=€25M)")
    return by_eik, by_core, all_consortia, mega_consortia


def load_sigma_571() -> tuple[list[dict[str, Any]], set[str], set[tuple[str, str]]]:
    off_path = DATA_DIR / "officials_all.json"
    data = json.loads(off_path.read_text(encoding="utf-8"))
    officials = data.get("officials") or []
    names_in_sigma: set[str] = set()
    pairs_in_sigma: set[tuple[str, str]] = set()
    for o in officials:
        n = norm_person_name(o.get("name", ""))
        names_in_sigma.add(n)
        for c in o.get("companies") or []:
            eik = str(c.get("eik") or "")
            if eik:
                pairs_in_sigma.add((n, eik))
    return officials, names_in_sigma, pairs_in_sigma


def collect_target_declarations() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, str]]]]:
    """
    Collect 2026 & 2025 XML declarations for ALL senior state politicians & regional mayors,
    AND build a full politician-name index across ALL 2025/2026 KPKONPI officials for 2-hop CR owner matching!
    """
    targets: list[dict[str, Any]] = []
    seen_xml: set[str] = set()
    all_kpk_people: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen_kpk_person_inst: set[tuple[str, str]] = set()

    for year in ("2026", "2025"):
        xml_idx = KPKONPI_CACHE_DIR / f"{year}_list.xml"
        if not xml_idx.exists():
            continue
        tree = ET.parse(xml_idx)
        root = tree.getroot()
        for cat in root.iter("Category"):
            cat_name = (cat.attrib.get("Name") or "").strip()
            cat_low = cat_name.lower()
            is_priority_cat = any(k in cat_low for k in PRIORITY_CATEGORY_KEYWORDS)
            is_mayor_cat = "кметове" in cat_low

            for inst in cat.findall("Institution"):
                inst_name = (inst.attrib.get("Name") or "").strip()
                for person in inst.findall("Person"):
                    pname = (person.findtext("Name") or "").strip()
                    if not pname:
                        continue
                    pnorm = norm_person_name(pname)
                    for pos in person.findall("Position"):
                        pos_name = (pos.findtext("Name") or "").strip()
                        if (pnorm, inst_name) not in seen_kpk_person_inst:
                            seen_kpk_person_inst.add((pnorm, inst_name))
                            all_kpk_people[pnorm].append({
                                "name": pname,
                                "institution": inst_name,
                                "position": pos_name,
                                "category": cat_name,
                                "year": year,
                            })

                        if not is_priority_cat and not is_mayor_cat:
                            continue
                        if is_mayor_cat and not is_priority_cat:
                            if not any(city in inst_name.lower() for city in PRIORITY_MAYOR_CITIES):
                                continue
                            if not any(k in pos_name.lower() for k in ["кмет", "председател"]):
                                continue

                        for decl in pos.findall("Declaration"):
                            xfile = (decl.findtext("xmlFile") or "").strip()
                            sent = (decl.findtext("Sent") or "").strip()
                            if not xfile or sent.lower() == "false":
                                continue
                            key = f"{year}/{xfile}"
                            if key in seen_xml:
                                continue
                            seen_xml.add(key)
                            targets.append({
                                "year": year,
                                "xmlFile": xfile,
                                "url": f"https://register.cacbg.bg/{year}/{xfile}",
                                "name": pname,
                                "category": cat_name,
                                "institution": inst_name,
                                "position": pos_name,
                            })

    per_person_year: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for t in targets:
        per_person_year[(norm_person_name(t["name"]), t["year"])].append(t)

    filtered: list[dict[str, Any]] = []
    for k, items in per_person_year.items():
        if k[1] == "2025" and (k[0], "2026") in per_person_year:
            continue
        filtered.extend(items[:2])

    print(f"[2/6] Selected {len(filtered)} priority XML declarations; indexed {len(all_kpk_people)} unique KPKONPI officials (2025-2026) for 2-hop CR matching")
    return filtered, all_kpk_people


def fetch_xml_cached(url: str, year: str, xfile: str) -> str | None:
    cpath = DECL_CACHE_DIR / year / xfile
    if cpath.exists() and cpath.stat().st_size > 200:
        return cpath.read_text(encoding="utf-8", errors="ignore")
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
            cpath.parent.mkdir(parents=True, exist_ok=True)
            cpath.write_text(raw, encoding="utf-8")
            return raw
        except Exception:
            time.sleep(0.3 * (attempt + 1))
    return None


def pick_best_verified_company(
    candidates: list[dict[str, Any]],
    t_code: str,
    raw_cell: str,
    declared_city: str,
) -> dict[str, Any] | None:
    """
    Strictly enforce legal-form AND city consistency to prevent homonym collisions!
    """
    cell_bucket = detect_legal_bucket(raw_cell)
    if t_code == "securities_ad":
        req_bucket = "AD"
    elif cell_bucket:
        req_bucket = cell_bucket
    elif t_code in ("shares_ood", "transferred_shares"):
        req_bucket = "OOD"
    else:
        req_bucket = ""

    decl_city_norm = norm_city(declared_city)
    valid = []
    for comp in candidates:
        if req_bucket == "AD" and comp["legalBucket"] != "AD":
            continue
        if req_bucket == "OOD" and comp["legalBucket"] in ("AD", "DZZD"):
            continue
        if req_bucket == "DZZD" and comp["legalBucket"] != "DZZD":
            continue
        # If both XML and companies.csv specify a city, require city match!
        if decl_city_norm and comp["cityNorm"]:
            if decl_city_norm != comp["cityNorm"] and decl_city_norm not in comp["cityNorm"] and comp["cityNorm"] not in decl_city_norm:
                continue
        valid.append(comp)

    if not valid:
        return None
    # Prefer exact city match if declared_city is present, then highest wonEur
    valid.sort(
        key=lambda c: (
            1 if (decl_city_norm and c["cityNorm"] and (decl_city_norm == c["cityNorm"] or decl_city_norm in c["cityNorm"])) else 0,
            c["wonEur"],
        ),
        reverse=True,
    )
    return valid[0]


def parse_and_match_declaration(
    target: dict[str, Any],
    by_eik: dict[str, dict[str, Any]],
    by_core: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    raw = fetch_xml_cached(target["url"], target["year"], target["xmlFile"])
    if not raw or "<PublicPerson" not in raw:
        return []
    try:
        root = ET.fromstring(raw)
    except Exception:
        return []

    findings: list[dict[str, Any]] = []
    decl_date = (root.findtext("./DeclarationData/DeclarationDate") or "").strip()
    decl_year = (root.findtext("./DeclarationData/Year") or target["year"]).strip()
    work_text = (root.findtext("./Personal/Work") or target["institution"]).strip()
    pos_text = (root.findtext("./Personal/Position") or target["position"]).strip()

    for table in root.findall("./Tables/Table"):
        tnum = (table.attrib.get("Num") or "").strip()
        tdesc = (table.attrib.get("Description") or "").strip()
        if (table.attrib.get("Declared") or "").lower() == "false":
            continue

        cls = classify_xml_table(root.tag, tnum, tdesc)
        if not cls:
            continue
        t_label, t_code, tier = cls

        for row in table.findall("Row"):
            cells = []
            for cell in row.findall("Cell"):
                txt = (cell.text or "").strip()
                if txt and not re.fullmatch(r"\d+\.", txt):
                    cells.append((cell.attrib.get("Num", ""), cell.attrib.get("Description", ""), txt))
            if not cells:
                continue

            row_joined = " | ".join(c[2] for c in cells)
            if len(row_joined) < 4:
                continue

            # Skip obvious bank loans/mortgages in Table 7
            if t_code == "private_debt" and is_excluded_company(row_joined):
                continue

            # Extract declared city if present (Table 10/11 typically have седалище/населено място)
            declared_city = ""
            for cnum, cdesc, cval in cells:
                dl = cdesc.lower()
                if any(k in dl for k in ["седалище", "населено място", "град"]):
                    declared_city = cval
                    break
            if not declared_city and t_code in ("shares_ood", "transferred_shares") and len(cells) >= 4:
                # Standard Table 10/11 layout: [вид, размер, фирма, седалище, стойност, собственик]
                cand_city = cells[3][2]
                if not re.search(r"\d{3,}", cand_city) and len(cand_city) <= 40:
                    declared_city = cand_city

            matched_companies: list[tuple[dict[str, Any], str, str]] = []

            # 1) Exact 9-digit EIK in any cell (highest forensic confidence!)
            for cnum, cdesc, cval in cells:
                for m in re.finditer(r"\b(\d{9})\b", cval):
                    cand_eik = m.group(1)
                    if cand_eik in by_eik and not is_excluded_company(by_eik[cand_eik]["name"]):
                        matched_companies.append((by_eik[cand_eik], "eik", cval))

            # 2) Inline company phrase extraction with explicit legal form (unlocks mixed sentences in Tables 6, 7, 12, 13, 14, Dekl3!)
            if not matched_companies:
                for cnum, cdesc, cval in cells:
                    if len(cval) < 6 or len(cval) > 220 or is_excluded_company(cval):
                        continue
                    for m in INLINE_COMPANY_RE.finditer(cval):
                        phrase = f"{m.group(1).strip()} {m.group(2).strip()}"
                        core = norm_company_core(phrase)
                        if not core or len(core) < 5:
                            continue
                        if core in GENERIC_CORES and not declared_city:
                            continue
                        if core in by_core:
                            best = pick_best_verified_company(by_core[core], t_code, phrase, declared_city)
                            if best:
                                matched_companies.append((best, "inline_legal_form", phrase))

            # 3) Exact normalized cell match (for clean company-name cells without legal suffix)
            if not matched_companies:
                for cnum, cdesc, cval in cells:
                    if len(cval) < 6 or len(cval) > 120 or is_excluded_company(cval):
                        continue
                    has_legal = bool(LEGAL_SUFFIX_RE.search(cval))
                    core = norm_company_core(cval)
                    if not core or len(core) < 6 or core in GENERIC_CORES:
                        continue
                    if core in by_core:
                        if has_legal or len(core) >= 8 or t_code in ("securities_ad", "shares_ood", "transferred_shares", "board_management_dekl3", "shares_dekl3"):
                            best = pick_best_verified_company(by_core[core], t_code, cval, declared_city)
                            if best:
                                matched_companies.append((best, "exact_name", cval))

            seen_e = set()
            for comp, match_mode, raw_cell in matched_companies:
                if comp["eik"] in seen_e:
                    continue
                seen_e.add(comp["eik"])

                # Extract declared amount / share count cleanly
                declared_amt = ""
                share_count = ""
                if t_code == "securities_ad" and len(cells) >= 2:
                    if re.fullmatch(r"[\d\s\.,]+", cells[1][2]):
                        share_count = cells[1][2].strip()
                for _, cdesc, cval in cells:
                    dl = cdesc.lower()
                    if any(k in dl for k in ["размер", "сума", "цена", "доход", "стойност", "основа", "равностойност"]):
                        if re.search(r"\d", cval):
                            declared_amt = cval
                            break

                findings.append({
                    "politician": target["name"],
                    "category": target["category"],
                    "institution": work_text or target["institution"],
                    "position": pos_text or target["position"],
                    "declarationYear": decl_year,
                    "declarationDate": decl_date,
                    "declarationUrl": target["url"],
                    "tableNum": tnum,
                    "linkType": t_label,
                    "linkCode": t_code,
                    "tier": tier,
                    "declaredCity": declared_city,
                    "shareCount": share_count,
                    "rawSnippet": row_joined[:260],
                    "rawCell": raw_cell[:120],
                    "declaredAmount": declared_amt,
                    "matchMode": match_mode,
                    "companyName": comp["name"],
                    "companyEik": comp["eik"],
                    "companyCity": comp["settlement"],
                    "companyWonEur": comp["wonEur"],
                    "companyContracts": comp["contracts"],
                    "companyAuthorities": comp["authorities"],
                    "companySigmaUrl": f"https://sigma.midt.bg/companies/{comp['eik']}",
                })

    return findings


def fetch_cr_deed(eik: str) -> dict[str, Any] | None:
    if not eik or not eik.isdigit() or len(eik) != 9:
        return None
    cpath = DEED_CACHE_DIR / f"{eik}.json"
    if cpath.exists() and cpath.stat().st_size > 100:
        try:
            return json.loads(cpath.read_text(encoding="utf-8"))
        except Exception:
            pass
    url = f"https://portal.registryagency.bg/CR/api/Deeds/{eik}"
    for attempt in range(3):
        try:
            time.sleep(0.28 + attempt * 0.4)
            req = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/json"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=18) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
            obj = json.loads(raw)
            if isinstance(obj, dict) and obj.get("uic"):
                cpath.parent.mkdir(parents=True, exist_ok=True)
                cpath.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
                return obj
        except Exception:
            time.sleep(0.6 * (attempt + 1))
    return None


def clean_html_blocks(html_data: str) -> list[str]:
    if not html_data:
        return []
    # Split multiple people separated by <hr .../>
    chunks = re.split(r"<hr[^>]*>", html_data, flags=re.I)
    out: list[str] = []
    for ch in chunks:
        txt = re.sub(r"<br\s*/?>", " | ", ch, flags=re.I)
        txt = re.sub(r"<[^>]+>", " ", txt)
        txt = html.unescape(txt)
        txt = re.sub(r"\s+", " ", txt).strip(" |,;")
        if not txt or "заличено обстоятелство" in txt.lower() or "заличен действителен собственик" in txt.lower():
            continue
        out.append(txt)
    return out


def extract_cr_deed_info(deed: dict[str, Any]) -> dict[str, Any]:
    """Extract exact structured fields using official Bulgarian CR_F_* field codes."""
    seat = ""
    seat_city = ""
    managers: list[str] = []
    owners: list[str] = []
    beneficial: list[str] = []
    parent_eiks: list[str] = []

    for sec in deed.get("sections") or []:
        for sub in sec.get("subDeeds") or []:
            if sub.get("subDeedIsClosed"):
                continue
            for grp in sub.get("groups") or []:
                for fld in grp.get("fields") or []:
                    if fld.get("fieldOperation") == 2:  # Erased / Заличено
                        continue
                    nc = str(fld.get("nameCode") or "")
                    blocks = clean_html_blocks(str(fld.get("htmlData") or ""))
                    if not blocks:
                        continue

                    if nc == "CR_F_5_L":
                        seat = blocks[0][:180]
                        m_city = re.search(r"Населено място:\s*([^,\|]+)", seat, flags=re.I)
                        if m_city:
                            seat_city = m_city.group(1).strip()
                    elif nc in ("CR_F_7_L", "CR_F_10_L", "CR_F_12_L", "CR_F_12a_L", "CR_F_12b_L", "CR_F_13_L"):
                        for b in blocks:
                            clean_p = re.sub(r",?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if clean_p and clean_p not in managers:
                                managers.append(clean_p[:140])
                    elif nc in ("CR_F_19_L", "CR_F_23_L"):
                        for b in blocks:
                            clean_o = re.sub(r",?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if clean_o and clean_o not in owners:
                                owners.append(clean_o[:160])
                            for m_eik in re.finditer(r"ЕИК/ПИК\s*(\d{9})", b):
                                pe = m_eik.group(1)
                                if pe != deed.get("uic") and pe not in parent_eiks:
                                    parent_eiks.append(pe)
                    elif nc in ("CR_F_550_L", "CR_F_550a_L"):
                        for b in blocks:
                            clean_bo = re.sub(r"\|?\s*Държава:.*$", "", b, flags=re.I).strip()
                            if clean_bo and clean_bo not in beneficial:
                                beneficial.append(clean_bo[:160])

    return {
        "companyName": deed.get("fullName") or deed.get("companyName") or "",
        "seat": seat,
        "seatCity": seat_city,
        "seatCityNorm": norm_city(seat_city),
        "managers": managers[:6],
        "owners": owners[:6],
        "beneficialOwners": beneficial[:6],
        "parentEiks": parent_eiks[:3],
    }


def extract_person_names_from_cr_strings(items: list[str]) -> list[str]:
    names = []
    for s in items:
        # Match 3 Cyrillic capitalized words (Bulgarian full name)
        for m in re.finditer(r"\b([А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,22}\s+[А-ЯЁ][а-яёА-ЯЁ\-]{1,25})\b", s):
            cand = m.group(1).strip()
            if not any(bad in cand.lower() for bad in ["република българия", "съвет на", "населено място", "размер на"]):
                names.append(cand)
    return names


def find_hidden_consortium_contracts(
    officials_571: list[dict[str, Any]],
    all_consortia: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Check if companies linked to any of the 571 SIGMA officials ALSO won contracts inside
    blank-EIK consortia (ДЗЗД) listed in companies.csv!
    Deduplicates cleanly per (officialSlug, consortiumName) and builds an official leaderboard.
    """
    print("[4/6] Scanning ALL consortia (ДЗЗД) in companies.csv for hidden contracts of the 571 SIGMA officials' firms...")
    comp_to_officials: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for o in officials_571:
        for c in o.get("companies") or []:
            core = norm_company_core(c.get("name", ""))
            if len(core) >= 6 and core not in GENERIC_CORES and not is_excluded_company(c.get("name", "")):
                comp_to_officials[core].append({
                    "officialName": o["name"],
                    "slug": o["slug"],
                    "institution": o["primaryInstitution"],
                    "circle": o["circle"],
                    "companyName": c["name"],
                    "companyEik": c["eik"],
                    "directPeriodEur": o["periodEur"],
                    "directTotalEur": o["totalEur"],
                })

    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for con in all_consortia:
        if con["wonEur"] < 10_000:
            continue
        parts = [p.strip() for p in re.split(r"[;|]+", con["name"]) if p.strip()]
        for p in parts:
            if not LEGAL_SUFFIX_RE.search(p):
                continue
            p_core = norm_company_core(p)
            p_bucket = detect_legal_bucket(p)
            if p_core in comp_to_officials:
                for off in comp_to_officials[p_core]:
                    c_bucket = detect_legal_bucket(off["companyName"])
                    if p_bucket and c_bucket and p_bucket != c_bucket:
                        continue
                    key = (off["slug"], con["name"])
                    if key not in merged:
                        merged[key] = {
                            "officialName": off["officialName"],
                            "slug": off["slug"],
                            "institution": off["institution"],
                            "circle": off["circle"],
                            "directPeriodEur": off["directPeriodEur"],
                            "directTotalEur": off["directTotalEur"],
                            "companies": [{"name": off["companyName"], "eik": off["companyEik"]}],
                            "consortiumName": con["name"],
                            "consortiumWonEur": con["wonEur"],
                            "consortiumContracts": con["contracts"],
                        }
                    else:
                        if not any(x["eik"] == off["companyEik"] for x in merged[key]["companies"]):
                            merged[key]["companies"].append({"name": off["companyName"], "eik": off["companyEik"]})

    hits = sorted(merged.values(), key=lambda x: x["consortiumWonEur"], reverse=True)

    # Aggregate per official
    by_off: dict[str, dict[str, Any]] = {}
    for h in hits:
        sl = h["slug"]
        if sl not in by_off:
            by_off[sl] = {
                "officialName": h["officialName"],
                "slug": sl,
                "institution": h["institution"],
                "circle": h["circle"],
                "directPeriodEur": h["directPeriodEur"],
                "directTotalEur": h["directTotalEur"],
                "hiddenConsortiumCount": 0,
                "hiddenConsortiumEur": 0.0,
                "companies": [],
                "topConsortia": [],
            }
        rec = by_off[sl]
        rec["hiddenConsortiumCount"] += 1
        rec["hiddenConsortiumEur"] = round(rec["hiddenConsortiumEur"] + h["consortiumWonEur"], 2)
        for c in h["companies"]:
            if not any(x["eik"] == c["eik"] for x in rec["companies"]):
                rec["companies"].append(c)
        if len(rec["topConsortia"]) < 5:
            rec["topConsortia"].append({
                "name": h["consortiumName"],
                "wonEur": h["consortiumWonEur"],
                "contracts": h["consortiumContracts"],
            })

    leaderboard = sorted(by_off.values(), key=lambda x: x["hiddenConsortiumEur"], reverse=True)
    print(f"    Found {len(hits)} unique hidden consortium (ДЗЗД) wins across {len(leaderboard)} SIGMA 2.0 officials!")
    return hits, leaderboard


def explode_top_consortia(
    mega_consortia: list[dict[str, Any]],
    by_core: dict[str, list[dict[str, Any]]],
    all_kpk_people: dict[str, list[dict[str, str]]],
) -> list[dict[str, Any]]:
    print("[5/6] Exploding Top 25 Mega-Consortia (ДЗЗД) with sequential live Commercial Register Deeds & 2-hop politician check...")
    exploded: list[dict[str, Any]] = []
    member_eiks_to_fetch: list[str] = []
    seen_eiks: set[str] = set()

    for con in mega_consortia[:25]:
        raw_name = con["name"]
        if is_excluded_company(raw_name):
            continue
        parts = [p.strip() for p in re.split(r"[;|]+", raw_name) if p.strip()]
        members = []
        for p in parts:
            core = norm_company_core(p)
            matched = None
            if core in by_core:
                matched = pick_best_verified_company(by_core[core], "consortium_member", p, "")
            if matched and matched["eik"]:
                if matched["eik"] not in seen_eiks:
                    seen_eiks.add(matched["eik"])
                    member_eiks_to_fetch.append(matched["eik"])
                members.append({
                    "name": matched["name"],
                    "eik": matched["eik"],
                    "ownWonEur": matched["wonEur"],
                    "ownContracts": matched["contracts"],
                })
            else:
                members.append({
                    "name": p,
                    "eik": "",
                    "ownWonEur": 0,
                    "ownContracts": 0,
                })
        exploded.append({
            "consortiumName": raw_name,
            "consortiumEik": con["eik"] if con["eik"].isdigit() else "",
            "wonEur": con["wonEur"],
            "contracts": con["contracts"],
            "authorities": con["authorities"],
            "members": members,
        })

    # Sequential polite fetch to avoid CR portal rate-limiting
    deed_info: dict[str, dict[str, Any]] = {}
    parent_eiks_to_fetch: list[str] = []
    for eik in member_eiks_to_fetch:
        deed = fetch_cr_deed(eik)
        if deed:
            info = extract_cr_deed_info(deed)
            deed_info[eik] = info
            for pe in info.get("parentEiks") or []:
                if pe not in seen_eiks and pe not in parent_eiks_to_fetch:
                    parent_eiks_to_fetch.append(pe)

    # Follow 1-hop corporate holding parents (e.g. ПСТ Груп -> ПСТ Холдинг -> ultimate owners!)
    parent_info: dict[str, dict[str, Any]] = {}
    for pe in parent_eiks_to_fetch[:15]:
        pdeed = fetch_cr_deed(pe)
        if pdeed:
            parent_info[pe] = extract_cr_deed_info(pdeed)

    two_hop_matches = 0
    for ex_con in exploded:
        for m in ex_con["members"]:
            if m["eik"] in deed_info:
                info = deed_info[m["eik"]]
                m["managers"] = info["managers"]
                m["owners"] = info["owners"]
                m["beneficialOwners"] = info["beneficialOwners"]
                m["seatCity"] = info["seatCity"]
                # Attach 2nd-hop holding parent owners if present
                parents_resolved = []
                for pe in info.get("parentEiks") or []:
                    if pe in parent_info:
                        pi = parent_info[pe]
                        parents_resolved.append({
                            "eik": pe,
                            "name": pi["companyName"],
                            "owners": pi["owners"],
                            "beneficialOwners": pi["beneficialOwners"],
                            "managers": pi["managers"],
                        })
                if parents_resolved:
                    m["holdingParents"] = parents_resolved

                # Cross-match all extracted person names against ALL 2025/2026 KPKONPI officials!
                all_people_strings = list(info["managers"]) + list(info["owners"]) + list(info["beneficialOwners"])
                for pr in parents_resolved:
                    all_people_strings += pr["owners"] + pr["beneficialOwners"] + pr["managers"]
                kpk_hits = []
                seen_kh = set()
                for pname in extract_person_names_from_cr_strings(all_people_strings):
                    pn = norm_person_name(pname)
                    if pn in all_kpk_people and pn not in seen_kh:
                        seen_kh.add(pn)
                        kpk_hits.append({
                            "name": pname,
                            "kpkRoles": all_kpk_people[pn][:2],
                        })
                        two_hop_matches += 1
                if kpk_hits:
                    m["kpkMatches"] = kpk_hits

    print(f"    Exploded {len(exploded)} mega-consortia; fetched live CR deeds for {len(deed_info)}/{len(member_eiks_to_fetch)} members + {len(parent_info)} holding parents; {two_hop_matches} 2-hop KPKONPI person matches")
    return exploded


def main() -> int:
    by_eik, by_core, all_consortia, mega_consortia = load_companies_index()
    officials_571, sigma_names, sigma_pairs = load_sigma_571()
    targets, all_kpk_people = collect_target_declarations()

    print(f"[3/6] Scanning {len(targets)} official KPKONPI/NAO XML declarations (cached) with strict legal-form & city verification...")
    all_findings: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(parse_and_match_declaration, t, by_eik, by_core) for t in targets]
        for fut in concurrent.futures.as_completed(futs):
            res = fut.result()
            if res:
                all_findings.extend(res)

    # Deduplicate by (politician, companyEik, linkCode) keeping latest year
    dedup: dict[tuple[str, str, str], dict[str, Any]] = {}
    for f in all_findings:
        key = (norm_person_name(f["politician"]), f["companyEik"], f["linkCode"])
        prev = dedup.get(key)
        if not prev or f["declarationYear"] > prev["declarationYear"]:
            dedup[key] = f

    # Live Commercial Register city verification for ALL missed-by-SIGMA Tier-1 (private_link) hits!
    verified_links: list[dict[str, Any]] = []
    rejected_homonyms = 0
    for f in dedup.values():
        pnorm = norm_person_name(f["politician"])
        in_sigma_person = pnorm in sigma_names
        in_sigma_pair = (pnorm, f["companyEik"]) in sigma_pairs
        missed = not in_sigma_pair
        f["inSigmaPerson"] = in_sigma_person
        f["missedBySigma"] = missed

        # Verify Tier-1 private links matched by name (not EIK) against live Commercial Register!
        if missed and f["tier"] == "private_link" and f["matchMode"] != "eik":
            deed = fetch_cr_deed(f["companyEik"])
            if deed:
                cinfo = extract_cr_deed_info(deed)
                f["crSeatCity"] = cinfo["seatCity"]
                f["crOwners"] = cinfo["owners"]
                f["crManagers"] = cinfo["managers"]
                decl_city_norm = norm_city(f.get("declaredCity", ""))
                cr_city_norm = cinfo.get("seatCityNorm", "")
                if decl_city_norm and cr_city_norm:
                    if decl_city_norm != cr_city_norm and decl_city_norm not in cr_city_norm and cr_city_norm not in decl_city_norm:
                        rejected_homonyms += 1
                        continue
                # Extra forensic check for Table 10/11 shares: verify politician or surname appears in CR owners/managers
                if f["linkCode"] in ("shares_ood", "shares_dekl3"):
                    surname = pnorm.split()[-1] if pnorm.split() else ""
                    cr_blob = " ".join(cinfo["owners"] + cinfo["managers"] + cinfo["beneficialOwners"]).lower()
                    if surname and len(surname) >= 4 and surname not in cr_blob:
                        rejected_homonyms += 1
                        continue
            elif f["linkCode"] in ("shares_ood", "transferred_shares"):
                # Cannot confirm homonym-prone OOD share without CR verification -> reject for zero false positives
                rejected_homonyms += 1
                continue

        verified_links.append(f)

    # Sort: Tier-1 private links missed by SIGMA first, then Tier-2 public stock, then EUR
    verified_links.sort(
        key=lambda x: (
            1 if (x["missedBySigma"] and x["tier"] == "private_link") else 0,
            1 if x["missedBySigma"] else 0,
            x["companyWonEur"],
        ),
        reverse=True,
    )

    hidden_consortium_hits, hidden_consortium_leaderboard = find_hidden_consortium_contracts(officials_571, all_consortia)
    consortia_exploded = explode_top_consortia(mega_consortia, by_core, all_kpk_people)

    missed_private = [x for x in verified_links if x["missedBySigma"] and x["tier"] == "private_link"]
    missed_stock = [x for x in verified_links if x["missedBySigma"] and x["tier"] == "public_stock"]
    new_politicians = {norm_person_name(x["politician"]) for x in verified_links if not x["inSigmaPerson"]}
    by_type: dict[str, int] = defaultdict(int)
    for x in verified_links:
        if x["missedBySigma"]:
            by_type[x["linkType"]] += 1

    print(f"[6/6] Writing verified deep_links.json & SIGMA_DEEP_LINKS_BEYOND.csv (rejected {rejected_homonyms} homonym false positives)...")
    summary = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "declarationsScanned": len(targets),
        "kpkOfficialsIndexed": len(all_kpk_people),
        "companiesIndexed": len(by_eik),
        "totalDeepLinksFound": len(verified_links),
        "missedBySigmaTotal": len(missed_private) + len(missed_stock),
        "missedPrivateLinksCount": len(missed_private),
        "missedPublicStockCount": len(missed_stock),
        "brandNewPoliticiansNotInSigma571": len(new_politicians),
        "rejectedHomonymsCount": rejected_homonyms,
        "hiddenConsortiumHitsCount": len(hidden_consortium_hits),
        "hiddenConsortiumOfficialsCount": len(hidden_consortium_leaderboard),
        "hiddenConsortiumTotalEur": round(sum({h["consortiumName"]: h["consortiumWonEur"] for h in hidden_consortium_hits}.values()), 2),
        "totalLinkedCompanyEur": round(sum({f["companyEik"]: f["companyWonEur"] for f in verified_links if f["missedBySigma"]}.values()), 2),
        "byLinkType": dict(sorted(by_type.items(), key=lambda kv: kv[1], reverse=True)),
        "consortiaExplodedCount": len(consortia_exploded),
    }

    (DATA_DIR / "deep_links.json").write_text(
        json.dumps(
            {
                "summary": summary,
                "deepLinks": verified_links,
                "hiddenConsortiumLeaderboard": hidden_consortium_leaderboard,
                "hiddenConsortiumHits": hidden_consortium_hits,
                "megaConsortia": consortia_exploded,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    csv_out = DATA_DIR / "SIGMA_DEEP_LINKS_BEYOND.csv"
    with csv_out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "Политик / Длъжностно лице", "Категория", "Институция", "Длъжност",
            "Ниво", "Пропуснато от СИГМА 2.0", "Тип връзка (Таблица)", "Таблица №",
            "Фирма изпълнител", "ЕИК", "Спечелени поръчки (€)", "Брой договори",
            "Деклариран брой акции / сума", "Цитат от XML декларацията", "Година",
            "Оригинален XML (Сметна палата)", "Линк СИГМА 2.0"
        ])
        for row in verified_links:
            w.writerow([
                row["politician"], row["category"], row["institution"], row["position"],
                "Частна/преки връзка" if row["tier"] == "private_link" else "Акции БФБ / АД",
                "ДА (НОВО)" if row["missedBySigma"] else "В СИГМА",
                row["linkType"], row["tableNum"],
                row["companyName"], row["companyEik"], row["companyWonEur"], row["companyContracts"],
                row["shareCount"] or row["declaredAmount"], row["rawSnippet"], row["declarationYear"],
                row["declarationUrl"], row["companySigmaUrl"],
            ])

    print("VERIFIED DEEP TRACE COMPLETE!")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("\n--- TIER 1: VERIFIED PRIVATE / MANAGEMENT / LOAN LINKS MISSED BY SIGMA 2.0 ---")
    for i, r in enumerate(missed_private, 1):
        print(f"{i:2d}. {r['politician']} ({r['position']} / {r['institution']}) --[{r['linkType']}]--> {r['companyName']} (ЕИК {r['companyEik']}, €{r['companyWonEur']:,.0f})")

    print("\n--- TOP 20 OFFICIALS WITH HIDDEN CONSORTIUM (ДЗЗД) WINS NOT COUNTED BY SIGMA 2.0 ---")
    for i, lb in enumerate(hidden_consortium_leaderboard[:20], 1):
        firms = ", ".join(c["name"] for c in lb["companies"][:2])
        print(f"{i:2d}. {lb['officialName']} ({lb['institution']}) | СИГМА показва: €{lb['directTotalEur']:,.0f} | СКРИТИ ДЗЗД ({lb['hiddenConsortiumCount']}): +€{lb['hiddenConsortiumEur']:,.0f} | чрез {firms}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
