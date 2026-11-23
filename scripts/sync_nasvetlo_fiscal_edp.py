#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NAsvetlo — Official Eurostat EDP Fiscal Audit (Bulgaria 2020–2025)
Pulls directly from European Commission / Eurostat Statistics API 1.0:
  - gov_10dd_edpt1 : General Government Deficit (B9), Gross Debt (GD), GDP (B1GQ)
  - gov_10dd_edpt2 : Transition between National Cash Working Balance and ESA 2010 Deficit (B9)
  - gov_10dd_edpt3 : Transition between ESA 2010 Deficit and Change in Gross Debt (Stock-Flow Adjustment / SFA)

Outputs:
  - docs/data/nasvetlo_fiscal_edp.json
"""

from __future__ import annotations

import json
import ssl
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"
CACHE_DIR = REPO_ROOT / ".cache_nasvetlo_50" / "eurostat_edp"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = DATA_DIR / "nasvetlo_fiscal_edp.json"

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BGN_PER_EUR = 1.95583

URLS = {
    "edpt1_bg.json": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt1?geo=BG&sector=S13&sinceTimePeriod=2020&format=JSON",
    "edpt2_bg.json": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt2?geo=BG&sinceTimePeriod=2021&format=JSON",
    "edpt3_bg.json": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt3?geo=BG&sinceTimePeriod=2021&format=JSON",
}


def load_eurostat(fname: str) -> dict[str, Any]:
    path = CACHE_DIR / fname
    if not path.exists() or path.stat().st_size < 200:
        req = urllib.request.Request(URLS[fname], headers={"User-Agent": "NAsvetlo-Fiscal-EDP/1.0"})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as resp:
            path.write_bytes(resp.read())
    return json.loads(path.read_text(encoding="utf-8-sig"))


def decode_jsonstat(doc: dict[str, Any]) -> list[dict[str, Any]]:
    ids: list[str] = doc["id"]
    sizes: list[int] = doc["size"]
    dims = doc["dimension"]
    # Build index->code and code->label maps per dimension
    dim_codes: list[list[str]] = []
    dim_labels: list[dict[str, str]] = []
    for d in ids:
        cat = dims[d]["category"]
        idx_map = cat["index"]
        if isinstance(idx_map, dict):
            ordered = [k for k, _ in sorted(idx_map.items(), key=lambda kv: kv[1])]
        else:
            ordered = list(idx_map)
        dim_codes.append(ordered)
        dim_labels.append(cat.get("label", {}))

    # Compute strides
    strides = [1] * len(sizes)
    for i in range(len(sizes) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    raw_vals = doc.get("value", {})
    items = raw_vals.items() if isinstance(raw_vals, dict) else enumerate(raw_vals)

    rows: list[dict[str, Any]] = []
    for k, v in items:
        if v is None:
            continue
        flat = int(k)
        rec: dict[str, Any] = {"value": float(v)}
        for i, d in enumerate(ids):
            pos = (flat // strides[i]) % sizes[i]
            code = dim_codes[i][pos]
            rec[d] = code
            rec[f"{d}_label"] = dim_labels[i].get(code, code)
        rows.append(rec)
    return rows


def main() -> int:
    edpt1 = decode_jsonstat(load_eurostat("edpt1_bg.json"))
    edpt2 = decode_jsonstat(load_eurostat("edpt2_bg.json"))
    edpt3 = decode_jsonstat(load_eurostat("edpt3_bg.json"))

    print("=== EDPT1 (S13, Bulgaria, MIO_NAC & PC_GDP) ===")
    t1_by_item: dict[tuple[str, str], dict[str, float]] = {}
    t1_labels: dict[str, str] = {}
    for r in edpt1:
        t1_labels[r["na_item"]] = r["na_item_label"]
        t1_by_item.setdefault((r["na_item"], r["unit"]), {})[r["time"]] = r["value"]

    for item in sorted(t1_labels.keys()):
        nac = t1_by_item.get((item, "MIO_NAC"), {})
        pct = t1_by_item.get((item, "PC_GDP"), {})
        if nac or pct:
            print(f"  {item:<14} ({t1_labels[item][:50]}):")
            if nac:
                print("    MIO_NAC:", " | ".join(f"{y}={nac[y]:,.1f}" for y in sorted(nac)))
            if pct:
                print("    PC_GDP :", " | ".join(f"{y}={pct[y]:.2f}%" for y in sorted(pct)))

    print("\n=== EDPT2 (Cash Working Balance -> ESA 2010 Deficit, S1311 Central Gov, MIO_NAC) ===")
    t2_by_sec_item: dict[tuple[str, str, str], dict[str, float]] = {}
    t2_labels: dict[str, str] = {}
    for r in edpt2:
        if r["unit"] != "MIO_NAC":
            continue
        t2_labels[r["na_item"]] = r["na_item_label"]
        t2_by_sec_item.setdefault((r["sector"], r["na_item"], r["unit"]), {})[r["time"]] = r["value"]

    for (sec, item, _), ym in sorted(t2_by_sec_item.items()):
        if sec not in ("S13", "S1311"):
            continue
        if any(abs(v) > 0.5 for v in ym.values()):
            print(f"  [{sec}] {item:<18} ({t2_labels[item][:52]}): " + " | ".join(f"{y}={ym[y]:,.1f}" for y in sorted(ym)))

    print("\n=== EDPT3 (Deficit -> Change in Gross Debt / Stock-Flow Adjustment, S13, MIO_NAC) ===")
    t3_by_item: dict[str, dict[str, float]] = {}
    t3_labels: dict[str, str] = {}
    for r in edpt3:
        if r["sector"] != "S13" or r["unit"] != "MIO_NAC":
            continue
        t3_labels[r["na_item"]] = r["na_item_label"]
        t3_by_item.setdefault(r["na_item"], {})[r["time"]] = r["value"]

    for item, ym in sorted(t3_by_item.items()):
        if any(abs(v) > 0.5 for v in ym.values()):
            print(f"  [S13] {item:<22} ({t3_labels[item][:55]}): " + " | ".join(f"{y}={ym[y]:,.1f}" for y in sorted(ym)))

    # Decode gov_10a_main (full revenue & expenditure breakdown 2021-2025)
    main_path = CACHE_DIR / "gov_10a_main_bg.json"
    q_path = CACHE_DIR / "gov_10q_ggdebt_bg.json"
    main_items: dict[str, dict[str, Any]] = {}
    q_debt: dict[str, dict[str, float]] = {}

    if main_path.exists():
        mrows = decode_jsonstat(json.loads(main_path.read_text(encoding="utf-8-sig")))
        key_codes = ("TR", "TE", "B9", "D2REC", "D5REC", "D61REC", "D1PAY", "D62PAY", "P2", "P51G", "D3PAY", "D41PAY", "D9PAY")
        print("\n=== GOV_10A_MAIN (Full S13 Revenues vs Expenditures, MIO EUR) ===")
        for r in mrows:
            code = r["na_item"]
            if code in key_codes:
                main_items.setdefault(code, {"label": r["na_item_label"], "years": {}})["years"][r["time"]] = r["value"]
        for code in key_codes:
            if code in main_items:
                ym = main_items[code]["years"]
                y21, y24, y25 = ym.get("2021", 0), ym.get("2024", 0), ym.get("2025", 0)
                g25 = ((y25 - y24) / abs(y24) * 100.0) if y24 else 0.0
                print(f"  {code:<8} ({main_items[code]['label'][:44]:<44}): " + " | ".join(f"{y}={ym[y]:,.1f}" for y in sorted(ym)) + f"  [24->25: {g25:+.1f}%]")

    if q_path.exists():
        qrows = decode_jsonstat(json.loads(q_path.read_text(encoding="utf-8-sig")))
        print("\n=== GOV_10Q_GGDEBT (Quarterly Gross Debt through 2026) ===")
        for r in qrows:
            q_debt.setdefault(r["unit"], {})[r["time"]] = r["value"]
        for u in ("MIO_NAC", "PC_GDP"):
            if u in q_debt:
                print(f"  {u:<8}: " + " | ".join(f"{t}={q_debt[u][t]:,.1f}" for t in sorted(q_debt[u])))

    # Save structured summary JSON
    summary = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Eurostat Official EDP & Government Finance Accounts (gov_10dd_edpt1/2/3, gov_10a_main, gov_10q_ggdebt, geo=BG)",
        "edpt1_nac": {k[0]: v for k, v in t1_by_item.items() if k[1] == "MIO_NAC"},
        "edpt1_pct": {k[0]: v for k, v in t1_by_item.items() if k[1] == "PC_GDP"},
        "edpt2_s1311_nac": {k[1]: {"label": t2_labels[k[1]], "years": v} for k, v in t2_by_sec_item.items() if k[0] == "S1311"},
        "edpt3_s13_nac": {k: {"label": t3_labels[k], "years": v} for k, v in t3_by_item.items()},
        "gov_10a_main_eur": main_items,
        "gov_10q_ggdebt": q_debt,
    }
    OUT_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[OK] Saved {OUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
