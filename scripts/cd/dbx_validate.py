#!/usr/bin/env python3
"""Quick Gold contract check on the warehouse (read-only).

Used by `mise run dbx-validate`. Same §6 numbers as the CD gate, without
triggering any job run. Needs DATABRICKS_HOST/TOKEN + WAREHOUSE_ID env.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

CATALOG = os.environ.get("LAKEHOUSE_CATALOG", "workspace")
SQL = (
    f"SELECT (SELECT COUNT(*) FROM {CATALOG}.bronze.raw_purchases),"
    f" (SELECT COUNT(*) FROM {CATALOG}.silver.orders),"
    f" (SELECT COUNT(*) FROM {CATALOG}.gold.fact_sales),"
    f" (SELECT ROUND(SUM(final_price), 2) FROM {CATALOG}.gold.fact_sales)"
)


def _api(payload: dict) -> dict:
    import urllib.request

    host = os.environ["DATABRICKS_HOST"].rstrip("/")
    req = urllib.request.Request(
        f"{host}/api/2.0/sql/statements/",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {os.environ['DATABRICKS_TOKEN']}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def main() -> int:
    for var in ("DATABRICKS_HOST", "DATABRICKS_TOKEN", "WAREHOUSE_ID"):
        if not os.environ.get(var):
            print(f"ERROR: {var} is not set", file=sys.stderr)
            return 2
    out = _api({"warehouse_id": os.environ["WAREHOUSE_ID"], "statement": SQL,
                "wait_timeout": "50s"})
    sid = out["statement_id"]
    for _ in range(30):
        import time

        time.sleep(10)
        cur = _api_get(sid)
        state = (cur.get("status") or {}).get("state")
        if state == "SUCCEEDED":
            row = (cur.get("result") or {}).get("data_array", [[]])[0]
            bronze, orders, fact, revenue = row[0], row[1], row[2], float(row[3])
            ok = bronze == "1000000" and orders == "1000000" and fact == "1000000" \
                and abs(revenue - 9_938_876_985) <= 1_000
            print(f"bronze={bronze} orders={orders} fact={fact} revenue=₹{revenue:,.2f} "
                  f"→ {'PASS' if ok else 'FAIL'}")
            return 0 if ok else 1
        if state in ("FAILED", "CANCELED", "CLOSED"):
            print(f"statement {state}", file=sys.stderr)
            return 1
    print("timed out waiting for warehouse", file=sys.stderr)
    return 1


def _api_get(sid: str) -> dict:
    import urllib.request

    host = os.environ["DATABRICKS_HOST"].rstrip("/")
    req = urllib.request.Request(
        f"{host}/api/2.0/sql/statements/{sid}",
        headers={"Authorization": f"Bearer {os.environ['DATABRICKS_TOKEN']}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print(__doc__)
    else:
        sys.exit(main())
