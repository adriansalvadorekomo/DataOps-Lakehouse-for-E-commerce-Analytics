"""Run the data contracts with Great Expectations.

* ``validate_import(df)`` — gate a parsed CSV; returns per-row rule failures
  plus the suite summary stored on the import batch.
* ``run_books(engine)`` — validate the live PostgreSQL books in place and
  return a run summary (stored in ``governance_runs`` by ``record_run``).

Great Expectations is imported lazily (it is heavy) and its usage analytics
are disabled: no data or metadata leaves this process.
"""
from __future__ import annotations

import datetime
import os
import time

import pandas as pd

from backend.app.governance.contracts import MIN_DATE, RULE_ORDER, books_contract, import_contract

os.environ.setdefault("GX_ANALYTICS_ENABLED", "False")


def _gx():
    import great_expectations as gx
    from great_expectations.data_context.types.base import ProgressBarsConfig

    ctx = gx.get_context(mode="ephemeral")
    ctx.variables.progress_bars = ProgressBarsConfig(globally=False)
    return gx, ctx


def _suite(gx, name: str, expectations: list[dict]):
    suite = gx.ExpectationSuite(name=name)
    for e in expectations:
        suite.add_expectation(getattr(gx.expectations, e["type"])(**e["kwargs"], meta=e["meta"]))
    return suite


def _jsonable(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if hasattr(v, "item"):
        return v.item()
    return v if isinstance(v, (str, int, float, bool, type(None))) else str(v)


def _summarise(suite_name: str, result) -> list[dict]:
    out = []
    for r in result.results:
        cfg = r.expectation_config
        res = r.result or {}
        out.append({
            "suite": suite_name,
            "expectation": cfg.type,
            "column": cfg.kwargs.get("column") or ", ".join(cfg.kwargs.get("column_list", []) or []) or None,
            "rule": cfg.meta.get("rule"), "severity": cfg.meta.get("severity", "critical"),
            "why": cfg.meta.get("why"), "success": bool(r.success),
            "element_count": res.get("element_count"),
            "unexpected_count": res.get("unexpected_count",
                                        res.get("observed_value") if not r.success else 0),
            "unexpected_percent": res.get("unexpected_percent"),
            "sample": [_jsonable(x) for x in (res.get("partial_unexpected_list") or [])[:5]],
        })
    return out


# ── import gate ─────────────────────────────────────────────────────────────
def frame_for_import(df: pd.DataFrame, today: datetime.date) -> pd.DataFrame:
    """Raw CSV strings → the derived columns the import contract checks."""
    f = df.copy()
    for col in f.columns:
        if col != "line_no":
            f[col] = f[col].astype("string").str.strip().replace("", pd.NA)
    for col in ("price", "discount", "final_price", "rating", "review_count", "stock",
                "seller_rating", "shipping_time_days"):
        f[f"{col}_num"] = pd.to_numeric(f[col], errors="coerce").astype("Float64")
    f["status_norm"] = f["delivery_status"].str.upper()
    expected = (f["price_num"] * (1 - f["discount_num"] / 100)).round(2)
    f["final_price_deviation"] = (f["final_price_num"] - expected).abs()
    parsed = pd.to_datetime(f["purchase_date"].str.slice(0, 10), format="%Y-%m-%d", errors="coerce")
    f["purchase_date_parsed"] = parsed
    f["days_from_min"] = (parsed - pd.Timestamp(MIN_DATE)).dt.days.astype("Float64")
    f["days_to_today"] = (pd.Timestamp(today) - parsed).dt.days.astype("Float64")
    return f


def validate_import(df: pd.DataFrame, today: datetime.date) -> dict:
    """Validate parsed CSV rows. ``df`` must carry a ``line_no`` column.

    Returns {"row_failures": {line_no: (rule, why, column, value)}, "summary": {...}}
    where the reported rule per row is the first in RULE_ORDER it breaks.
    Null checks only fail on rows whose raw value is missing, so a row with an
    empty price reports R1 required, not R1 type."""
    gx, ctx = _gx()
    frame = frame_for_import(df, today)
    batch = (ctx.data_sources.add_pandas("imports").add_dataframe_asset("csv")
             .add_batch_definition_whole_dataframe("upload").get_batch(batch_parameters={"dataframe": frame}))
    contract = import_contract(today)
    started = time.perf_counter()
    result = batch.validate(_suite(gx, "import_contract", contract),
                            result_format={"result_format": "COMPLETE",
                                           "unexpected_index_column_names": ["line_no"]})
    failures: dict[int, tuple] = {}
    rank = {r: i for i, r in enumerate(RULE_ORDER)}
    by_line = frame.set_index("line_no")
    for r in result.results:
        if r.success:
            continue
        cfg = r.expectation_config
        rule, why, column = cfg.meta["rule"], cfg.meta["why"], cfg.kwargs.get("column")
        raw_col = column.removesuffix("_num") if column else None
        for item in (r.result or {}).get("unexpected_index_list") or []:
            line = int(item["line_no"])
            if rule == "R1 type" and raw_col in by_line.columns and pd.isna(by_line.at[line, raw_col]):
                continue  # empty raw value: reported as R1 required instead
            prev = failures.get(line)
            if prev is None or rank[rule] < rank[prev[0]]:
                raw = by_line.at[line, raw_col] if raw_col in by_line.columns else item.get(column)
                failures[line] = (rule, why, raw_col or column, None if pd.isna(raw) else _jsonable(raw))
    summary = {
        "engine": "great_expectations", "suite": "import_contract",
        "evaluated": result.statistics["evaluated_expectations"],
        "successful": result.statistics["successful_expectations"],
        "seconds": round(time.perf_counter() - started, 2),
        "expectations": _summarise("import_contract", result),
    }
    return {"row_failures": failures, "summary": summary}


# ── books run ───────────────────────────────────────────────────────────────
def run_books(connection_url: str, today: datetime.date | None = None) -> dict:
    """Validate every suite of the books contract against PostgreSQL."""
    today = today or datetime.date.today()
    gx, ctx = _gx()
    ds = ctx.data_sources.add_sql("books", connection_string=connection_url)
    started = datetime.datetime.now(datetime.UTC)
    results: list[dict] = []
    for name, spec in books_contract(today).items():
        asset = (ds.add_table_asset(name, table_name=spec["table"], schema_name="public")
                 if "table" in spec else ds.add_query_asset(name, query=spec["query"]))
        batch = asset.add_batch_definition_whole_table("all").get_batch()
        results += _summarise(name, batch.validate(_suite(gx, name, spec["expectations"])))
    critical = [r for r in results if not r["success"] and r["severity"] == "critical"]
    warnings = [r for r in results if not r["success"] and r["severity"] != "critical"]
    return {
        "engine": "great_expectations",
        "started_at": started.isoformat(),
        "finished_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "status": "failed" if critical else "warning" if warnings else "passed",
        "evaluated": len(results),
        "successful": sum(r["success"] for r in results),
        "critical_failures": len(critical),
        "warnings": len(warnings),
        "results": results,
    }
