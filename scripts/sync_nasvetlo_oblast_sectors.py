#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NAsvetlo — Complete 28-Oblast × 7-Sector National Corruption Risk Radar Generator
Aggregates 100% verified official public records across all 28 Bulgarian NUTS-3 oblasts
divided into 7 distinct corruption-risk spheres:
  1. health          — Здравеопазване & ТЕЛК (CPV 33/85 + Болници/КОЦ + НОИ 2023–2025 × НСИ ТЕЛК)
  2. infrastructure  — Инфраструктура, Строителство & Кариери (CPV 45/44/71 + МЕ Концесии + ДНСК Незаконни строежи + Анекси чл. 116)
  3. agriculture     — Земеделие, Гори & Храни (CPV 03/15/77 + ДГС/ДЛС + БАБХ обекти)
  4. energy          — Енергетика, Горива & ВиК (CPV 09/65/31 + ДА Държавен резерв складове ЗЗНН)
  5. transport       — Транспорт, Отпадъци & Чистота (CPV 34/60/90/50 + ИААА автобусни и товарни превозвачи)
  6. municipalities  — Местна власт, Общини & Политически мрежи (Общини + 571 свързани лица + Самовъзлагане + Скрити ДЗЗД + Salami)
  7. security_it     — Сигурност, Охрана, ИТ & Услуги (CPV 79/72/30/32/64/66 + NLP „Шити“ поръчки + АДФИ/КЗК/EPPO)

