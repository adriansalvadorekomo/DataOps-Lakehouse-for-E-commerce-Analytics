"""CSV import (Great Expectations gate, idempotency) and books governance runs."""
from __future__ import annotations

import csv
import datetime
import io

from backend.app.services import imports


def _csv(rows: list[list[str]], header=imports.COLUMNS) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue().encode()


def _row(**over) -> list[str]:
    base = dict(zip(imports.COLUMNS, imports.TEMPLATE_ROWS[0], strict=True))
    base["purchase_date"] = datetime.date.today().isoformat()
    base.update(over)
    return [base[c] for c in imports.COLUMNS]


def _upload(client, data: bytes, name="orders.csv"):
    r = client.post("/imports", files={"file": (name, data, "text/csv")})
    assert r.status_code == 202, r.text
    return client.get(f"/imports/{r.json()['batch_id']}").json()


def test_template_matches_contract(client):
    r = client.get("/imports/template")
    header = r.text.splitlines()[0].split(",")
    assert tuple(header) == imports.COLUMNS


def test_import_accepts_valid_rejects_invalid_with_rule(client):
    good = [_row(user_id="U_IMP1"), _row(user_id="U_IMP2", product_id="P_IMP2", seller_id="S_IMP2")]
    bad = [
        _row(user_id="U_BAD1", discount="90", final_price="2499.90"),       # R6 range
        _row(user_id="U_BAD2", delivery_status="Lost"),                      # R5 enum
        _row(user_id="U_BAD3", final_price="10.00"),                         # R4 final_price
        _row(user_id="U_BAD4", purchase_date="2099-01-01"),                  # R7 date
        _row(user_id="", product_id="P_X"),                                  # R1 required
        _row(user_id="U_BAD6", price="abc"),                                 # R1 type
    ]
    batch = _upload(client, _csv(good + bad))
    assert batch["status"] == "completed", batch
    assert (batch["rows_total"], batch["rows_accepted"], batch["rows_rejected"]) == (8, 2, 6)
    assert set(batch["rejections_by_rule"]) == {"R6 range", "R5 enum", "R4 final_price",
                                                "R7 date", "R1 required", "R1 type"}
    assert {r["line_no"] for r in batch["rejections"]} == {4, 5, 6, 7, 8, 9}
    gov = batch["governance"]
    assert gov["engine"] == "great_expectations" and gov["evaluated"] > 30
    assert client.get("/customers/U_IMP2").status_code == 200
    assert client.get("/products/P_IMP2").json()["latest_stock"] == 42


def test_reimport_is_idempotent_and_moves_freshness(client):
    data = _csv([_row(user_id="U_IDEM", product_id="P_IDEM", seller_id="S_IDEM")])
    first = _upload(client, data)
    assert first["rows_accepted"] == 1
    again = _upload(client, data)
    assert (again["rows_accepted"], again["rows_duplicate"]) == (0, 1)
    fresh = client.get("/meta/freshness").json()
    assert fresh["as_of"] == datetime.date.today().isoformat()
    assert fresh["last_import"]["batch_id"] == again["batch_id"]


def test_missing_columns_fail_the_batch(client):
    batch = _upload(client, _csv([["U1", "P1"]], header=("user_id", "product_id")))
    assert batch["status"] == "failed" and "missing columns" in batch["error"]


def test_fingerprint_matches_seed_sql(session):
    from sqlalchemy import text

    raw = dict(zip(imports.COLUMNS, imports.TEMPLATE_ROWS[1], strict=True))
    row = imports.validate(raw, datetime.date.today())
    sql = text("""SELECT md5(concat_ws('|', CAST(:u AS text), CAST(:p AS text), CAST(:s AS text),
                  to_char(CAST(:d AS date), 'YYYY-MM-DD'), round(CAST(:price AS numeric), 2)::text,
                  round(CAST(:disc AS numeric), 2)::text, round(CAST(:fp AS numeric), 2)::text,
                  CAST(:loc AS text), CAST(:pay AS text), CAST(:dev AS text),
                  CAST(:ship AS smallint)::text, upper(CAST(:st AS text))))""")
    expected = session.execute(sql, {
        "u": raw["user_id"], "p": raw["product_id"], "s": raw["seller_id"], "d": raw["purchase_date"],
        "price": raw["price"], "disc": raw["discount"], "fp": raw["final_price"], "loc": raw["location"],
        "pay": raw["payment_method"], "dev": raw["device"], "ship": raw["shipping_time_days"],
        "st": raw["delivery_status"]}).scalar()
    assert imports.fingerprint(row) == expected


def test_governance_run_records_expectations(client):
    from backend.app.governance import runs

    out = runs.run_now("ci")
    assert out["status"] in ("passed", "warning"), out
    latest = client.get("/governance/runs/latest").json()
    assert latest["run_id"] == out["run_id"] and latest["evaluated"] >= 25
    rules = {r["rule"] for r in latest["results"]}
    assert {"R1 null keys", "R2 unique", "R3 foreign keys", "R4 final_price", "R5 enum"} <= rules
    contract = client.get("/governance/contract").json()
    assert contract["engine"] == "great_expectations"
