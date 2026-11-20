#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIGMA 3.0 FINALITY — Forensic Procurement Intelligence Compiler
Fuses live official open data from SIGMA 2.0 (https://sigma.midt.bg, CC-BY 4.0),
Bulgarian National Audit Office XML declarations (register.cacbg.bg, Art. 75 ZSP),
and Commercial Register deeds (portal.registryagency.bg) into deterministic,
reproducible forensic datasets:
  - docs/data/sigma3_macro.json      (Macro telemetry, 83-mo trends, 28-oblast risk atlas,
                                      Sankey flows, CPV sectors, Cartel Co-Bidding Engine,
                                      Benford's Law & Gini/Pareto forensics, Risk Matrix)
  - docs/data/authorities_index.json (All 4,344+ contracting authorities, columnar indexed)
  - docs/data/companies_index.json   (All 17,428+ contractors & DZZD consortia, columnar indexed)
  - docs/data/competition_stats.json (Refreshed competition/HHI/single-offer/direct-award)
"""

from __future__ import annotations

import csv
import json
import math
import re
import ssl
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
RAW_DIR = Path(r"C:\Users\papic\Desktop\LEGAL_AND_CIVIL_DOSSIERS\SIGMA_2_0_CORRUPTION_AUDIT\raw_api")
GEO_TS_PATH = REPO_ROOT / "scripts" / "bg_region_geometry.ts"

BASE_URL = "https://sigma.midt.bg"
HEADERS = {
    "User-Agent": "SIGMA-3.0-FINALITY-Forensic-Platform/3.0 (+https://paas.website)",
    "Accept": "application/json, text/plain, */*",
}
SSL_CTX = ssl.create_default_context()

LEGAL_SUFFIX_RE = re.compile(
    r"\b(еоод|оод|еад|ад|адсиц|ет|сд|кд|кда|дззд|нпо|кооперация|сдружение|фондация|консорциум|обединение|фирма|дружество)\b",
    flags=re.I,
)
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

CPV_FALLBACK_LABELS = {
    "03": "Селскостопански, рибовъдни и горски продукти",
    "09": "Нефтопродукти, горива, електричество и енергоизточници",
    "14": "Минни продукти, неблагородни метали",
    "15": "Храни, напитки, тютюн и свързани продукти",
    "16": "Селскостопански машини",
    "18": "Облекло, обувки и аксесоари",
    "19": "Кожа, текстил, пластмасови и каучукови изделия",
    "22": "Печатни материали и свързани продукти",
    "24": "Химически продукти",
    "30": "Офис и компютърно оборудване",
    "31": "Електрически машини, уреди и осветление",
    "32": "Радио-, телевизионно и комуникационно оборудване",
    "33": "Медицинско оборудване и фармацевтични продукти",
    "34": "Транспортно оборудване и превозни средства",
    "35": "Оборудване за сигурност, пожарогасене и отбрана",
    "37": "Музикални инструменти, спортни и игрални стоки",
    "38": "Лабораторно, оптично и прецизно оборудване",
    "39": "Мебели, обзавеждане и почистващи продукти",
    "42": "Промишлени машини",
    "43": "Машини за минното дело и строителството",
    "44": "Строителни конструкции и материали",
    "45": "Строителство и строително-монтажни работи",
    "48": "Софтуерни пакети и информационни системи",
    "50": "Услуги по ремонт и поддръжка",
    "51": "Услуги по инсталиране",
    "55": "Хотелиерски и ресторантьорски услуги",
    "60": "Транспортни услуги",
    "63": "Спомагателни транспортни и туристически услуги",
    "64": "Пощенски и телекомуникационни услуги",
    "65": "Комунални услуги (вода, газ, ток)",
    "66": "Финансови и застрахователни услуги",
    "70": "Услуги, свързани с недвижими имоти",
    "71": "Архитектурни, инженерни и строителен надзор",
    "72": "ИТ услуги: разработка на софтуер и поддръжка",
    "73": "Научноизследователска и развойна дейност",
    "75": "Услуги на държавната администрация и отбраната",
    "77": "Селскостопански, горски и градинарски услуги",
    "79": "Бизнес услуги: право, консултиране, охрана, маркетинг",
    "80": "Образование и обучение",
    "85": "Здравеопазване и социални услуги",
    "90": "Отпадъчни води, битови отпадъци и чистота",
    "92": "Култура, спорт и развлечения",
    "98": "Други обществени и лични услуги",
}


def decode_turbo_stream(raw_text: str) -> Any:
    arr = json.loads(raw_text)
    if not isinstance(arr, list):
        return arr

    memo: dict[int, Any] = {}
    visiting: set[int] = set()

    def resolve(idx: int) -> Any:
        if not isinstance(idx, int):
            return idx
        if idx < 0 or idx >= len(arr):
            return None
        if idx in memo:
            return memo[idx]
        if idx in visiting:
            return None
        val = arr[idx]
        if val is None or isinstance(val, (str, bool, int, float)):
            memo[idx] = val
            return val
        visiting.add(idx)
        try:
            if isinstance(val, dict):
                out: dict[str, Any] = {}
                for k, v in val.items():
                    if isinstance(k, str) and k.startswith("_") and k[1:].isdigit():
                        ki = int(k[1:])
                        rk = arr[ki] if 0 <= ki < len(arr) else k
                    else:
                        rk = k
                    out[str(rk)] = resolve(v) if isinstance(v, int) else v
                memo[idx] = out
                return out
            if isinstance(val, list):
                if len(val) == 2 and isinstance(val[0], str) and val[0] in ("D", "R", "B"):
                    res = resolve(val[1]) if isinstance(val[1], int) else val[1]
                    memo[idx] = res
                    return res
                out_l = [resolve(item) if isinstance(item, int) else item for item in val]
                memo[idx] = out_l
                return out_l
            memo[idx] = val
            return val
        finally:
            visiting.discard(idx)

    return resolve(0)


def unwrap(dec: dict[str, Any], key: str) -> dict[str, Any]:
    d = (dec.get(key) or {}).get("data") or {}
    if isinstance(d, dict) and isinstance(d.get("data"), dict):
        return d["data"]
    return d if isinstance(d, dict) else {}


def load_or_fetch(filename: str, endpoint: str) -> str:
    p = RAW_DIR / filename
    if p.exists() and p.stat().st_size > 100:
        return p.read_text(encoding="utf-8-sig")
    req = urllib.request.Request(f"{BASE_URL}/{endpoint}", headers=HEADERS)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as resp:
        txt = resp.read().decode("utf-8-sig")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(txt, encoding="utf-8")
    return txt


def norm_company_core(name: str) -> str:
    if not name:
        return ""
    s = name.lower()
    for ch in ('„', '“', '"', "'", '`', '«', '»', '–', '—'):
        s = s.replace(ch, " ")
    s = re.sub(r"[^а-яa-z0-9\-\s]", " ", s)
    s = LEGAL_SUFFIX_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s


def parse_svg_geometry() -> tuple[str, dict[str, dict[str, Any]]]:
    txt = GEO_TS_PATH.read_text(encoding="utf-8")
    vb_m = re.search(r"viewBox:\s*'([^']+)'", txt)
    view_box = vb_m.group(1) if vb_m else "0 0 1001 646"
    geo: dict[str, dict[str, Any]] = {}
    for m in re.finditer(r"nuts3:\s*'([^']+)',\s*d:\s*'([^']+)'", txt, flags=re.S):
        nuts3, d_path = m.group(1), m.group(2)
        coords = re.findall(r"(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)", d_path)
        xs = [float(c[0]) for c in coords]
        ys = [float(c[1]) for c in coords]
        if xs and ys:
            # Polygon centroid (shoelace) for accurate label placement
            area = 0.0
            cx = 0.0
            cy = 0.0
            n = len(xs)
            for i in range(n):
                j = (i + 1) % n
                cross = xs[i] * ys[j] - xs[j] * ys[i]
                area += cross
                cx += (xs[i] + xs[j]) * cross
                cy += (ys[i] + ys[j]) * cross
            if abs(area) > 1e-3:
                cx /= (3.0 * area)
                cy /= (3.0 * area)
            else:
                cx = sum(xs) / n
                cy = sum(ys) / n
        else:
            cx, cy = 500.0, 320.0
        geo[nuts3] = {"d": d_path, "cx": round(cx, 1), "cy": round(cy, 1)}
    return view_box, geo


def compute_benford(values: list[float]) -> dict[str, Any]:
    counts = [0] * 9
    total = 0
    for v in values:
        if v >= 10.0:
            s = f"{v:.6e}"
            d = int(s[0])
            if 1 <= d <= 9:
                counts[d - 1] += 1
                total += 1
    theo = [math.log10(1.0 + 1.0 / d) for d in range(1, 10)]
    if total == 0:
        return {"n": 0, "observed": [0.0] * 9, "theoretical": [round(t * 100, 2) for t in theo], "mad": 0.0, "chi2": 0.0, "conformity": "Няма данни"}
    obs = [c / total for c in counts]
    mad = sum(abs(obs[i] - theo[i]) for i in range(9)) / 9.0
    chi2 = sum(((counts[i] - total * theo[i]) ** 2) / (total * theo[i]) for i in range(9))
    if mad < 0.006:
        conf = "Тясно съответствие (Nigrini < 0.006)"
    elif mad < 0.012:
        conf = "Приемливо съответствие (Nigrini < 0.012)"
    elif mad < 0.015:
        conf = "Гранично отклонение (Nigrini 0.012–0.015)"
    else:
        conf = "Статистическо отклонение (Nigrini ≥ 0.015)"
    return {
        "n": total,
        "counts": counts,
        "observed": [round(o * 100, 2) for o in obs],
        "theoretical": [round(t * 100, 2) for t in theo],
        "mad": round(mad, 5),
        "chi2": round(chi2, 2),
        "conformity": conf,
    }


def compute_pareto_gini(values: list[float]) -> dict[str, Any]:
    pos = sorted([v for v in values if v > 0], reverse=True)
    n = len(pos)
    total = sum(pos)
    if n == 0 or total <= 0:
        return {"n": 0, "top1Pct": 0, "top5Pct": 0, "top10Pct": 0, "top20Pct": 0, "gini": 0}
    def top_share(frac: float) -> float:
        k = max(1, int(round(n * frac)))
        return round((sum(pos[:k]) / total) * 100, 2)
    # Gini coefficient on ascending sorted list
    asc = list(reversed(pos))
    cum = 0.0
    weighted_sum = 0.0
    for idx, val in enumerate(asc, start=1):
        cum += val
        weighted_sum += idx * val
    gini = (2.0 * weighted_sum) / (n * total) - (n + 1.0) / n
    # 10 decile Lorenz points (bottom 10%, 20%...100%)
    lorenz = []
    running = 0.0
    for d in range(1, 11):
        end = int(round((d / 10.0) * n))
        start = int(round(((d - 1) / 10.0) * n))
        running += sum(asc[start:end])
        lorenz.append(round((running / total) * 100, 2))
    return {
        "n": n,
        "totalEur": round(total, 2),
        "top1Pct": top_share(0.01),
        "top5Pct": top_share(0.05),
        "top10Pct": top_share(0.10),
        "top20Pct": top_share(0.20),
        "gini": round(gini, 4),
        "lorenzDeciles": lorenz,
    }


def main() -> int:
    print("[SIGMA 3.0 FINALITY] Loading live Ministry telemetry + forensic caches...")

    root_dec = decode_turbo_stream(load_or_fetch("_root.data", "_root.data"))
    root_meta = (root_dec.get("root") or {}).get("data") or {}
    home_data = unwrap(root_dec, "routes/home")

    trends_dec = decode_turbo_stream(load_or_fetch("trends.data", "trends.data"))
    trends_data = unwrap(trends_dec, "routes/trends")

    map_dec = decode_turbo_stream(load_or_fetch("map.data", "map.data"))
    map_data = unwrap(map_dec, "routes/map")

    flows_dec = decode_turbo_stream(load_or_fetch("flows_live.data", "flows.data"))
    flows_data = unwrap(flows_dec, "routes/flows")

    comp_dec = decode_turbo_stream(load_or_fetch("competition_live.data", "competition.data"))
    comp_data = unwrap(comp_dec, "routes/competition")

    officials_json = json.loads((DATA_DIR / "officials_all.json").read_text(encoding="utf-8"))
    officials = officials_json.get("officials") or []
    circles_json = json.loads((DATA_DIR / "circles_graph.json").read_text(encoding="utf-8"))
    deep_json = json.loads((DATA_DIR / "deep_links.json").read_text(encoding="utf-8"))

    # Build lookup maps from officials, shared companies, deep DZZD
    shared_eiks = {sc["eik"] for sc in (circles_json.get("sharedCompanies") or []) if sc.get("eik")}
    deep_by_slug = {lb["slug"]: lb for lb in (deep_json.get("hiddenConsortiumLeaderboard") or [])}
    eik_to_officials: dict[str, list[str]] = defaultdict(list)
    for o in officials:
        for c in (o.get("companies") or []):
            if c.get("eik"):
                eik_to_officials[c["eik"]].append(o["slug"])

    # Competition risk lookups by authority EIK/slug
    hhi_by_slug = {x["slug"]: float(x.get("hhi") or 0) for x in (comp_data.get("byConcentration") or []) if x.get("slug")}
    so_by_slug = {x["slug"]: float(x.get("singleOfferShare") or 0) for x in (comp_data.get("bySingleOffer") or []) if x.get("slug")}
    da_by_slug = {x["slug"]: float(x.get("nonCompetitiveShare") or 0) for x in (comp_data.get("byDirectAward") or []) if x.get("slug")}

    # 1. Load ALL 4,344+ Contracting Authorities & build official city -> oblast dictionary
    print("[1/6] Indexing ALL contracting authorities from authorities.csv...")
    auth_rows: list[dict[str, Any]] = []
    city_to_oblast: dict[str, str] = {}
    auth_by_oblast: dict[str, list[dict[str, Any]]] = defaultdict(list)

    auth_csv_path = RAW_DIR / "authorities.csv"
    with auth_csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            eik = (row.get("eik") or "").strip()
            name = (row.get("name") or "").strip()
            tgrp = (row.get("type_group") or "").strip()
            sett = (row.get("settlement") or "").strip()
            reg = (row.get("region") or "").strip()
            spent = round(float(row.get("spent_eur") or 0.0), 2)
            cnt = int(float(row.get("contracts") or 0))
            supp = int(float(row.get("suppliers") or 0))
            avg = round(float(row.get("avg_eur") or 0.0), 2)
            rec = {
                "eik": eik, "name": name, "type": tgrp,
                "settlement": sett, "region": reg,
                "spentEur": spent, "contracts": cnt, "suppliers": supp, "avgEur": avg,
                "hhi": round(hhi_by_slug.get(eik, 0.0), 3),
                "singleOffer": round(so_by_slug.get(eik, 0.0), 3),
                "directAward": round(da_by_slug.get(eik, 0.0), 3),
            }
            auth_rows.append(rec)
            if reg:
                auth_by_oblast[reg].append(rec)
                if sett:
                    clean_s = re.sub(r"^(?:гр\.?|с\.?|град|село)\s*", "", sett, flags=re.I).strip().lower()
                    if clean_s and clean_s not in city_to_oblast:
                        city_to_oblast[clean_s] = reg
                if tgrp == "община":
                    m_mun = re.search(r"община\s*[-–]?\s*([а-яa-z\-\s]+)", name.lower())
                    if m_mun:
                        mun_name = m_mun.group(1).strip()
                        if mun_name:
                            city_to_oblast[mun_name] = reg

    # Explicit overrides for exact 28 oblast capitals & key cities
    for r_obj in (map_data.get("regions") or []):
        rname = r_obj.get("name") or ""
        if rname:
            base = rname.replace(" (столица)", "").strip().lower()
            if rname == "София (столица)":
                city_to_oblast["софия"] = "София (столица)"
                city_to_oblast["столична"] = "София (столица)"
            else:
                city_to_oblast[base] = rname

    # Sort city keys longest-first for reliable substring matching
    sorted_cities = sorted(city_to_oblast.items(), key=lambda kv: len(kv[0]), reverse=True)

    def resolve_official_oblast(o: dict[str, Any]) -> str:
        # Check primary institution + all declared institutions
        texts = [o.get("primaryInstitution") or ""] + [
            i.get("institution") or "" for i in (o.get("institutions") or [])
        ]
        joined = " | ".join(texts).lower()
        if any(k in joined for k in ["народно събрание", "министерски съвет", "министерство на", "данс", "дато", "нзок", "нои", "нап", "митници", "столична община", "столичен общински", "сос", "агкк", "комисия за"]):
            if not any(f"областна администрация" in joined and c in joined for c, _ in sorted_cities if c != "софия"):
                return "София (столица)"
        for c_key, ob in sorted_cities:
            if len(c_key) >= 4 and re.search(r"(?<![а-яa-z])" + re.escape(c_key) + r"(?![а-яa-z])", joined):
                return ob
        # Fallback: check byAuthority names
        for a in (o.get("byAuthority") or [])[:3]:
            an = (a.get("name") or "").lower()
            for c_key, ob in sorted_cities:
                if len(c_key) >= 4 and re.search(r"(?<![а-яa-z])" + re.escape(c_key) + r"(?![а-яa-z])", an):
                    return ob
        return "София (столица)"

    # Map officials to oblasts & match to authority EIKs for authority risk enrichment
    oblast_officials: dict[str, list[dict[str, Any]]] = defaultdict(list)
    auth_linked_officials: dict[str, set[str]] = defaultdict(set)
    auth_own_hits: dict[str, int] = defaultdict(int)
    risk_enrichment: dict[str, dict[str, Any]] = {}

    for o in officials:
        ob = resolve_official_oblast(o)
        oblast_officials[ob].append(o)
        dc = deep_by_slug.get(o["slug"])
        dzzd_eur = float(dc["hiddenConsortiumEur"]) if dc else 0.0
        dzzd_cnt = int(dc["hiddenConsortiumCount"]) if dc else 0
        has_shared = any(c.get("eik") in shared_eiks for c in (o.get("companies") or []))

        # Transparent SIGMA 3.0 Composite Risk Index (0..100)
        pts_own = 35 if o.get("ownInstitution") else 0
        pts_period = 15 if o.get("periodEur", 0) >= 1_000_000 else (11 if o.get("periodEur", 0) >= 250_000 else (7 if o.get("periodEur", 0) >= 50_000 else (3 if o.get("periodEur", 0) > 0 else 0)))
        pts_dzzd = 20 if dzzd_eur >= 10_000_000 else (14 if dzzd_eur >= 1_000_000 else (8 if dzzd_eur > 0 else 0))
        pts_reg = 15 if (o.get("hasRegistryRole") or o.get("omissionsCount", 0) > 0) else 0
        pts_shared = 10 if has_shared else 0
        pts_fam = 5 if (o.get("hasFamilyStake") or (o.get("relatives") and len(o["relatives"]) > 0)) else 0
        score3 = min(100, pts_own + pts_period + pts_dzzd + pts_reg + pts_shared + pts_fam)

        risk_enrichment[o["slug"]] = {
            "score": score3,
            "oblast": ob,
            "dzzdEur": round(dzzd_eur, 2),
            "dzzdCnt": dzzd_cnt,
            "shared": has_shared,
            "breakdown": {
                "own": pts_own, "period": pts_period, "dzzd": pts_dzzd,
                "registry": pts_reg, "shared": pts_shared, "family": pts_fam,
            },
        }

        for a in (o.get("byAuthority") or []):
            aid = str(a.get("id") or "").strip()
            if aid:
                auth_linked_officials[aid].add(o["slug"])
                if o.get("ownInstitution"):
                    # Check if authority name matches official's primary institution city
                    p_core = re.sub(r"^община\s*/\s*обс\s*", "", (o.get("primaryInstitution") or "").lower()).strip()
                    if p_core and p_core in (a.get("name") or "").lower():
                        auth_own_hits[aid] += 1

    # Compute risk score per authority & finalize authorities_index.json
    auth_rows.sort(key=lambda r: r["spentEur"], reverse=True)
    auth_compact = []
    for r in auth_rows:
        lcnt = len(auth_linked_officials.get(r["eik"], set()))
        ohits = auth_own_hits.get(r["eik"], 0)
        # Concentration ratio proxy (avg contracts per supplier)
        conc_ratio = (r["contracts"] / r["suppliers"]) if r["suppliers"] > 0 else 0.0
        arisk = 0
        if ohits > 0:
            arisk += min(35, 25 + ohits * 5)
        if lcnt > 0:
            arisk += min(20, lcnt * 5)
        if r["hhi"] >= 0.7:
            arisk += 25
        elif r["hhi"] >= 0.4:
            arisk += 15
        if r["singleOffer"] >= 0.8:
            arisk += 20
        elif r["singleOffer"] >= 0.5:
            arisk += 10
        if r["directAward"] >= 0.8:
            arisk += 15
        if conc_ratio >= 8 and r["contracts"] >= 15:
            arisk += 10
        elif conc_ratio >= 4 and r["contracts"] >= 10:
            arisk += 5
        arisk = min(100, arisk)
        r["linkedCount"] = lcnt
        r["ownHits"] = ohits
        r["riskScore"] = arisk
        auth_compact.append([
            r["eik"], r["name"], r["type"], r["settlement"], r["region"],
            r["spentEur"], r["contracts"], r["suppliers"], r["avgEur"],
            r["hhi"], r["singleOffer"], r["directAward"], lcnt, ohits, arisk
        ])

    # 2. Load ALL 17,428+ Companies & DZZD Consortia + Run Consortium Co-Bidding Cartel Engine
    print("[2/6] Indexing ALL companies & running Consortium Co-Bidding Cartel Engine...")
    comp_rows: list[dict[str, Any]] = []
    by_core_best: dict[str, dict[str, Any]] = {}
    consortia_rows: list[dict[str, Any]] = []
    sector_agg: dict[str, dict[str, Any]] = defaultdict(lambda: {"wonEur": 0.0, "contracts": 0, "companies": 0, "consortia": 0, "consortiumEur": 0.0})

    comp_csv_path = RAW_DIR / "companies_live.csv"
    if not comp_csv_path.exists():
        comp_csv_path = RAW_DIR / "companies.csv"

    with comp_csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            eik = (row.get("eik") or "").strip()
            name = (row.get("name") or "").strip()
            kind = (row.get("kind") or "company").strip()
            sett = (row.get("settlement") or "").strip()
            won = round(float(row.get("won_eur") or 0.0), 2)
            cnt = int(float(row.get("contracts") or 0))
            auths = int(float(row.get("authorities") or 0))
            sec = (row.get("primary_sector") or "").strip()
            rec = {
                "eik": eik, "name": name, "kind": kind, "settlement": sett,
                "wonEur": won, "contracts": cnt, "authorities": auths, "sector": sec,
            }
            comp_rows.append(rec)
            if sec:
                sa = sector_agg[sec]
                sa["wonEur"] += won
                sa["contracts"] += cnt
                if kind == "consortium" or ";" in name:
                    sa["consortia"] += 1
                    sa["consortiumEur"] += won
                else:
                    sa["companies"] += 1

            if kind == "consortium" or ";" in name:
                consortia_rows.append(rec)
            elif eik and eik.isdigit() and len(eik) == 9:
                core = norm_company_core(name)
                if len(core) >= 5 and core not in GENERIC_CORES:
                    prev = by_core_best.get(core)
                    if not prev or won > prev["wonEur"]:
                        by_core_best[core] = rec

    # Consortium Co-Bidding Matrix & Shadow Hub Multiplier
    company_cons_stats: dict[str, dict[str, Any]] = {}
    pair_stats: dict[tuple[str, str], dict[str, Any]] = {}

    for con in consortia_rows:
        parts = [p.strip() for p in re.split(r"[;|]+", con["name"]) if p.strip()]
        resolved_members: list[dict[str, Any]] = []
        seen_eiks_in_con: set[str] = set()
        for p in parts:
            if not LEGAL_SUFFIX_RE.search(p):
                continue
            core = norm_company_core(p)
            if core in by_core_best:
                m_rec = by_core_best[core]
                if m_rec["eik"] not in seen_eiks_in_con:
                    seen_eiks_in_con.add(m_rec["eik"])
                    resolved_members.append(m_rec)

        for m in resolved_members:
            meik = m["eik"]
            st = company_cons_stats.get(meik)
            if not st:
                st = {
                    "eik": meik, "name": m["name"], "directEur": m["wonEur"],
                    "consortiumCount": 0, "consortiumEur": 0.0,
                    "politicianLinked": meik in eik_to_officials,
                    "linkedSlugs": eik_to_officials.get(meik, []),
                    "sampleConsortia": [],
                }
                company_cons_stats[meik] = st
            st["consortiumCount"] += 1
            st["consortiumEur"] = round(st["consortiumEur"] + con["wonEur"], 2)
            if len(st["sampleConsortia"]) < 4:
                st["sampleConsortia"].append({"name": con["name"][:130], "wonEur": con["wonEur"]})

        # Unordered co-bidding pairs (only when 2..12 members so giant noise doesn't dominate)
        if 2 <= len(resolved_members) <= 12:
            resolved_members.sort(key=lambda x: x["eik"])
            for i in range(len(resolved_members)):
                for j in range(i + 1, len(resolved_members)):
                    a, b = resolved_members[i], resolved_members[j]
                    pk = (a["eik"], b["eik"])
                    ps = pair_stats.get(pk)
                    if not ps:
                        ps = {
                            "eikA": a["eik"], "nameA": a["name"], "polA": a["eik"] in eik_to_officials,
                            "eikB": b["eik"], "nameB": b["name"], "polB": b["eik"] in eik_to_officials,
                            "jointCount": 0, "jointEur": 0.0, "jointContracts": 0,
                            "samples": [],
                        }
                        pair_stats[pk] = ps
                    ps["jointCount"] += 1
                    ps["jointEur"] = round(ps["jointEur"] + con["wonEur"], 2)
                    ps["jointContracts"] += con["contracts"]
                    if len(ps["samples"]) < 3:
                        ps["samples"].append({"name": con["name"][:120], "wonEur": con["wonEur"]})

    co_bidding_pairs = sorted(
        [p for p in pair_stats.values() if p["jointCount"] >= 2 and p["jointEur"] >= 500_000],
        key=lambda x: (x["jointCount"], x["jointEur"]),
        reverse=True,
    )[:60]

    consortium_hubs = sorted(
        [
            {
                **st,
                "shadowMultiplier": round((st["consortiumEur"] / st["directEur"]), 2) if st["directEur"] > 1000 else 99.0,
            }
            for st in company_cons_stats.values()
            if st["consortiumCount"] >= 2
        ],
        key=lambda x: (x["consortiumEur"], x["consortiumCount"]),
        reverse=True,
    )[:40]

    # Build compact companies_index.json
    comp_rows.sort(key=lambda r: r["wonEur"], reverse=True)
    comp_compact = []
    for r in comp_rows:
        cst = company_cons_stats.get(r["eik"])
        l_cnt = len(eik_to_officials.get(r["eik"], []))
        comp_compact.append([
            r["eik"], r["name"], 1 if (r["kind"] == "consortium" or ";" in r["name"]) else 0,
            r["settlement"], r["wonEur"], r["contracts"], r["authorities"], r["sector"],
            l_cnt, cst["consortiumCount"] if cst else 0, cst["consortiumEur"] if cst else 0.0
        ])

    # 3. Build 28-Oblast Fused Cartographic Risk Atlas
    print("[3/6] Fusing 28-Oblast Cartographic Risk Atlas (GISCO NUTS-3 + SIGMA + Officials + DZZD)...")
    view_box, geo_shapes = parse_svg_geometry()
    oblasts28 = []
    for reg_obj in (map_data.get("regions") or []):
        n3 = reg_obj.get("nuts3") or ""
        rname = reg_obj.get("name") or ""
        val_eur = round(float(reg_obj.get("valueEur") or 0.0), 2)
        contracts = int(reg_obj.get("contracts") or 0)
        auth_cnt = int(reg_obj.get("authorities") or 0)
        offs = oblast_officials.get(rname, [])
        own_hits = sum(1 for o in offs if o.get("ownInstitution"))
        off_period = round(sum(float(o.get("periodEur") or 0.0) for o in offs), 2)
        off_dzzd = round(sum(float(deep_by_slug.get(o["slug"], {}).get("hiddenConsortiumEur") or 0.0) for o in offs), 2)

        top_auths = sorted(auth_by_oblast.get(rname, []), key=lambda x: x["spentEur"], reverse=True)[:6]
        top_offs = sorted(offs, key=lambda x: (x.get("ownInstitution", False), x.get("periodEur", 0)), reverse=True)[:8]

        # Deterministic Oblast Forensic Risk Score (0..100)
        ob_risk = min(100, int(round(
            min(40, own_hits * 11) +
            min(25, len(offs) * 1.4) +
            (20 if off_period >= 10_000_000 else (12 if off_period >= 2_000_000 else (6 if off_period >= 200_000 else 0))) +
            (15 if off_dzzd >= 10_000_000 else (8 if off_dzzd > 0 else 0))
        )))

        g = geo_shapes.get(n3, {"d": "", "cx": 500, "cy": 320})
        oblasts28.append({
            "nuts3": n3,
            "name": rname,
            "nuts2": reg_obj.get("nuts2") or "",
            "nuts2Name": reg_obj.get("nuts2Name") or "",
            "d": g["d"],
            "cx": g["cx"],
            "cy": g["cy"],
            "valueEur": val_eur,
            "contracts": contracts,
            "authorities": auth_cnt,
            "avgPerAuthority": round(val_eur / max(1, auth_cnt), 2),
            "officialCount": len(offs),
            "ownHits": own_hits,
            "officialPeriodEur": off_period,
            "hiddenDzzdEur": off_dzzd,
            "riskScore": ob_risk,
            "topAuthorities": [
                {"eik": a["eik"], "name": a["name"], "type": a["type"], "spentEur": a["spentEur"], "contracts": a["contracts"]}
                for a in top_auths
            ],
            "topOfficials": [
                {
                    "slug": o["slug"], "name": o["name"], "inst": o["primaryInstitution"],
                    "periodEur": o["periodEur"], "totalEur": o["totalEur"], "own": o["ownInstitution"],
                }
                for o in top_offs
            ],
        })
    oblasts28.sort(key=lambda x: x["valueEur"], reverse=True)

    # 4. CPV Sector Breakdown
    print("[4/6] Computing CPV Sector Intelligence & Benford/Pareto Forensics...")
    cpv_labels = dict(CPV_FALLBACK_LABELS)
    for sec_obj in (trends_data.get("sectors") or []):
        if sec_obj.get("code") and sec_obj.get("label"):
            cpv_labels[str(sec_obj["code"])] = sec_obj["label"]

    sectors_out = []
    for code, sa in sector_agg.items():
        if sa["wonEur"] < 1_000_000:
            continue
        sectors_out.append({
            "code": code,
            "label": cpv_labels.get(code, f"CPV сектор {code}"),
            "wonEur": round(sa["wonEur"], 2),
            "contracts": sa["contracts"],
            "companies": sa["companies"],
            "consortia": sa["consortia"],
            "consortiumEur": round(sa["consortiumEur"], 2),
            "consortiumShare": round((sa["consortiumEur"] / sa["wonEur"]) * 100, 1) if sa["wonEur"] > 0 else 0.0,
        })
    sectors_out.sort(key=lambda x: x["wonEur"], reverse=True)

    # Benford's Law & Pareto / Gini Forensics
    benford_auth = compute_benford([r["spentEur"] for r in auth_rows])
    benford_comp = compute_benford([r["wonEur"] for r in comp_rows])
    pareto_auth = compute_pareto_gini([r["spentEur"] for r in auth_rows])
    pareto_comp = compute_pareto_gini([r["wonEur"] for r in comp_rows])

    # 5. Clean Trends (chronological), Sankey & Single-Offer Live Contracts
    print("[5/6] Compiling 83-month trends, Sankey flows & live contract feed...")
    years_clean = sorted(
        [
            {
                "year": str(y.get("year") or ""),
                "valueEur": round(float(y.get("valueEur") or 0.0), 2),
                "contracts": int(y.get("contracts") or 0),
                "yoyPct": round(float(y["yoyPct"]) * 100, 1) if y.get("yoyPct") is not None else None,
                "partial": bool(y.get("partial")),
            }
            for y in (trends_data.get("years") or [])
            if y.get("year")
        ],
        key=lambda x: x["year"],
    )
    months_clean = sorted(
        [
            {
                "period": str(pt.get("period") or ""),
                "valueEur": round(float(pt.get("valueEur") or 0.0), 2),
                "contracts": int(pt.get("contracts") or 0),
                "partial": bool(pt.get("partial")),
            }
            for pt in (trends_data.get("points") or [])
            if pt.get("period")
        ],
        key=lambda x: x["period"],
    )

    sankey_raw = flows_data.get("sankey") or {}
    sankey_clean = {
        "viewBox": sankey_raw.get("viewBox") or "-150 -6 990 614",
        "nodes": [
            {
                "label": n.get("label") or "",
                "name": n.get("name") or "",
                "valueEur": round(float(n.get("valueEur") or 0.0), 2),
                "side": n.get("side") or "",
                "x": n.get("x"), "y": n.get("y"), "width": n.get("width"), "height": n.get("height"),
                "labelY": n.get("labelY"), "href": n.get("href") or "",
            }
            for n in (sankey_raw.get("nodes") or [])
        ],
        "ribbons": [
            {
                "d": rb.get("d") or "",
                "title": rb.get("title") or "",
                "fromName": rb.get("fromName") or "",
                "toName": rb.get("toName") or "",
                "valueEur": round(float(rb.get("valueEur") or 0.0), 2),
                "contracts": int(rb.get("contracts") or 0),
            }
            for rb in (sankey_raw.get("ribbons") or [])
        ],
        "pairs": flows_data.get("pairs") or [],
    }

    def clean_contract_card(c: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(c.get("id") or ""),
            "subject": str(c.get("subject") or ""),
            "unp": str(c.get("unp") or ""),
            "sectorCode": str(c.get("sectorCode") or ""),
            "euFunded": bool(c.get("euFunded")),
            "isConsortium": bool(c.get("isConsortium")),
            "authoritySlug": str(c.get("authoritySlug") or ""),
            "authorityName": str(c.get("authorityName") or ""),
            "bidderSlug": str(c.get("bidderSlug") or ""),
            "bidderName": str(c.get("bidderDisplayName") or c.get("bidderName") or ""),
            "procedureLabel": str(c.get("procedureLabel") or ""),
            "signedAt": str(c.get("signedAt") or ""),
            "bidsReceived": int(c.get("bidsReceived") or 1),
            "valueEur": round(float(c.get("valueEur") or 0.0), 2),
        }

    # Risk tier summary for all 571 officials
    risk_tiers = {"critical": 0, "high": 0, "elevated": 0, "baseline": 0}
    for rv in risk_enrichment.values():
        sc = rv["score"]
        if sc >= 70:
            risk_tiers["critical"] += 1
        elif sc >= 45:
            risk_tiers["high"] += 1
        elif sc >= 20:
            risk_tiers["elevated"] += 1
        else:
            risk_tiers["baseline"] += 1

    so_home = home_data.get("singleOffer") or {}
    totals_home = home_data.get("totals") or {}

    macro_out = {
        "meta": {
            "platform": "СИГМА 3.0 FINALITY",
            "domain": "paas.website",
            "asOf": root_meta.get("asOf") or "2026-11-19",
            "refreshedAt": root_meta.get("refreshedAt") or "2026-11-20 12:01:38",
            "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totals": {
                "contracts": int(totals_home.get("contracts") or 206907),
                "valueEur": round(float(totals_home.get("valueEur") or 53224934606.37), 2),
                "authorities": int(totals_home.get("authorities") or len(auth_rows)),
                "bidders": int(totals_home.get("bidders") or len(comp_rows)),
                "suspect": int(totals_home.get("suspect") or 33),
            },
            "singleOffer": {
                "contracts": int(so_home.get("contracts") or 83993),
                "valueEur": round(float(so_home.get("valueEur") or 18497743535.16), 2),
                "baseContracts": int(so_home.get("baseContracts") or 184993),
                "baseValueEur": round(float(so_home.get("baseValueEur") or 45493531979.93), 2),
                "share": round(float(so_home.get("contracts") or 83993) / max(1, float(so_home.get("baseContracts") or 184993)) * 100, 1),
                "valueShare": round(float(so_home.get("valueEur") or 18497743535.16) / max(1, float(so_home.get("baseValueEur") or 45493531979.93)) * 100, 1),
            },
            "procedure": comp_data.get("procedure") or {},
            "riskTiers": risk_tiers,
        },
        "trends": {
            "years": years_clean,
            "months": months_clean,
            "peakMonth": max(months_clean, key=lambda m: m["valueEur"]) if months_clean else None,
        },
        "sectors": sectors_out[:18],
        "sankey": sankey_clean,
        "topLists": {
            "topSingleOffer": [clean_contract_card(c) for c in (home_data.get("topSingleOffer") or [])],
            "recentSingleOffer": [clean_contract_card(c) for c in (home_data.get("recentSingleOffer") or [])],
            "topMinistries": home_data.get("topMinistries") or [],
            "topMunicipalities": home_data.get("topMunicipalities") or [],
            "topCompanies": home_data.get("topCompanies") or [],
        },
        "mapGeo": {
            "viewBox": view_box,
            "attribution": "GISCO NUTS 2021 © EuroGeographics · СИГМА / ЦАИС ЕОП (CC-BY 4.0)",
            "oblasts": oblasts28,
            "macroRegions": map_data.get("macroRegions") or [],
        },
        "cartelEngine": {
            "totalConsortiaAnalyzed": len(consortia_rows),
            "totalConsortiaEur": round(sum(c["wonEur"] for c in consortia_rows), 2),
            "uniqueCompaniesInConsortia": len(company_cons_stats),
            "coBiddingPairsCount": len(co_bidding_pairs),
            "coBiddingPairs": co_bidding_pairs,
            "consortiumHubs": consortium_hubs,
        },
        "benford": {
            "authorities": benford_auth,
            "companies": benford_comp,
            "paretoAuthorities": pareto_auth,
            "paretoCompanies": pareto_comp,
        },
        "riskEnrichment": risk_enrichment,
    }

    # 6. Write outputs cleanly
    print("[6/6] Writing SIGMA 3.0 FINALITY compiled datasets to docs/data/...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    (DATA_DIR / "sigma3_macro.json").write_text(
        json.dumps(macro_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (DATA_DIR / "authorities_index.json").write_text(
        json.dumps(
            {
                "asOf": macro_out["meta"]["asOf"],
                "fields": ["eik", "name", "type", "settlement", "region", "spentEur", "contracts", "suppliers", "avgEur", "hhi", "singleOffer", "directAward", "linkedCount", "ownHits", "riskScore"],
                "rows": auth_compact,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    (DATA_DIR / "companies_index.json").write_text(
        json.dumps(
            {
                "asOf": macro_out["meta"]["asOf"],
                "fields": ["eik", "name", "isConsortium", "settlement", "wonEur", "contracts", "authorities", "sector", "linkedOfficials", "consortiumCount", "consortiumEur"],
                "rows": comp_compact,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # Refresh competition_stats.json with latest live values
    existing_comp = json.loads((DATA_DIR / "competition_stats.json").read_text(encoding="utf-8"))
    existing_comp["asOf"] = macro_out["meta"]["asOf"]
    existing_comp["totals"] = comp_data.get("totals") or existing_comp.get("totals")
    existing_comp["procedure"] = comp_data.get("procedure") or existing_comp.get("procedure")
    existing_comp["topPairs"] = comp_data.get("topPairs") or existing_comp.get("topPairs")
    existing_comp["byConcentration"] = comp_data.get("byConcentration") or existing_comp.get("byConcentration")
    existing_comp["bySingleOffer"] = comp_data.get("bySingleOffer") or existing_comp.get("bySingleOffer")
    existing_comp["byDirectAward"] = comp_data.get("byDirectAward") or existing_comp.get("byDirectAward")
    (DATA_DIR / "competition_stats.json").write_text(
        json.dumps(existing_comp, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print("SUCCESS! SIGMA 3.0 FINALITY forensic datasets built:")
    print(f"  - Authorities indexed: {len(auth_compact):,}")
    print(f"  - Companies & Consortia indexed: {len(comp_compact):,} ({len(consortia_rows):,} consortia)")
    print(f"  - Co-bidding cartel pairs detected: {len(co_bidding_pairs)} | Super-hubs: {len(consortium_hubs)}")
    print(f"  - Oblasts fused: {len(oblasts28)} | Officials mapped: {sum(o['officialCount'] for o in oblasts28)}")
    print(f"  - Benford Auth MAD: {benford_auth['mad']} | Comp MAD: {benford_comp['mad']}")
    print(f"  - Pareto Top 1% Contractors share: {pareto_comp['top1Pct']}% (Gini {pareto_comp['gini']})")
    print(f"  - Risk tiers (571): {risk_tiers}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