Outputs:
  - docs/data/nasvetlo_oblast_sectors.json
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
CACHE_DIR = REPO_ROOT / ".cache_nasvetlo_50"
CONTRACTS_CSV = Path(r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api\contracts.csv")
OUT_FILE = DATA_DIR / "nasvetlo_oblast_sectors.json"

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

SECTORS_DEF: list[dict[str, Any]] = [
    {
        "id": "health",
        "label": "Здравеопазване & ТЕЛК",
        "short": "Здраве & ТЕЛК",
        "color": "#dc2626",
        "cpvCodes": ["33", "85"],
        "description": "Болници (УМБАЛ/МБАЛ/КОЦ), лекарства и апаратура по ЗОП (CPV 33/85) + 28-областен ТЕЛК форензик профил (НОИ 2023–2025 × НСИ).",
    },
    {
        "id": "infrastructure",
        "label": "Инфраструктура, Строителство & Кариери",
        "short": "Инфраструктура",
        "color": "#b45309",
        "cpvCodes": ["45", "44", "71", "42", "43"],
        "description": "Пътно и обществено строителство, надзор и материали (CPV 45/44/71) + кариерни концесии (МЕ) + висящи незаконни строежи (ДНСК) + анекси чл. 116.",
    },
    {
        "id": "agriculture",
        "label": "Земеделие, Гори & Храни",
        "short": "Земеделие & Гори",
        "color": "#15803d",
        "cpvCodes": ["03", "15", "77", "16"],
        "description": "Земеделски и горски поръчки (ДГС/ДЛС, CPV 03/77), доставки на храни (CPV 15) и регистрирани преработвателни обекти (БАБХ).",
    },
    {
        "id": "energy",
        "label": "Енергетика, Горива & ВиК",
        "short": "Енергетика & ВиК",
        "color": "#7c3aed",
        "cpvCodes": ["09", "65", "31"],
        "description": "Електроенергия, горива, топлофикации и ВиК оператори (CPV 09/65/31) + петролни складови бази по ЗЗНН (ДА „Държавен резерв“).",
    },
    {
        "id": "transport",
        "label": "Транспорт, Отпадъци & Чистота",
        "short": "Транспорт & Смет",
        "color": "#0369a1",
        "cpvCodes": ["34", "60", "90", "50"],
        "description": "Градски и обществен транспорт, сметопочистване, депа и ремонти (CPV 34/60/90/50) + лицензирани превозвачи (ИААА).",
    },
    {
        "id": "municipalities",
        "label": "Общини, Местна власт & Политически мрежи",
        "short": "Общини & Власт",
        "color": "#be123c",
        "cpvCodes": [],
        "description": "Общински възложители в областта, политически свързани лица (571), случаи на самовъзлагане, скрити ДЗЗД консорциуми и Salami разделяне.",
    },
    {
        "id": "security_it",
        "label": "Сигурност, Охрана, ИТ & Услуги",
        "short": "Сигурност & ИТ",
        "color": "#334155",
        "cpvCodes": ["79", "72", "30", "32", "64", "66", "35", "48"],
        "description": "Частна охрана, право, PR, ИТ системи и телекоми (CPV 79/72/30/32/64/66) + марково заключване (NLP чл. 49) + АДФИ/КЗК/EPPO контрол.",
    },
]

CPV_TO_SECTOR: dict[str, str] = {}
for sdef in SECTORS_DEF:
    for code in sdef["cpvCodes"]:
        CPV_TO_SECTOR[code] = sdef["id"]

NON_COMPETITIVE_KEYWORDS = (
    "договаряне без",
    "пряко договаряне",
    "покана до определени",
    "чл. 79",
    "чл. 182",
    "чл. 191",
    "неконкурент",
)

OBLAST_MATCH_RULES: list[tuple[str, list[str]]] = [
    ("София (столица)", ["софия (столица)", "софия-град", "софия град", "столична", "гр. софия", "гр.софия", "софия-столица"]),
    ("София", ["софия-област", "софия област", "софийска", "самоков", "ботевград", "ихтиман", "своге", "елин пелин", "костинброд", "сливница", "етрополе", "пирдоп", "златица", "правец", "костенец", "божурище", "годеч", "драгоман", "долна баня"]),
    ("Велико Търново", ["велико търново", "в. търново", "в.търново", "горна оряховица", "свищов", "павликени", "стражица", "елена", "лясковец", "полски тръмбеш"]),
    ("Стара Загора", ["стара загора", "ст. загора", "ст.загора", "казанлък", "чирпан", "раднево", "гълъбово", "мъглиж", "павел баня", "гурково", "николаево"]),
    ("Благоевград", ["благоевград", "петрич", "сандански", "гоце делчев", "разлог", "банско", "симитли", "кресна", "якоруда", "белица", "гърмен", "сатовча", "хаджидимово", "струмяни"]),
    ("Бургас", ["бургас", "несебър", "поморие", "созопол", "царево", "айтос", "карнобат", "приморско", "средец", "камено", "руен", "сунгурларе", "малко търново"]),
    ("Варна", ["варна", "провадия", "девния", "аксаково", "белослав", "долни чифлик", "дългопол", "суворово", "вълчи дол", "аврен", "бяла"]),
    ("Пловдив", ["пловдив", "асеновград", "карлово", "първомай", "раковски", "стамболийски", "хисаря", "сопот", "съединение", "родопи", "марица", "калояново", "брезово", "кричим", "перущица", "куклен", "садово", "лъки"]),
    ("Видин", ["видин", "белоградчик", "кула", "брегово", "димово", "ново село", "чупрене", "ружинци"]),
    ("Враца", ["враца", "козлодуй", "бяла слатина", "мездра", "оряхово", "мизия", "роман", "криводол", "борован", "хайредин"]),
    ("Габрово", ["габрово", "севлиево", "дряново", "трявна"]),
    ("Добрич", ["добрич", "балчик", "каварна", "генерал тошево", "тервел", "шабла", "крушари"]),
    ("Кърджали", ["кърджали", "момчилград", "крумовград", "ардино", "джебел", "кирково", "черноочене"]),
    ("Кюстендил", ["кюстендил", "дупница", "бобов дол", "сапарева баня", "кочериново", "рила", "невестино", "бобошево"]),
    ("Ловеч", ["ловеч", "троян", "тетевен", "луковит", "ябланица", "угърчин", "летница", "априлци"]),
    ("Монтана", ["монтана", "лом", "берковица", "вършец", "вълчедръм", "бойчиновци", "чипровци", "брусарци", "медковец", "якимово"]),
    ("Пазарджик", ["пазарджик", "велинград", "пещера", "панагюрище", "септември", "брацигово", "батаk", "батак", "ракитово", "стрелча", "белово", "лесичово", "сърница"]),
    ("Перник", ["перник", "радомир", "брезник", "трън", "земен", "ковачевци"]),
    ("Плевен", ["плевен", "червен бряг", "кнежа", "левски", "белене", "никопол", "долна митрополия", "долни дъбник", "гулянци", "искър", "пордим"]),
    ("Разград", ["разград", "исперих", "кубрат", "завет", "лозница", "цар калоян", "самуил"]),
    ("Русе", ["русе", "бяла", "ветово", "две могили", "иваново", "сливо поле", "ценово", "боров"]),
    ("Силистра", ["силистра", "тутракан", "дулово", "главиница", "алфатар", "кайнарджа", "ситово"]),
    ("Сливен", ["сливен", "нова загора", "котел", "твърдица"]),
    ("Смолян", ["смолян", "девин", "мадан", "златоград", "чепеларе", "рудозем", "доспат", "неделино", "баните", "борино"]),
    ("Търговище", ["търговище", "попово", "омуртаг", "антоново", "опака"]),
    ("Хасково", ["хасково", "димитровград", "харманли", "свиленград", "любимец", "симеоновград", "тополовград", "ивайловград", "маджарово", "минерални бани", "стамболово"]),
    ("Шумен", ["шумен", "нови пазар", "велики преслав", "каспичан", "смядово", "върбица", "каолиново", "хитрино", "венец", "никола козлево"]),
    ("Ямбол", ["ямбол", "елхово", "стралджа", "тунджа", "болярово"]),
]


def norm_oblast(raw: str | None) -> str | None:
    if not raw:
        return None
    s = re.sub(r"\s+", " ", str(raw).strip().lower()).replace("–", "-").replace("—", "-")
    if s in ("софия", "обл. софия", "софия-област", "софия област"):
        return "София"
    if s in ("софия (столица)", "софия-град", "софия град", "столична"):
        return "София (столица)"
    for name, pats in OBLAST_MATCH_RULES:
        for p in pats:
            if p in s:
                return name
    return None


def read_csv_safe(path: Path) -> list[list[str]]:
    if not path.exists():
        return []
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    sample = "\n".join(text.splitlines()[:5])
    delim = ";" if sample.count(";") > sample.count(",") * 2 else ","
    return [row for row in csv.reader(io.StringIO(text), delimiter=delim) if any(c.strip() for c in row)]


def load_open_data_regional_counts() -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {
        o["name"]: {
            "dnskIllegalTotal": 0,
            "dnskIllegalPending": 0,
            "meConcessions": 0,
            "babhFacilities": 0,
            "iaaaBusOperators": 0,
            "iaaaCargoOperators": 0,
            "fuelDepots": 0,
        }
        for o in OBLASTS_META
    }

    # 1. DNSK Illegal construction orders
    rows = read_csv_safe(CACHE_DIR / "feed_dnsk_illegal_62643a3c.csv")
    for r in rows[2:]:
        if len(r) < 5:
            continue
        loc = f"{r[2]} {r[3]}"
        ob = norm_oblast(loc)
        if not ob:
            continue
        counts[ob]["dnskIllegalTotal"] += 1
        removed_date = (r[5] if len(r) > 5 else "").strip()
        action = (r[4] or "").lower()
        if not removed_date and "премахнат" not in action and "изпълнен" not in action:
            counts[ob]["dnskIllegalPending"] += 1

    # 2. ME Mining / Quarry Concessions
    rows = read_csv_safe(CACHE_DIR / "feed_me_concessions_52a85f74.csv")
    for r in rows[1:]:
        if len(r) < 6:
            continue
        ob = norm_oblast(r[5]) or norm_oblast(r[4])
        if ob:
            counts[ob]["meConcessions"] += 1

    # 3. BABH Food & Meat Wholesale/Processing facilities
    rows = read_csv_safe(CACHE_DIR / "feed_babh_wholesale_20462b29.csv")
    for r in rows[1:]:
        if len(r) < 5:
            continue
        ob = norm_oblast(r[4])
        if ob:
            counts[ob]["babhFacilities"] += 1

    # 4. IAAA Bus & Cargo Licensed Operators
    rows = read_csv_safe(CACHE_DIR / "feed_iaaa_bus_ce9ea56c.csv")
    for r in rows[1:]:
        if len(r) < 5:
            continue
        ob = norm_oblast(r[3]) or norm_oblast(r[4])
        if ob:
            counts[ob]["iaaaBusOperators"] += 1

    rows = read_csv_safe(CACHE_DIR / "feed_iaaa_cargo_ed19d48a.csv")
    for r in rows[1:]:
        if len(r) < 5:
            continue
        ob = norm_oblast(r[3]) or norm_oblast(r[4])
        if ob:
            counts[ob]["iaaaCargoOperators"] += 1

    # 5. State Reserve Fuel Depots (ZZNN)
    rows = read_csv_safe(CACHE_DIR / "feed_rezerv_wh_603eec5c.csv")
    for r in rows[1:]:
        if len(r) < 5:
            continue
        ob = norm_oblast(r[4]) or norm_oblast(r[1])
        if ob:
            counts[ob]["fuelDepots"] += 1

    return counts


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def build_oblast_sectors() -> dict[str, Any]:
    auth_raw = json.loads((DATA_DIR / "authorities_index.json").read_text(encoding="utf-8"))
    macro_raw = json.loads((DATA_DIR / "sigma3_macro.json").read_text(encoding="utf-8"))
    telk_raw = json.loads((DATA_DIR / "nasvetlo_telk_radar.json").read_text(encoding="utf-8"))
    f7_raw = json.loads((DATA_DIR / "sigma3_forensics_7.json").read_text(encoding="utf-8"))
    j6_raw = json.loads((DATA_DIR / "sigma3_judicial_6.json").read_text(encoding="utf-8"))

    # Map authority EIK -> region, type, name
    a_fields = auth_raw["fields"]
    a_idx = {f: i for i, f in enumerate(a_fields)}
    auth_meta: dict[str, dict[str, Any]] = {}
    for row in auth_raw["rows"]:
        eik = str(row[a_idx["eik"]] or "").strip()
        reg = norm_oblast(row[a_idx["region"]]) or norm_oblast(row[a_idx["settlement"]])
        if not eik or not reg:
            continue
        auth_meta[eik] = {
            "eik": eik,
            "name": str(row[a_idx["name"]] or ""),
            "type": str(row[a_idx["type"]] or ""),
            "region": reg,
            "spentEur": float(row[a_idx["spentEur"]] or 0.0),
            "contracts": int(row[a_idx["contracts"]] or 0),
            "linkedCount": int(row[a_idx["linkedCount"]] or 0),
            "ownHits": int(row[a_idx["ownHits"]] or 0),
            "riskScore": int(row[a_idx["riskScore"]] or 0),
        }

    # Macro oblast info (officials, ownHits, hiddenDzzdEur, total valueEur)
    macro_by_nuts3: dict[str, dict[str, Any]] = {
        o["nuts3"]: o for o in macro_raw.get("mapGeo", {}).get("oblasts", [])
    }
    telk_by_nuts3: dict[str, dict[str, Any]] = {
        o["nuts3"]: o for o in telk_raw.get("oblasts", [])
    }

    # Open-data cross-registry counts by oblast
    open_counts = load_open_data_regional_counts()

    # Forensics7 & Judicial6 per oblast via authority_eik
    forensic_by_ob: dict[str, dict[str, Any]] = {
        o["name"]: {
            "annexInflationEur": 0.0,
            "annexCount": 0,
            "salamiClusters": 0,
            "salamiEur": 0.0,
            "nlpTailoredCount": 0,
            "nlpTailoredEur": 0.0,
            "eppoMegaCount": 0,
            "eppoMegaEur": 0.0,
            "adfiReports": 0,
        }
        for o in OBLASTS_META
    }

    for c in f7_raw.get("engine1_annexInflation", {}).get("contracts", []):
        am = auth_meta.get(str(c.get("authorityEik", "")).strip())
        if am:
            fb = forensic_by_ob[am["region"]]
            fb["annexCount"] += 1
            fb["annexInflationEur"] += float(c.get("inflationEur") or 0.0)

    for cl in f7_raw.get("engine3_salamiSlicing", {}).get("topClusters", []):
        am = auth_meta.get(str(cl.get("authorityEik", "")).strip())
        if am:
            fb = forensic_by_ob[am["region"]]
            fb["salamiClusters"] += 1
            fb["salamiEur"] += float(cl.get("totalEur") or 0.0)

    for nc in f7_raw.get("engine7_nlpTailoredSpecs", {}).get("topTailoredContracts", []):
        am = auth_meta.get(str(nc.get("authorityEik", "")).strip())
        if am:
            fb = forensic_by_ob[am["region"]]
            fb["nlpTailoredCount"] += 1
            fb["nlpTailoredEur"] += float(nc.get("valueEur") or 0.0)

    for ec in j6_raw.get("radar6_eppoEuFunds", {}).get("topRiskyEuContracts", []):
        am = auth_meta.get(str(ec.get("authorityEik", "")).strip())
        if am:
            fb = forensic_by_ob[am["region"]]
            fb["eppoMegaCount"] += 1
            fb["eppoMegaEur"] += float(ec.get("valueEur") or 0.0)

    for rep in j6_raw.get("radar2_adfiImpunity", {}).get("topViolatedAuthorities", []):
        am = auth_meta.get(str(rep.get("eik", "")).strip())
        if am:
            forensic_by_ob[am["region"]]["adfiReports"] += int(rep.get("reports") or rep.get("count") or 1)

    # Aggregate ALL 206,907 contracts from contracts.csv into (oblast, sector) buckets!
    # Also populate `municipalities` bucket from municipal contracting authorities (`type == 'община'`).
    buckets: dict[tuple[str, str], dict[str, Any]] = {}
    for o in OBLASTS_META:
        for s in SECTORS_DEF:
            buckets[(o["name"], s["id"])] = {
                "valueEur": 0.0,
                "contracts": 0,
                "singleOfferCount": 0,
                "singleOfferEur": 0.0,
                "bidsKnownCount": 0,
                "bidsKnownEur": 0.0,
                "nonCompCount": 0,
                "nonCompEur": 0.0,
                "euEur": 0.0,
                "euCount": 0,
                "authSpend": defaultdict(lambda: [0.0, 0, ""]),
                "compSpend": defaultdict(lambda: [0.0, 0, ""]),
            }

    health_auth_re = re.compile(r"(болниц|мбал|умбал|сбал|дкц|коц|цсмп|рзи|здрав|онколог|психиатр|нзок)", re.I)
    agri_auth_re = re.compile(r"(горск|ловн|земедел|бабх|напоителн|рибарств)", re.I)
    energy_auth_re = re.compile(r"(аец|тец|мини марица|есо |нек |булгартранс|булгаргаз|електроразпр|топлофикац|водоснабдяване|вик |резерв)", re.I)

    def add_to_bucket(ob: str, sid: str, val: float, bids: int | None, is_nc: bool, eu: bool, a_eik: str, a_name: str, c_eik: str, c_name: str) -> None:
        b = buckets[(ob, sid)]
        b["valueEur"] += val
        b["contracts"] += 1
        if bids is not None and bids > 0:
            b["bidsKnownCount"] += 1
            b["bidsKnownEur"] += val
            if bids == 1:
                b["singleOfferCount"] += 1
                b["singleOfferEur"] += val
        if is_nc:
            b["nonCompCount"] += 1
            b["nonCompEur"] += val
        if eu:
            b["euCount"] += 1
            b["euEur"] += val
        if a_eik:
            rec = b["authSpend"][a_eik]
            rec[0] += val
            rec[1] += 1
            if not rec[2]:
                rec[2] = a_name
        if c_eik or c_name:
            ckey = c_eik or c_name[:40]
            crec = b["compSpend"][ckey]
            crec[0] += val
            crec[1] += 1
            if not crec[2]:
                crec[2] = c_name

    matched_contracts = 0
    if CONTRACTS_CSV.exists():
        with CONTRACTS_CSV.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                a_eik = (row.get("authority_eik") or "").strip()
                am = auth_meta.get(a_eik)
                if not am:
                    continue
                ob = am["region"]
                matched_contracts += 1
                try:
                    val = float(row.get("value_eur") or 0.0)
                except ValueError:
                    val = 0.0
                if val < 0:
                    val = 0.0
                bids_raw = (row.get("bids_received") or "").strip()
                bids = int(float(bids_raw)) if bids_raw and bids_raw.replace(".", "", 1).isdigit() else None
                proc = (row.get("procedure") or "").lower()
                is_nc = any(k in proc for k in NON_COMPETITIVE_KEYWORDS)
                eu = str(row.get("eu_funded") or "").strip() in ("1", "true", "True")
                c_eik = (row.get("contractor_eik") or "").strip()
                c_name = (row.get("contractor") or "").strip()
                a_name = am["name"] or (row.get("authority") or "").strip()
                cpv2 = (row.get("sector_code") or "").strip()[:2]

                # Primary sector by CPV code + authority semantic refinement
                sid = CPV_TO_SECTOR.get(cpv2)
                if not sid:
                    if am["type"] == "болница" or health_auth_re.search(a_name):
                        sid = "health"
                    elif energy_auth_re.search(a_name):
                        sid = "energy"
                    elif agri_auth_re.search(a_name):
                        sid = "agriculture"
                    else:
                        sid = "security_it"
                # Keep hospital medical contracts inside health even if general supply CPV
                if am["type"] == "болница" and cpv2 in ("33", "85", "38", "39", "18"):
                    sid = "health"

                add_to_bucket(ob, sid, val, bids, is_nc, eu, a_eik, a_name, c_eik, c_name)

                # Also record ALL municipal-authority contracts in the `municipalities` sphere!
                if am["type"] == "община" or a_name.upper().startswith("ОБЩИНА "):
                    add_to_bucket(ob, "municipalities", val, bids, is_nc, eu, a_eik, a_name, c_eik, c_name)

    # Assemble structured 28-oblast × 7-sector profiles with transparent deterministic 0-100 risk scores
    oblasts_out: list[dict[str, Any]] = []
    national_sector_totals: dict[str, dict[str, Any]] = {
        s["id"]: {"valueEur": 0.0, "contracts": 0, "singleOfferEur": 0.0, "bidsKnownEur": 0.0, "nonCompEur": 0.0, "scores": []}
        for s in SECTORS_DEF
    }

    for meta in OBLASTS_META:
        name = meta["name"]
        nuts3 = meta["nuts3"]
        mg = macro_by_nuts3.get(nuts3, {})
        tl = telk_by_nuts3.get(nuts3, {})
        oc = open_counts[name]
        fb = forensic_by_ob[name]

        sectors_map: dict[str, Any] = {}
        sector_scores: list[int] = []

        for sdef in SECTORS_DEF:
            sid = sdef["id"]
            b = buckets[(name, sid)]
            val_eur = round(b["valueEur"], 2)
            cnt = b["contracts"]
            so_val_pct = round((b["singleOfferEur"] / b["bidsKnownEur"] * 100.0), 1) if b["bidsKnownEur"] > 0 else 0.0
            so_cnt_pct = round((b["singleOfferCount"] / b["bidsKnownCount"] * 100.0), 1) if b["bidsKnownCount"] > 0 else 0.0
            nc_pct = round((b["nonCompEur"] / val_eur * 100.0), 1) if val_eur > 0 else 0.0

            # Compute Top 3 authorities & Top 3 contractors in this oblast × sector
            top_auths = sorted(b["authSpend"].items(), key=lambda kv: kv[1][0], reverse=True)[:3]
            top_comps = sorted(b["compSpend"].items(), key=lambda kv: kv[1][0], reverse=True)[:3]
            top_auth_share = (top_auths[0][1][0] / val_eur * 100.0) if (top_auths and val_eur > 0) else 0.0
            top_comp_share = (top_comps[0][1][0] / val_eur * 100.0) if (top_comps and val_eur > 0) else 0.0

            # Base ZOP procurement risk score (0-100):
            # 1-offer share (up to 42 pts) + non-competitive share (up to 24 pts) + supplier concentration (up to 16 pts) + volume log weight (up to 18 pts)
            base_zop_risk = (
                clamp(so_val_pct * 0.62, 0, 42)
                + clamp(nc_pct * 0.55, 0, 24)
                + clamp(top_comp_share * 0.25, 0, 16)
                + clamp(math.log10(val_eur + 1.0) * 1.8 - 6.0, 0, 14)
            )

            # Sector-specific official cross-registry enrichment & red flags!
            signals: list[str] = []
            extra_metrics: list[dict[str, str]] = []
            sector_score = base_zop_risk

            if so_val_pct >= 45.0:
                signals.append(f"{so_val_pct:.1f}% от обема с 1 оферта")
            if nc_pct >= 20.0:
                signals.append(f"{nc_pct:.1f}% неконкурентно възлагане")
            if top_comp_share >= 35.0 and top_comps:
                signals.append(f"Топ фирма държи {top_comp_share:.0f}% от сектора")

            if sid == "health":
                telk_sc = int(tl.get("telkRiskScore") or 0)
                # Blend 55% TELK anomaly score (NOI × NSI) + 45% Healthcare ZOP risk
                sector_score = 0.55 * telk_sc + 0.45 * base_zop_risk
                extra_metrics = [
                    {"k": "ТЕЛК Риск (НОИ × НСИ)", "v": f"{telk_sc}/100 ({tl.get('riskTier', 'BASELINE')})"},
                    {"k": "Инв. пенсионери (2025)", "v": f"{int(tl.get('invPensioners2025') or 0):,} ({tl.get('per1000Pop2025', 0)}/1000 д.)".replace(",", " ")},
                    {"k": "2-год. ТЕЛК ръст", "v": f"{float(tl.get('growth2yPct') or 0):+.1f}%"},
                    {"k": "Дял >90% ТНР", "v": f"{float(tl.get('tnrOver90Pct') or 0):.1f}%"},
                ]
                for fl in (tl.get("anomalyFlags") or [])[:2]:
                    signals.append(fl)

            elif sid == "infrastructure":
                dnsk_pend = oc["dnskIllegalPending"]
                me_conc = oc["meConcessions"]
                annex_eur = fb["annexInflationEur"]
                sector_score = base_zop_risk + clamp(dnsk_pend / 35.0, 0, 12) + clamp(me_conc * 0.6, 0, 8) + (8 if annex_eur > 2e6 else 0)
                extra_metrics = [
                    {"k": "ДНСК висящи събаряния", "v": f"{dnsk_pend} от {oc['dnskIllegalTotal']}"},
                    {"k": "МЕ кариерни концесии", "v": str(me_conc)},
                    {"k": "Анекси чл. 116 (оскъпяване)", "v": f"€{annex_eur/1e6:.2f} млн." if annex_eur >= 1e6 else f"€{annex_eur:,.0f}".replace(",", " ")},
                    {"k": "ЕС инфраструктура", "v": f"€{b['euEur']/1e6:.1f} млн."},
                ]
                if dnsk_pend >= 100:
                    signals.append(f"{dnsk_pend} висящи заповеди на ДНСК за незаконни строежи")
                if me_conc >= 10:
                    signals.append(f"{me_conc} кариерни концесии в областта")

            elif sid == "agriculture":
                babh = oc["babhFacilities"]
                sector_score = base_zop_risk + clamp(babh / 45.0, 0, 8)
                extra_metrics = [
                    {"k": "БАБХ преработвателни обекти", "v": str(babh)},
                    {"k": "Договори (Гори/Храни/Зем.)", "v": f"{cnt:,}".replace(",", " ")},
                    {"k": "1 оферта (по брой)", "v": f"{so_cnt_pct:.1f}%"},
                    {"k": "ЕС проекти (сектор)", "v": f"€{b['euEur']/1e6:.1f} млн."},
                ]

            elif sid == "energy":
                depots = oc["fuelDepots"]
                sector_score = base_zop_risk + clamp(depots * 1.5, 0, 10)
                extra_metrics = [
                    {"k": "Петролни бази (ЗЗНН)", "v": str(depots)},
                    {"k": "1 оферта (по стойност)", "v": f"{so_val_pct:.1f}%"},
                    {"k": "Неконкурентни процедури", "v": f"{nc_pct:.1f}%"},
                    {"k": "Топ изпълнител дял", "v": f"{top_comp_share:.1f}%"},
                ]

            elif sid == "transport":
                iaaa_tot = oc["iaaaBusOperators"] + oc["iaaaCargoOperators"]
                sector_score = base_zop_risk + clamp(iaaa_tot / 120.0, 0, 8)
                extra_metrics = [
                    {"k": "ИААА автобусни превозвачи", "v": str(oc["iaaaBusOperators"])},
                    {"k": "ИААА товарни превозвачи", "v": str(oc["iaaaCargoOperators"])},
                    {"k": "1 оферта (транспорт/смет)", "v": f"{so_val_pct:.1f}%"},
                    {"k": "Топ изпълнител дял", "v": f"{top_comp_share:.1f}%"},
                ]

            elif sid == "municipalities":
                own_hits = int(mg.get("ownHits") or 0)
                off_cnt = int(mg.get("officialCount") or 0)
                dzzd_eur = float(mg.get("hiddenDzzdEur") or 0.0)
                salami_c = fb["salamiClusters"]
                sector_score = (
                    0.45 * base_zop_risk
                    + clamp(own_hits * 11.0, 0, 32)
                    + clamp(off_cnt * 0.9, 0, 15)
                    + (12 if dzzd_eur >= 5e6 else 6 if dzzd_eur > 0 else 0)
                    + clamp(salami_c * 2.5, 0, 10)
                )
                extra_metrics = [
                    {"k": "Свързани лица (571)", "v": str(off_cnt)},
                    {"k": "Случаи на самовъзлагане", "v": str(own_hits)},
                    {"k": "Скрити ДЗЗД (политици)", "v": f"€{dzzd_eur/1e6:.2f} млн." if dzzd_eur >= 1e6 else f"€{dzzd_eur:,.0f}".replace(",", " ")},
                    {"k": "Salami клъстери (под прага)", "v": str(salami_c)},
                ]
                if own_hits > 0:
                    signals.append(f"{own_hits} случая на самовъзлагане от собствена институция")
                if dzzd_eur >= 1e6:
                    signals.append(f"+€{dzzd_eur/1e6:.1f} млн. скрити ДЗЗД на политици")

            elif sid == "security_it":
                nlp_c = fb["nlpTailoredCount"]
                eppo_c = fb["eppoMegaCount"]
                adfi_c = fb["adfiReports"]
                sector_score = base_zop_risk + clamp(nlp_c * 3.0, 0, 14) + clamp(eppo_c * 2.0, 0, 10)
                extra_metrics = [
                    {"k": "NLP „Шити“ поръчки (чл. 49)", "v": str(nlp_c)},
                    {"k": "EPPO ЕС мега-договори ≥€1M", "v": str(eppo_c)},
                    {"k": "Топ АДФИ нарушители", "v": str(adfi_c)},
                    {"k": "1 оферта (охрана/ИТ/услуги)", "v": f"{so_val_pct:.1f}%"},
                ]
                if nlp_c >= 3:
                    signals.append(f"{nlp_c} договора с NLP марково заключване (чл. 49 ЗОП)")
                if eppo_c >= 3:
                    signals.append(f"{eppo_c} високорискови ЕС мега-договора (EPPO мандат)")

            final_score = int(round(clamp(sector_score, 5.0, 99.0)))
            sector_scores.append(final_score)

            sectors_map[sid] = {
                "id": sid,
                "label": sdef["label"],
                "short": sdef["short"],
                "color": sdef["color"],
                "riskScore": final_score,
                "riskTier": "CRITICAL" if final_score >= 70 else "HIGH" if final_score >= 52 else "ELEVATED" if final_score >= 35 else "BASELINE",
                "valueEur": val_eur,
                "contracts": cnt,
                "singleOfferValPct": so_val_pct,
                "singleOfferCntPct": so_cnt_pct,
                "nonCompPct": nc_pct,
                "nonCompEur": round(b["nonCompEur"], 2),
                "euEur": round(b["euEur"], 2),
                "topCompSharePct": round(top_comp_share, 1),
                "extraMetrics": extra_metrics,
                "signals": signals[:4],
                "topAuthorities": [
                    {"eik": k, "name": v[2], "eur": round(v[0], 2), "contracts": v[1]}
                    for k, v in top_auths
                ],
                "topContractors": [
                    {"eik": k if re.fullmatch(r"\d{9,13}", k) else "", "name": v[2], "eur": round(v[0], 2), "contracts": v[1]}
                    for k, v in top_comps
                ],
            }

            nt = national_sector_totals[sid]
            nt["valueEur"] += val_eur
            nt["contracts"] += cnt
            nt["singleOfferEur"] += b["singleOfferEur"]
            nt["bidsKnownEur"] += b["bidsKnownEur"]
            nt["nonCompEur"] += b["nonCompEur"]
            nt["scores"].append((name, nuts3, final_score, val_eur))

        # Overall 7-Sector Composite Corruption Risk Index for this Oblast (weighted mean of top 3 hottest spheres + all 7 mean)
        sorted_sc = sorted(sector_scores, reverse=True)
        overall_score = int(round(clamp(0.55 * (sum(sorted_sc[:3]) / 3.0) + 0.45 * (sum(sorted_sc) / len(sorted_sc)), 5.0, 99.0)))
        hottest = max(sectors_map.values(), key=lambda x: x["riskScore"])

        oblasts_out.append({
            "nuts3": nuts3,
            "name": name,
            "nuts2": meta["nuts2"],
            "population2025": int(tl.get("population2025") or 0),
            "overallCorruptionIndex": overall_score,
            "overallTier": "CRITICAL" if overall_score >= 70 else "HIGH" if overall_score >= 52 else "ELEVATED" if overall_score >= 35 else "BASELINE",
            "hottestSectorId": hottest["id"],
            "hottestSectorLabel": hottest["label"],
            "hottestSectorScore": hottest["riskScore"],
            "totalZopEur": round(float(mg.get("valueEur") or 0.0), 2),
            "totalContracts": int(mg.get("contracts") or 0),
            "authoritiesCount": int(mg.get("authorities") or 0),
            "officialCount": int(mg.get("officialCount") or 0),
            "ownHits": int(mg.get("ownHits") or 0),
            "hiddenDzzdEur": round(float(mg.get("hiddenDzzdEur") or 0.0), 2),
            "openDataCounters": oc,
            "sectors": sectors_map,
        })

    oblasts_out.sort(key=lambda x: x["overallCorruptionIndex"], reverse=True)

    sectors_summary = []
    for sdef in SECTORS_DEF:
        sid = sdef["id"]
        nt = national_sector_totals[sid]
        top3 = sorted(nt["scores"], key=lambda x: x[2], reverse=True)[:3]
        sectors_summary.append({
            "id": sid,
            "label": sdef["label"],
            "short": sdef["short"],
            "color": sdef["color"],
            "description": sdef["description"],
            "nationalValueEur": round(nt["valueEur"], 2),
            "nationalContracts": nt["contracts"],
            "nationalSingleOfferPct": round(nt["singleOfferEur"] / nt["bidsKnownEur"] * 100.0, 1) if nt["bidsKnownEur"] > 0 else 0.0,
            "avgOblastScore": round(sum(x[2] for x in nt["scores"]) / max(len(nt["scores"]), 1), 1),
            "topOblasts": [{"name": x[0], "nuts3": x[1], "score": x[2], "eur": round(x[3], 2)} for x in top3],
        })

    out = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "methodology": "NAsvetlo 28×7 Национален секторен корупционен радар (206 907 договора ЦАИС ЕОП × НОИ ТЕЛК 2023–2025 × НСИ × ДНСК × МЕ Концесии × БАБХ × ИААА × ЗЗНН × СИГМА 2.0 / 571 лица × АДФИ/EPPO)",
        "matchedContracts": matched_contracts,
        "sectorsMeta": sectors_summary,
        "oblasts": oblasts_out,
    }
    return out


def main() -> int:
    data = build_oblast_sectors()
    OUT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] Written {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes) | Matched ZOP contracts: {data['matchedContracts']:,}")
    print("\nNATIONAL 7 SECTORS SUMMARY:")
    for s in data["sectorsMeta"]:
        top_str = ", ".join(f"{t['name']}({t['score']})" for t in s["topOblasts"])
        print(f"  - {s['short']:<18} | EUR {s['nationalValueEur']/1e9:>5.2f}B | {s['nationalContracts']:>7,} дог. | 1-of={s['nationalSingleOfferPct']:>4.1f}% | Top: {top_str}")
    print("\nTOP 10 HIGHEST OVERALL CORRUPTION RISK OBLASTS (ALL 7 SPHERES):")
    for i, o in enumerate(data["oblasts"][:10], 1):
        print(f"  #{i:02d} {o['name']:<16} [{o['nuts3']}] Overall={o['overallCorruptionIndex']:>2} ({o['overallTier']:<8}) | Hottest: {o['hottestSectorLabel']} ({o['hottestSectorScore']}) | DNSK_pend={o['openDataCounters']['dnskIllegalPending']:>3} | ME_conc={o['openDataCounters']['meConcessions']:>2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
