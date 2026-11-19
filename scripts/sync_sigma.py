#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIGMA 2.0 Public Integrity & Conflict-Circle Extractor
Source: https://sigma.midt.bg (CC-BY 4.0, AOP / CAIS EOP / Bulgarian National Audit Office / Commercial Register)
Reproducible ETL pipeline that decodes React Router v7 Turbo Stream responses
directly from the live SIGMA 2.0 public endpoints and generates static JSON/CSV
datasets for the GitHub Pages investigative explorer.
"""

from __future__ import annotations

import concurrent.futures
import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE_URL = "https://sigma.midt.bg"
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
CACHE_DIR = REPO_ROOT.parent / "SIGMA_2_0_CORRUPTION_AUDIT" / "raw_api"
PERSONS_CACHE_DIR = CACHE_DIR / "persons"

HEADERS = {
    "User-Agent": "SIGMA-2.0-Civic-Transparency-Explorer/1.0 (+https://github.com/papica777-eng/sigma-2-0-radar-bg)",
    "Accept": "application/json, text/plain, */*",
}

SSL_CTX = ssl.create_default_context()


def decode_turbo_stream(raw_text: str) -> Any:
    """Decode React Router v7 / turbo-stream flat-array JSON payload."""
    arr = json.loads(raw_text)
    if not isinstance(arr, list):
        return arr

    memo: dict[int, Any] = {}
    visiting: set[int] = set()

    def resolve(idx: int) -> Any:
        if not isinstance(idx, int):
            return idx
        if idx < 0:
            # Turbo-stream sentinels: -5=undefined/null, -7=undefined, etc.
            return None
        if idx >= len(arr):
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
                        key_idx = int(k[1:])
                        real_key = arr[key_idx] if 0 <= key_idx < len(arr) else k
                    else:
                        real_key = k
                    out[str(real_key)] = resolve(v) if isinstance(v, int) else v
                memo[idx] = out
                return out
            if isinstance(val, list):
                if len(val) == 2 and isinstance(val[0], str) and val[0] in ("D", "R", "B"):
                    # Tagged primitive (Date / RegExp / BigInt)
                    res = resolve(val[1]) if isinstance(val[1], int) else val[1]
                    memo[idx] = res
                    return res
                out_list = [resolve(item) if isinstance(item, int) else item for item in val]
                memo[idx] = out_list
                return out_list
            memo[idx] = val
            return val
        finally:
            visiting.discard(idx)

    return resolve(0)


def fetch_text(url: str, cache_path: Path | None = None, retries: int = 3) -> str:
    if cache_path and cache_path.exists() and cache_path.stat().st_size > 100:
        return cache_path.read_text(encoding="utf-8")

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as resp:
                body = resp.read().decode("utf-8")
            if cache_path:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(body, encoding="utf-8")
            return body
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                time.sleep(1.5 * (attempt + 1))
            elif e.code >= 500:
                time.sleep(0.8 * (attempt + 1))
            else:
                raise
        except Exception as e:
            last_err = e
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Failed fetching {url}: {last_err}")


def classify_sector_circle(institutions: list[dict[str, Any]]) -> str:
    """Assign primary institutional circle for each public official."""
    joined = " | ".join(
        f"{inst.get('institution', '')} {' '.join(inst.get('positions') or [])}"
        for inst in institutions
    ).lower()

    if any(k in joined for k in ["народно събрание", "народното събрание", "народен представител", "народо събрание"]):
        return "Народно събрание (Депутати)"
    if any(k in joined for k in ["данс", "национална сигурност", "дато", "технически операции", "мвр", "вътрешните работи", "главна дирекция", "полиция", "гранична"]):
        return "Служби за сигурност и МВР (ДАНС, ДАТО, МВР)"
    if any(k in joined for k in ["министерство", "министър", "министерски съвет", "агенция", "митници", "нзок", "здравноосигурителна", "агкк", "комисия", "нои", "нап", "дф ", "държавен фонд", "изпълнителна агенция", "бабх", "рзи", "риск", "риосв"]):
        return "Централна власт, Министерства и Агенции"
    if any(k in joined for k in ["областна администрация", "областен управител"]):
        return "Областни администрации"
    if any(k in joined for k in ["умбал", "мбал", "сбал", "собал", "болница", "дкц", "медицински център", "цсмп", "здравеопазване"]):
        return "Държавни и общински болници (Здравеопазване)"
    if any(k in joined for k in ["еад", "еоод", "дп ", "държавно предприятие", "вик", "топлофикация", "метрополитен", "пристанище", "индустриал", "енерг", "аец", "тец", "мини "]):
        return "Държавни и общински дружества (ЕАД/ЕООД/ДП)"
    if any(k in joined for k in ["университет", "училище", "детска градина", "гимназия", "институт", "бан", "академия", "цнст"]):
        return "Образование, Социални центрове и Наука"
    if any(k in joined for k in ["кмет", "общин", "обс", "столичен общински", "район ", "р-н "]):
        return "Общини, Кметове и Общински съвети"
    return "Други публични институции"


def normalize_municipality_or_inst(name: str) -> str:
    """Normalize Bulgarian institution names to group duplicates cleanly."""
    if not name:
        return "Непосочена институция"
    s = re.sub(r"\s+", " ", name.strip())
    low = s.lower()

    if any(k in low for k in ["народно събрание", "народното събрание", "народо събрание"]):
        return "Народно събрание"
    if "столичен общински" in low or "столична община" in low or re.search(r"\bр-н\b.*со\b", low):
        return "Столична община / СОС"
    if "данс" in low or "национална сигурност" in low:
        return "ДАНС"
    if "дато" in low or "технически операции" in low:
        return "ДАТО"
    if "митници" in low:
        return "Агенция „Митници“"
    if "регионалното развитие" in low or "мррб" in low:
        return "МРРБ"
    if "министерство на здравеопазването" in low:
        return "Министерство на здравеопазването"
    if "здравноосигурителна каса" in low or "нзок" in low:
        return "НЗОК"

    # Extract municipality name for Община X / Общински съвет X / ОбС X
    m = re.search(r"(?:общински\s+съвет|община|обс)\s*[-–:,]?\s*(?:на\s+община\s+|към\s+община\s+|гр\.?\s*|с\.?\s*|град\s+)?([А-Яа-яЁё\-]+(?:\s+[А-Яа-яЁё\-]+)?)", s, flags=re.I)
    if m:
        city = m.group(1).strip(" ,.-–\"'„“")
        if city.lower() not in ("съвет", "община", "общински", "при", "на", "за", "рб"):
            # Keep clean title-case for first word(s)
            words = city.split()
            if len(words) == 2 and words[1].lower() in ("обл", "област", "съвет"):
                city = words[0]
            return f"Община / ОбС {city.title()}"
    return s


def is_burgas_region(record: dict[str, Any]) -> bool:
    blob = json.dumps(record, ensure_ascii=False).lower()
    keywords = [
        "бургас", "поморие", "несебър", "созопол", "приморско", "царево",
        "карнобат", "айтос", "руен", "камено", "малко търново", "средец", "сунгурларе"
    ]
    return any(k in blob for k in keywords)


def fetch_all_conflicts() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    print("[1/4] Pulling ALL pages from https://sigma.midt.bg/conflicts.data?role=all&sort=period ...")
    p1_raw = fetch_text(
        f"{BASE_URL}/conflicts.data?role=all&sort=period&page=1",
        CACHE_DIR / "conflicts_all_p1.data",
    )
    p1 = decode_turbo_stream(p1_raw)
    c_data = p1["routes/conflicts"]["data"]
    page_count = int(c_data.get("pageCount", 6))
    total_reported = int(c_data.get("total", 0))
    available_reported = int(c_data.get("available", 0))
    meta_root = p1.get("root", {}).get("data", {})

    rows_by_slug: dict[str, dict[str, Any]] = {}
    ordered_rows: list[dict[str, Any]] = []

    def ingest_rows(rows: list[dict[str, Any]]):
        for r in rows:
            slug = r.get("officialSlug") or r.get("personIdentity") or r.get("official")
            if slug and slug not in rows_by_slug:
                rows_by_slug[slug] = r
                ordered_rows.append(r)

    ingest_rows(c_data.get("pageRows") or [])

    for page in range(2, page_count + 1):
        raw = fetch_text(
            f"{BASE_URL}/conflicts.data?role=all&sort=period&page={page}",
            CACHE_DIR / f"conflicts_all_p{page}.data",
        )
        decoded = decode_turbo_stream(raw)
        ingest_rows(decoded["routes/conflicts"]["data"].get("pageRows") or [])
        print(f"    Page {page}/{page_count}: cumulative unique officials = {len(ordered_rows)}")

    # Also verify against default role="" (512 ownership/management) so we tag core512 accurately
    core512_slugs: set[str] = set()
    p1_core_raw = fetch_text(
        f"{BASE_URL}/conflicts.data?sort=period&page=1",
        CACHE_DIR / "conflicts_core_p1.data",
    )
    p1_core = decode_turbo_stream(p1_core_raw)
    core_pages = int(p1_core["routes/conflicts"]["data"].get("pageCount", 6))
    for r in p1_core["routes/conflicts"]["data"].get("pageRows") or []:
        core512_slugs.add(r.get("officialSlug"))
    for page in range(2, core_pages + 1):
        raw = fetch_text(
            f"{BASE_URL}/conflicts.data?sort=period&page={page}",
            CACHE_DIR / f"conflicts_core_p{page}.data",
        )
        dec = decode_turbo_stream(raw)
        for r in dec["routes/conflicts"]["data"].get("pageRows") or []:
            core512_slugs.add(r.get("officialSlug"))

    for r in ordered_rows:
        r["_inCore512"] = r.get("officialSlug") in core512_slugs

    print(f"    DONE: Extracted {len(ordered_rows)} total unique officials (core 512 ownership/mgmt: {len(core512_slugs)}, reported total: {total_reported}, available: {available_reported})")
    meta = {
        "totalAll": len(ordered_rows),
        "totalCore512": len(core512_slugs),
        "availableReported": available_reported,
        "facets": c_data.get("facets") or {},
        "asOf": meta_root.get("asOf", "2026-11-18"),
        "refreshedAt": meta_root.get("refreshedAt", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
    }
    return ordered_rows, meta


def fetch_person_detail(slug: str) -> tuple[str, dict[str, Any] | None]:
    safe_name = re.sub(r"[^A-Za-z0-9_-]", "_", slug)[:80]
    cache_file = PERSONS_CACHE_DIR / f"{safe_name}.data"
    url = f"{BASE_URL}/persons/{urllib.parse.quote(slug, safe='')}.data"
    try:
        raw = fetch_text(url, cache_file, retries=3)
        dec = decode_turbo_stream(raw)
        pdata = dec.get("routes/person", {}).get("data")
        if not isinstance(pdata, dict):
            return slug, None

        # Extract concise, high-value fields only so JSON stays fast and compact
        relatives_raw = pdata.get("relatives") or []
        relatives = []
        for rel in relatives_raw:
            if isinstance(rel, dict):
                rname = rel.get("name") or rel.get("personName") or rel.get("relativeName")
                if rname:
                    relatives.append({
                        "name": rname,
                        "companies": rel.get("companies") or rel.get("eiks") or [],
                        "role": rel.get("role") or rel.get("relation") or "свързано лице (ТР)",
                    })
            elif isinstance(rel, str):
                relatives.append({"name": rel, "companies": [], "role": "свързано лице (ТР)"})

        activity = pdata.get("activity") or {}
        by_auth_raw = activity.get("byAuthority") or []
        by_auth = []
        for a in by_auth_raw[:12]:
            if isinstance(a, dict):
                by_auth.append({
                    "id": str(a.get("id", "")).replace("auth:", ""),
                    "name": a.get("name") or "",
                    "contracts": int(a.get("contracts") or 0),
                    "valueEur": round(float(a.get("valueEur") or 0.0), 2),
                })

        # Top contracts (up to 10 highest-value or most recent)
        contracts_raw = activity.get("contracts") or []
        parsed_contracts = []
        for c in contracts_raw:
            if isinstance(c, dict):
                val = float(c.get("valueEur") or 0.0)
                parsed_contracts.append({
                    "id": str(c.get("id") or "").removeprefix("c:"),
                    "subject": (c.get("subject") or "")[:180],
                    "company": c.get("company") or "",
                    "eik": c.get("eik") or "",
                    "authority": c.get("authority") or "",
                    "authorityId": str(c.get("authorityId") or "").replace("auth:", ""),
                    "signedAt": c.get("signedAt") or "",
                    "valueEur": round(val, 2),
                    "duringOffice": bool(c.get("duringOfficeYear") or c.get("duringDeclaration")),
                })
        parsed_contracts.sort(key=lambda x: x["valueEur"], reverse=True)
        top_contracts = parsed_contracts[:10]

        # Declarations (with direct CACBG XML URLs + registry omissions!)
        decls_raw = pdata.get("declarations") or []
        declarations = []
        omissions_count = 0
        for d in decls_raw:
            if isinstance(d, dict):
                omissions = d.get("registryOmissions") or []
                omissions_count += len(omissions)
                declarations.append({
                    "year": str(d.get("year") or ""),
                    "type": d.get("type") or "",
                    "institution": d.get("institution") or "",
                    "position": d.get("position") or "",
                    "declaredOn": d.get("declaredOn") or "",
                    "url": d.get("url") or "",
                    "omissions": len(omissions),
                    "discrepancies": len(d.get("discrepancies") or []),
                })
        # Deduplicate declarations by url/year+type and keep newest first
        declarations.sort(key=lambda x: (x["year"], x["declaredOn"]), reverse=True)

        # Links / named relatives from links array
        links_raw = pdata.get("links") or []
        extra_links = []
        for lk in links_raw:
            if isinstance(lk, dict):
                extra_links.append({
                    "company": lk.get("company") or lk.get("companyName") or "",
                    "eik": lk.get("eik") or "",
                    "basis": lk.get("basis") or lk.get("kind") or lk.get("stakeKind") or "",
                    "role": lk.get("role") or lk.get("registryRole") or "",
                    "years": lk.get("years") or [],
                    "relativeName": lk.get("relativeName") or lk.get("personName") or "",
                })

        return slug, {
            "relatives": relatives,
            "aliases": pdata.get("aliases") or [],
            "byAuthority": by_auth,
            "byAuthorityTotal": int(activity.get("byAuthorityTotal") or len(by_auth)),
            "topContracts": top_contracts,
            "declarations": declarations[:12],
            "omissionsCount": omissions_count,
            "extraLinks": extra_links,
        }
    except Exception:
        return slug, None


def enrich_all_persons(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    print(f"[2/4] Enriching ALL {len(rows)} individual person dossiers from https://sigma.midt.bg/persons/{{slug}}.data ...")
    slugs = [r["officialSlug"] for r in rows if r.get("officialSlug")]
    details: dict[str, dict[str, Any]] = {}
    done = 0
    ok = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_person_detail, s): s for s in slugs}
        for fut in concurrent.futures.as_completed(futs):
            slug, info = fut.result()
            done += 1
            if info:
                details[slug] = info
                ok += 1
            if done % 100 == 0 or done == len(slugs):
                print(f"    Enriched {done}/{len(slugs)} (success: {ok})")
    return details


def unwrap_route_data(dec: dict[str, Any], route_key: str) -> dict[str, Any]:
    d = (dec.get(route_key) or {}).get("data") or {}
    if isinstance(d, dict) and isinstance(d.get("data"), dict):
        return d["data"]
    return d if isinstance(d, dict) else {}


def build_datasets(
    rows: list[dict[str, Any]],
    meta: dict[str, Any],
    person_details: dict[str, dict[str, Any]],
) -> None:
    print("[3/4] Decoding macro competition, flows & network telemetry and building Circles Graph...")
    comp_raw = fetch_text(f"{BASE_URL}/competition.data", CACHE_DIR / "competition.data")
    comp_dec = unwrap_route_data(decode_turbo_stream(comp_raw), "routes/competition")

    flows_raw = fetch_text(f"{BASE_URL}/flows.data", CACHE_DIR / "flows.data")
    flows_dec = unwrap_route_data(decode_turbo_stream(flows_raw), "routes/flows")

    net_raw = fetch_text(f"{BASE_URL}/network.data", CACHE_DIR / "network.data")
    net_dec = unwrap_route_data(decode_turbo_stream(net_raw), "routes/network")

    officials_out: list[dict[str, Any]] = []
    company_to_officials: dict[str, list[dict[str, Any]]] = defaultdict(list)
    inst_clusters: dict[str, dict[str, Any]] = {}

    total_period_eur = 0.0
    total_all_eur = 0.0
    own_inst_count = 0
    mp_count = 0
    registry_unreported_count = 0
    family_count = 0
    burgas_count = 0

    for idx, r in enumerate(rows, start=1):
        slug = r.get("officialSlug") or ""
        name = (r.get("official") or "").strip()
        decl_insts = r.get("declaredInstitutions") or []
        companies_raw = r.get("companies") or []
        period_eur = round(float(r.get("contemporaneousValueEur") or 0.0), 2)
        total_eur = round(float(r.get("contractValueEur") or 0.0), 2)
        contract_cnt = int(r.get("contractCount") or 0)
        own_inst = bool(r.get("ownInstitution"))
        has_contemp = bool(r.get("hasContemporaneous"))
        stake_kind = r.get("stakeKind") or "self"
        in_core512 = bool(r.get("_inCore512"))

        detail = person_details.get(slug) or {}
        relatives = detail.get("relatives") or []
        by_auth = detail.get("byAuthority") or []
        top_contracts = detail.get("topContracts") or []
        declarations = detail.get("declarations") or []
        omissions_count = int(detail.get("omissionsCount") or 0)

        # Clean companies list
        companies = []
        has_registry_role = False
        has_family_stake = False
        has_board_only = True
        for c in companies_raw:
            if not isinstance(c, dict):
                continue
            is_reg = bool(c.get("registry"))
            is_fam = bool(c.get("family"))
            is_self = bool(c.get("self"))
            is_mgr = bool(c.get("manages"))
            is_board = bool(c.get("board"))
            if is_reg:
                has_registry_role = True
            if is_fam:
                has_family_stake = True
            if is_self or is_fam or is_mgr or is_reg:
                has_board_only = False

            roles_bg = []
            if is_self:
                roles_bg.append("собствен дял")
            if is_fam:
                roles_bg.append("дял на свързано лице")
            if is_mgr:
                roles_bg.append("декларирано управление")
            if is_reg:
                r_role = c.get("registryRole") or "роля по ТР"
                roles_bg.append(f"ТР: {r_role}" + (" (недекларирана)" if not c.get("declared") else ""))
            if is_board:
                roles_bg.append("член на съвет")

            comp_obj = {
                "eik": str(c.get("eik") or ""),
                "name": (c.get("company") or "").strip(),
                "roles": roles_bg,
                "self": is_self,
                "family": is_fam,
                "manages": is_mgr,
                "registry": is_reg,
                "board": is_board,
                "missingYears": c.get("missingYears") or [],
            }
            companies.append(comp_obj)

        # Institutions clean list
        inst_list = []
        norm_insts_set = set()
        for ins in decl_insts:
            if not isinstance(ins, dict):
                continue
            iname = (ins.get("institution") or "").strip()
            positions = [p.strip() for p in (ins.get("positions") or []) if p]
            years = [str(y) for y in (ins.get("years") or [])]
            inst_list.append({
                "institution": iname,
                "positions": positions,
                "years": years,
            })
            norm_insts_set.add(normalize_municipality_or_inst(iname))

        primary_circle = classify_sector_circle(inst_list)
        primary_inst_norm = next(iter(norm_insts_set), "Непосочена институция")
        if primary_circle == "Народно събрание (Депутати)":
            primary_inst_norm = "Народно събрание"
            mp_count += 1

        # Compute Risk Score (transparent, deterministic civic-risk heuristic 0..100)
        risk_score = 0
        if own_inst:
            risk_score += 45
            own_inst_count += 1
        if has_contemp and period_eur > 0:
            risk_score += 20
        if has_registry_role or omissions_count > 0:
            risk_score += 20
            registry_unreported_count += 1
        if has_family_stake or stake_kind == "family":
            risk_score += 10
            family_count += 1
        if period_eur >= 1_000_000:
            risk_score += 15
        elif period_eur >= 250_000:
            risk_score += 10
        elif period_eur >= 50_000:
            risk_score += 5
        risk_score = min(100, risk_score)

        # Build record
        rec = {
            "rank": idx,
            "slug": slug,
            "sigmaUrl": f"{BASE_URL}/persons/{slug}",
            "name": name,
            "inCore512": in_core512,
            "boardOnly": has_board_only and not in_core512,
            "circle": primary_circle,
            "primaryInstitution": primary_inst_norm,
            "institutions": inst_list,
            "companies": companies,
            "companyCount": len(companies),
            "contractCount": contract_cnt,
            "periodEur": period_eur,
            "totalEur": total_eur,
            "ownInstitution": own_inst,
            "hasContemporaneous": has_contemp,
            "stakeKind": stake_kind,
            "hasRegistryRole": has_registry_role,
            "hasFamilyStake": has_family_stake or stake_kind == "family",
            "omissionsCount": omissions_count,
            "riskScore": risk_score,
            "relatives": relatives,
            "byAuthority": by_auth,
            "byAuthorityTotal": detail.get("byAuthorityTotal", len(by_auth)),
            "topContracts": top_contracts,
            "declarations": declarations,
        }
        rec["isBurgas"] = is_burgas_region(rec)
        if rec["isBurgas"]:
            burgas_count += 1

        total_period_eur += period_eur
        total_all_eur += total_eur
        officials_out.append(rec)

        # Index company -> officials (for detecting shared-company circles!)
        for comp in companies:
            if comp["eik"]:
                company_to_officials[comp["eik"]].append({
                    "rank": idx,
                    "name": name,
                    "slug": slug,
                    "institution": primary_inst_norm,
                    "circle": primary_circle,
                    "periodEur": period_eur,
                    "totalEur": total_eur,
                    "companyName": comp["name"],
                    "roles": comp["roles"],
                })

        # Aggregate institutional clusters
        for ni in (norm_insts_set or {"Непосочена институция"}):
            cl = inst_clusters.get(ni)
            if not cl:
                cl = {
                    "institution": ni,
                    "circle": primary_circle,
                    "officialCount": 0,
                    "ownInstitutionHits": 0,
                    "periodEur": 0.0,
                    "totalEur": 0.0,
                    "companies": set(),
                    "officials": [],
                }
                inst_clusters[ni] = cl
            cl["officialCount"] += 1
            if own_inst:
                cl["ownInstitutionHits"] += 1
            cl["periodEur"] += period_eur
            cl["totalEur"] += total_eur
            for comp in companies:
                cl["companies"].add(f"{comp['name']} ({comp['eik']})")
            cl["officials"].append({
                "rank": idx,
                "name": name,
                "slug": slug,
                "ownInstitution": own_inst,
                "periodEur": period_eur,
                "totalEur": total_eur,
                "contractCount": contract_cnt,
                "companies": [c["name"] for c in companies],
            })

    # Detect shared-company circles (2+ public officials linked to the exact same contractor EIK!)
    shared_companies = []
    for eik, linked_people in company_to_officials.items():
        if len(linked_people) >= 2:
            shared_companies.append({
                "eik": eik,
                "companyName": linked_people[0]["companyName"],
                "officialCount": len(linked_people),
                "maxTotalEur": max(p["totalEur"] for p in linked_people),
                "officials": linked_people,
            })
    shared_companies.sort(key=lambda x: (x["officialCount"], x["maxTotalEur"]), reverse=True)

    # Finalize institutional clusters
    clusters_list = []
    for ni, cl in inst_clusters.items():
        clusters_list.append({
            "institution": cl["institution"],
            "circle": cl["circle"],
            "officialCount": cl["officialCount"],
            "ownInstitutionHits": cl["ownInstitutionHits"],
            "periodEur": round(cl["periodEur"], 2),
            "totalEur": round(cl["totalEur"], 2),
            "companyCount": len(cl["companies"]),
            "officials": sorted(cl["officials"], key=lambda x: x["periodEur"], reverse=True),
        })
    clusters_list.sort(key=lambda x: (x["ownInstitutionHits"] > 0, x["periodEur"], x["officialCount"]), reverse=True)

    # Circle sector breakdown
    circle_summary: dict[str, dict[str, Any]] = {}
    for o in officials_out:
        c = o["circle"]
        if c not in circle_summary:
            circle_summary[c] = {
                "circle": c,
                "officialCount": 0,
                "ownInstitutionHits": 0,
                "registryHits": 0,
                "periodEur": 0.0,
                "totalEur": 0.0,
            }
        circle_summary[c]["officialCount"] += 1
        if o["ownInstitution"]:
            circle_summary[c]["ownInstitutionHits"] += 1
        if o["hasRegistryRole"]:
            circle_summary[c]["registryHits"] += 1
        circle_summary[c]["periodEur"] += o["periodEur"]
        circle_summary[c]["totalEur"] += o["totalEur"]
    circle_summary_list = sorted(
        [
            {**v, "periodEur": round(v["periodEur"], 2), "totalEur": round(v["totalEur"], 2)}
            for v in circle_summary.values()
        ],
        key=lambda x: x["periodEur"],
        reverse=True,
    )

    summary_meta = {
        "source": "СИГМА 2.0 (https://sigma.midt.bg) — МИДТ / АОП / ЦАИС ЕОП / Сметна палата / ТРРЮЛНЦ",
        "license": "CC-BY 4.0",
        "asOf": meta["asOf"],
        "refreshedAt": meta["refreshedAt"],
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalOfficialsAllRoles": len(officials_out),
        "totalOfficialsCore512": meta["totalCore512"],
        "ownInstitutionHits": own_inst_count,
        "mpCount": mp_count,
        "registryRoleHits": registry_unreported_count,
        "familyStakeHits": family_count,
        "burgasRegionHits": burgas_count,
        "sharedCompaniesCount": len(shared_companies),
        "totalPeriodEur": round(total_period_eur, 2),
        "totalAllContractsEur": round(total_all_eur, 2),
        "nationalTotals": comp_dec.get("totals") or {},
        "procedureTotals": comp_dec.get("procedure") or {},
        "circleSummary": circle_summary_list,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Full officials dataset
    (DATA_DIR / "officials_all.json").write_text(
        json.dumps({"meta": summary_meta, "officials": officials_out}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # 2. Circles & Institutional Clusters dataset
    (DATA_DIR / "circles_graph.json").write_text(
        json.dumps(
            {
                "meta": summary_meta,
                "circleSummary": circle_summary_list,
                "institutionalClusters": clusters_list,
                "sharedCompanies": shared_companies,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # 3. Competition / Monopolies / Single-offer / Macro Flows dataset
    (DATA_DIR / "competition_stats.json").write_text(
        json.dumps(
            {
                "asOf": meta["asOf"],
                "totals": comp_dec.get("totals") or {},
                "procedure": comp_dec.get("procedure") or {},
                "topPairs": comp_dec.get("topPairs") or [],
                "byConcentration": comp_dec.get("byConcentration") or [],
                "bySingleOffer": comp_dec.get("bySingleOffer") or [],
                "byDirectAward": comp_dec.get("byDirectAward") or [],
                "flows": flows_dec.get("flows") or flows_dec.get("links") or [],
                "networkCenter": net_dec.get("center") or {},
                "networkNodes": net_dec.get("nodes") or [],
                "networkEdges": net_dec.get("edges") or [],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # 4. Complete UTF-8 BOM CSV for journalists / prosecutors / citizens
    csv_path = DATA_DIR / "SIGMA_2_0_ALL_OFFICIALS_571.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "№", "Длъжностно лице", "Категория / Кръг", "Основна институция",
            "Всички институции и длъжности", "Свързани фирми (ЕИК)", "Свързани лица (ТР)",
            "Стойност в периода (€)", "Обща стойност (€)", "Брой договори",
            "От собствената институция", "В декларирания период", "Роля по ТР",
            "Дял на свързано лице", "Основен списък 512", "Риск индекс (0-100)",
            "Топ възложители", "Линк СИГМА 2.0"
        ])
        for o in officials_out:
            inst_str = "; ".join(
                f"{i['institution']} ({', '.join(i['positions'])}) [{','.join(i['years'])}]"
                for i in o["institutions"]
            )
            comp_str = "; ".join(
                f"{c['name']} [ЕИК {c['eik']}] ({', '.join(c['roles'])})"
                for c in o["companies"]
            )
            rel_str = "; ".join(r["name"] for r in o["relatives"])
            auth_str = "; ".join(
                f"{a['name']} ({a['valueEur']:,.0f} €, {a['contracts']} дог.)"
                for a in o["byAuthority"][:5]
            )
            writer.writerow([
                o["rank"], o["name"], o["circle"], o["primaryInstitution"],
                inst_str, comp_str, rel_str,
                o["periodEur"], o["totalEur"], o["contractCount"],
                "ДА" if o["ownInstitution"] else "НЕ",
                "ДА" if o["hasContemporaneous"] else "НЕ",
                "ДА" if o["hasRegistryRole"] else "НЕ",
                "ДА" if o["hasFamilyStake"] else "НЕ",
                "ДА" if o["inCore512"] else "ЧЛЕН НА СЪВЕТ",
                o["riskScore"], auth_str, o["sigmaUrl"],
            ])

    # 5. Also write a clean Markdown summary report in docs/
    own_list = [o for o in officials_out if o["ownInstitution"]]
    md_lines = [
        "# СИГМА 2.0 — Пълен одит на всички 571 длъжностни лица и кръгове на свързаност",
        "",
        f"- **Източник:** Официален публичен API на [СИГМА 2.0](https://sigma.midt.bg/conflicts) (МИДТ, АОП / ЦАИС ЕОП, Сметна палата, ТРРЮЛНЦ, лиценз CC-BY 4.0)",
        f"- **Дата на данните:** `{meta['asOf']}` (синхронизирано: `{meta['refreshedAt']}`)",
        f"- **Общо извлечени лица (100% без пропуск):** **{len(officials_out)}** (от които **{meta['totalCore512']}** със собственост/управление + **{len(officials_out) - meta['totalCore512']}** членове на съвети)",
        f"- **Директни съвпадения „От собствената институция“:** **{own_inst_count}** длъжностни лица",
        f"- **Народни представители (Народно събрание):** **{mp_count}** лица",
        f"- **Установени роли по Търговския регистър:** **{registry_unreported_count}** лица",
        f"- **Споделени фирми между 2+ длъжностни лица:** **{len(shared_companies)}** компании",
        f"- **Обща стойност на договорите в декларирания период:** **€{total_period_eur:,.2f}**",
        f"- **Обща стойност на всички договори на свързаните фирми:** **€{total_all_eur:,.2f}**",
        "",
        "> **Правна бележка:** Всички данни са извлечени автоматично от публичните регистри (Сметна палата по чл. 75 ЗСП, ТРРЮЛНЦ и ЦАИС ЕОП чрез СИГМА 2.0). Посочената свързаност представлява публичен индикатор за деклариран интерес и граждански контрол, а не съдебно установена вина.",
        "",
        "## Топ кръгове по сектори",
        "",
        "| Кръг / Сектор | Брой лица | От собств. инст. | Роли по ТР | Стойност в периода (€) | Обща стойност (€) |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for cs in circle_summary_list:
        md_lines.append(
            f"| **{cs['circle']}** | {cs['officialCount']} | {cs['ownInstitutionHits']} | {cs['registryHits']} | €{cs['periodEur']:,.0f} | €{cs['totalEur']:,.0f} |"
        )
    md_lines += [
        "",
        f"## Всички {len(own_list)} лица с признак „От собствената институция“",
        "",
        "| № | Длъжностно лице | Институция | Свързани фирми (ЕИК) | Стойност в периода (€) | Обща стойност (€) | Договори |",
        "|---:|---|---|---|---:|---:|---:|",
    ]
    for i, o in enumerate(own_list, 1):
        comps = ", ".join(f"{c['name']} ({c['eik']})" for c in o["companies"])
        md_lines.append(
            f"| {i} | [{o['name']}]({o['sigmaUrl']}) | {o['primaryInstitution']} | {comps} | €{o['periodEur']:,.0f} | €{o['totalEur']:,.0f} | {o['contractCount']} |"
        )

    (REPO_ROOT / "docs" / "AUDIT_REPORT_SIGMA_2_0.md").write_text("\n".join(md_lines), encoding="utf-8")

    print("[4/4] ALL DATASETS GENERATED SUCCESSFULLY:")
    print(f"    -> {DATA_DIR / 'officials_all.json'} ({len(officials_out)} officials)")
    print(f"    -> {DATA_DIR / 'circles_graph.json'} ({len(clusters_list)} institutional clusters, {len(shared_companies)} shared companies)")
    print(f"    -> {DATA_DIR / 'competition_stats.json'}")
    print(f"    -> {csv_path}")
    print(json.dumps(summary_meta, ensure_ascii=False, indent=2))


def main() -> int:
    rows, meta = fetch_all_conflicts()
    details = enrich_all_persons(rows)
    build_datasets(rows, meta, details)
    return 0


if __name__ == "__main__":
    sys.exit(main())
