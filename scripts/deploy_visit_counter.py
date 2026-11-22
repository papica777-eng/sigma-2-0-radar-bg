#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Idempotent deployment script for NAsvetlo's permanent, never-resetting
Cloudflare D1 + Worker visit counter (`nasvetlo-visits`).

Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from environment variables
or Z:\\.env without ever printing secrets.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKER_FILE = REPO_ROOT / "workers" / "visit-counter" / "worker.js"
DB_NAME = "nasvetlo-visits-db"
WORKER_NAME = "nasvetlo-visits"


def load_cf_credentials() -> tuple[str, str]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if token and account_id:
        return token, account_id

    for candidate in (
        Path(r"Z:\.env"),
        Path(r"C:\Users\papic\Desktop\AETERNA-MILLENNIUM-SINGULARITY\.env"),
    ):
        if candidate.exists():
            for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k == "CLOUDFLARE_API_TOKEN" and not token:
                    token = v
                elif k == "CLOUDFLARE_ACCOUNT_ID" and not account_id:
                    account_id = v
    if not token or not account_id:
        raise RuntimeError("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID")
    return token, account_id


def cf_request(
    method: str,
    path: str,
    token: str,
    body: bytes | dict[str, Any] | None = None,
    content_type: str = "application/json",
) -> dict[str, Any]:
    url = f"https://api.cloudflare.com/client/v4{path}"
    data = None
    if isinstance(body, dict):
        data = json.dumps(body).encode("utf-8")
    elif isinstance(body, bytes):
        data = body

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"CF API {method} {path} failed ({e.code}): {err_body}") from e


def ensure_d1_database(account_id: str, token: str) -> str:
    listed = cf_request("GET", f"/accounts/{account_id}/d1/database", token)
    for db in listed.get("result") or []:
        if db.get("name") == DB_NAME:
            print(f"[D1] Reusing existing permanent database: {DB_NAME} ({db['uuid']})")
            return str(db["uuid"])

    created = cf_request(
        "POST",
        f"/accounts/{account_id}/d1/database",
        token,
        {"name": DB_NAME, "primary_location_hint": "eeur"},
    )
    db_uuid = str(created["result"]["uuid"])
    print(f"[D1] Created new permanent database: {DB_NAME} ({db_uuid})")
    return db_uuid


def ensure_d1_schema(account_id: str, db_uuid: str, token: str) -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS visit_counters (
          site_id TEXT PRIMARY KEY,
          total_visits INTEGER NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """,
        """
        INSERT OR IGNORE INTO visit_counters (site_id, total_visits, created_at, updated_at)
        VALUES ('nasvetlo.website', 0, datetime('now'), datetime('now'));
        """,
        """
        CREATE TRIGGER IF NOT EXISTS prevent_visit_reset_or_decrement
        BEFORE UPDATE ON visit_counters
        FOR EACH ROW
        WHEN NEW.total_visits < OLD.total_visits
        BEGIN
          SELECT RAISE(ABORT, 'MONOTONIC_INVARIANT: visit counter cannot be decremented or reset');
        END;
        """,
        """
        CREATE TRIGGER IF NOT EXISTS prevent_visit_delete
        BEFORE DELETE ON visit_counters
        BEGIN
          SELECT RAISE(ABORT, 'IMMUTABLE_INVARIANT: visit counter row cannot be deleted');
        END;
        """,
    ]
    for sql in statements:
        res = cf_request(
            "POST",
            f"/accounts/{account_id}/d1/database/{db_uuid}/query",
            token,
            {"sql": sql.strip()},
        )
        if not res.get("success"):
            raise RuntimeError(f"D1 schema statement failed: {res}")
    print("[D1] Verified immutable table + monotonic zero-reset triggers.")


def deploy_worker(account_id: str, db_uuid: str, token: str) -> str:
    worker_src = WORKER_FILE.read_bytes()
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2025-01-01",
        "bindings": [
            {
                "type": "d1",
                "name": "DB",
                "id": db_uuid,
            }
        ],
    }

    boundary = f"----NAsvetloBoundary{uuid.uuid4().hex}"
    parts = [
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="metadata"\r\n'
            f"Content-Type: application/json\r\n\r\n"
        ).encode("utf-8")
        + json.dumps(metadata).encode("utf-8")
        + b"\r\n",
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
            f"Content-Type: application/javascript+module\r\n\r\n"
        ).encode("utf-8")
        + worker_src
        + b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    payload = b"".join(parts)

    res = cf_request(
        "PUT",
        f"/accounts/{account_id}/workers/scripts/{WORKER_NAME}",
        token,
        body=payload,
        content_type=f"multipart/form-data; boundary={boundary}",
    )
    if not res.get("success"):
        raise RuntimeError(f"Worker deploy failed: {res}")
    print(f"[Worker] Deployed {WORKER_NAME} with D1 binding DB -> {db_uuid}")

    # Enable workers.dev route
    cf_request(
        "POST",
        f"/accounts/{account_id}/workers/scripts/{WORKER_NAME}/subdomain",
        token,
        {"enabled": True},
    )
    sub = cf_request("GET", f"/accounts/{account_id}/workers/subdomain", token)
    subdomain = sub["result"]["subdomain"]
    worker_url = f"https://{WORKER_NAME}.{subdomain}.workers.dev"
    print(f"[Worker] Live endpoint enabled: {worker_url}")
    return worker_url


def main() -> None:
    token, account_id = load_cf_credentials()
    db_uuid = ensure_d1_database(account_id, token)
    ensure_d1_schema(account_id, db_uuid, token)
    worker_url = deploy_worker(account_id, db_uuid, token)

    # Verify read-only /stats (does not inflate counter)
    req = urllib.request.Request(
        f"{worker_url}/stats",
        headers={"User-Agent": "NAsvetlo-DeployVerify/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
    print(f"[Verify] GET {worker_url}/stats -> {body}")


if __name__ == "__main__":
    main()
