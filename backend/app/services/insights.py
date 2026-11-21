"""The Today brief: ranked, evidence-backed signals for marketplace roles.

Each signal function reads live PostgreSQL state for the current window and
returns zero or more signals. Thresholds come from the data in scope
(peer percentiles, a baseline rate, minimum volumes scaled to the data),
not from fixed numbers, so the brief stays meaningful after an import adds
new days, sellers or products.

Signal shape (stable API contract, see docs/product.md):
    id, domain, severity (act | watch | info), title, metric, baseline, delta,
    unit, evidence[], next_step, link, kpi
"""
from __future__ import annotations

import datetime
from collections.abc import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.entities import RevenueForecast
from backend.app.services import analytics, stats
from backend.app.services.period import Window, resolve_window

SEVERITY_RANK = {"act": 0, "watch": 1, "info": 2}

ROLE_DOMAINS = {
    "commercial": {"revenue", "category", "pricing"},
    "fulfillment": {"sellers", "fulfillment"},
    "inventory": {"inventory", "returns"},
    "customers": {"customers"},
    "data": {"data"},
}


def _signal(**kw) -> dict:
    kw.setdefault("baseline", None)
    kw.setdefault("delta", None)
    kw.setdefault("unit", None)
    kw.setdefault("evidence", [])
    kw.setdefault("magnitude", 0.0)
    return kw


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def _inr(x: float) -> str:
    if abs(x) >= 1e7:
        return f"₹{x / 1e7:.2f} Cr"
    if abs(x) >= 1e5:
        return f"₹{x / 1e5:.2f} L"
    return f"₹{x:,.0f}"


# ── revenue ─────────────────────────────────────────────────────────────────
def revenue_pace(session: Session, w: Window) -> list[dict]:
    summary = stats.performance_summary(session, days=w.days)
    m = summary["metrics"].get("revenue")
    if not m:
        return []
    change = m["relative_change"]
    out = []
    if change is not None:
        sev = "act" if change <= -0.10 else "watch" if change <= -0.03 else "info"
        direction = "up" if change > 0 else "down"
        out.append(_signal(
            id="revenue-pace", domain="revenue", severity=sev, kpi="K1",
            title=f"Revenue is {direction} {abs(change) * 100:.1f}% on the previous {w.days} days",
            metric=m["current"], baseline=m["previous"], delta=change, unit="inr",
            evidence=[f"Last {w.days} days: {_inr(m['current'])}",
                      f"Previous {w.days} days: {_inr(m['previous'])}",
                      f"Orders: {summary['metrics']['orders']['current']:,.0f} "
                      f"({_pct(summary['metrics']['orders']['relative_change'])})"],
            next_step=("Open Revenue to see which categories and cities explain the drop."
                       if change < 0 else "Open Revenue to see what is driving the growth."),
            link="/revenue", magnitude=abs(change),
        ))
    # Actuals vs forecast where forecasted days now have data (e.g. after an import).
    rows = session.execute(
        select(RevenueForecast.target_date, RevenueForecast.yhat)
        .where(RevenueForecast.model == "rf",
               RevenueForecast.target_date.between(w.start, w.end))
    ).all()
    if len(rows) >= 3:
        daily = {d["date"]: d["revenue"] for d in analytics.daily_revenue(session, w)}
        pairs = [(daily[r.target_date.isoformat()], float(r.yhat)) for r in rows
                 if r.target_date.isoformat() in daily]
        if len(pairs) >= 3:
            actual, fc = sum(a for a, _ in pairs), sum(f for _, f in pairs)
            gap = (actual - fc) / fc if fc else 0.0
            out.append(_signal(
                id="revenue-vs-forecast", domain="revenue", kpi="K1",
                severity="act" if gap <= -0.10 else "watch" if gap <= -0.05 else "info",
                title=f"Actual revenue is {abs(gap) * 100:.1f}% {'below' if gap < 0 else 'above'} the forecast",
                metric=actual, baseline=fc, delta=gap, unit="inr",
                evidence=[f"{len(pairs)} forecasted days now have actuals",
                          f"Actual {_inr(actual)} vs forecast {_inr(fc)} (Random Forest)"],
                next_step="Check Forecast; refresh the model if the gap persists.",
                link="/forecast", magnitude=abs(gap),
            ))
    return out


def category_momentum(session: Session, w: Window) -> list[dict]:
    cats = [c for c in analytics.category_comparison(session, w) if c["change"] is not None]
    if not cats:
        return []
    out = []
    worst = min(cats, key=lambda c: c["change"])
    best = max(cats, key=lambda c: c["change"])
    if worst["change"] < -0.05:
        out.append(_signal(
            id=f"category-down-{worst['category'].lower()}", domain="category", kpi="K5",
            severity="act" if worst["change"] <= -0.15 and worst["share"] >= 0.10 else "watch",
            title=f"{worst['category']} revenue fell {abs(worst['change']) * 100:.1f}%",
            metric=worst["current"], baseline=worst["previous"], delta=worst["change"], unit="inr",
            evidence=[f"{worst['category']} is {_pct(worst['share'])} of revenue in this window",
                      f"{_inr(worst['current'])} vs {_inr(worst['previous'])}"],
            next_step="Review pricing, stock and seller coverage for this category.",
            link=f"/revenue?category={worst['category']}", magnitude=abs(worst["change"]) * worst["share"],
        ))
    if best["change"] > 0.05 and best is not worst:
        out.append(_signal(
            id=f"category-up-{best['category'].lower()}", domain="category", kpi="K5", severity="info",
            title=f"{best['category']} is the fastest-growing category (+{best['change'] * 100:.1f}%)",
            metric=best["current"], baseline=best["previous"], delta=best["change"], unit="inr",
            evidence=[f"Share of revenue: {_pct(best['share'])}"],
            next_step="Make sure stock cover keeps up with demand in this category.",
            link=f"/inventory?category={best['category']}", magnitude=best["change"] * best["share"],
        ))
    return out


def discount_efficiency(session: Session, w: Window) -> list[dict]:
    m = analytics.margin(session, w)
    deep = [b for b in m["by_discount_band"] if b["band"] in ("50–70",)]
    if not deep or not m["revenue"]:
        return []
    b = deep[0]
    share = b["revenue"] / m["revenue"]
    if b["est_margin"] >= 0 or share < 0.01:
        return []
    return [_signal(
        id="deep-discounts", domain="pricing", kpi="K6 · K10", severity="watch",
        title=f"Discounts above 50% sell below estimated cost ({_pct(share)} of revenue)",
        metric=b["est_margin"], baseline=0.0, unit="inr",
        evidence=[f"Estimated margin in the 50–70% band: {_inr(b['est_margin'])}",
                  f"Break-even discount under the cost assumption: {m['break_even_discount_pct']}%",
                  "Estimated: unit cost = 0.65 × list price (no cost of goods in the source)"],
        next_step="Cap seller-funded discounts near the break-even level, or confirm real costs first.",
        link="/revenue#margin", magnitude=share,
    )]


# ── sellers / fulfillment ───────────────────────────────────────────────────
def seller_outliers(session: Session, w: Window) -> list[dict]:
    card = analytics.seller_scorecard(session, w, limit=100000)
    peers, sellers = card["peers"], card["sellers"]
    out = []
    for flag, rate_key, p90_key, p50_key, kpi, label, sig_id in (
        ("late_deliveries", "delayed_rate", "delayed_p90", "delayed_p50", "K4",
         "deliver late significantly more often than their peers", "sellers-late"),
        ("returns", "return_rate", "return_p90", "return_p50", "K3",
         "get significantly more returns than their peers", "sellers-returns"),
    ):
        flagged = sorted((s for s in sellers if flag in s["flags"]),
                         key=lambda s: s["revenue"], reverse=True)
        if not flagged:
            continue
        share = sum(s["revenue_share"] for s in flagged)
        top = flagged[:3]
        out.append(_signal(
            id=sig_id, domain="sellers", kpi=kpi,
            severity="act" if share >= 0.05 else "watch",
            title=f"{len(flagged)} sellers {label}",
            metric=len(flagged), baseline=peers[p90_key], unit="count",
            evidence=[f"Peer median {_pct(peers[p50_key])}, 90th percentile {_pct(peers[p90_key])} "
                      f"(sellers with ≥ {peers['min_orders']} orders); flagged only when also "
                      "significantly above the pooled peer rate (z ≥ 2)",
                      f"They carry {_pct(share)} of revenue in this window"]
            + [f"{s['seller_id']}: {_pct(s[rate_key])} on {s['orders']} orders" for s in top],
            next_step=("Review delivery SLAs with these sellers, starting with the largest."
                       if flag == "late_deliveries"
                       else "Check listing accuracy and product quality with these sellers."),
            link=f"/sellers?flag={flag}", magnitude=share,
        ))
    return out


def transit_backlog(session: Session, w: Window) -> list[dict]:
    a = analytics.in_transit_ageing(session, w.as_of)
    out = []
    recent_total = a["in_transit"] - a["stale_over_30d"]
    if a["recent_past_promise"]:
        share = a["recent_past_promise"] / max(recent_total, 1)
        out.append(_signal(
            id="transit-past-promise", domain="fulfillment", kpi="K4",
            severity="act" if share >= 0.25 else "watch",
            title=f"{a['recent_past_promise']:,} recent shipments are past their promised delivery time",
            metric=a["recent_past_promise"], baseline=recent_total, delta=share, unit="count",
            evidence=[f"{share * 100:.1f}% of the {recent_total:,} orders shipped in the last 30 days "
                      "and still in transit"]
            + [f"{b['bucket']}: {b['past_promise']:,} past promise" for b in a["buckets"][:4]
               if b["past_promise"]],
            next_step="Chase carriers for these shipments, oldest first.",
            link="/fulfillment#ageing", magnitude=share,
        ))
    if a["stale_over_30d"]:
        share = a["stale_over_30d"] / max(a["in_transit"], 1)
        out.append(_signal(
            id="transit-never-closed", domain="data", kpi="K4", severity="watch",
            title=f"{a['stale_over_30d']:,} orders have been 'in transit' for more than 30 days",
            metric=a["stale_over_30d"], baseline=a["in_transit"], delta=share, unit="count",
            evidence=[f"{share * 100:.1f}% of all in-transit orders",
                      "No shipment takes this long (promised time is 1–6 days): the status was "
                      "probably never closed",
                      "Until closed, they are excluded from the late-delivery rate"],
            next_step="Close them as delivered, delayed or returned at the source.",
            link="/fulfillment#ageing", magnitude=share,
        ))
    return out


# ── inventory / returns ─────────────────────────────────────────────────────
def stockout_risk(session: Session, w: Window) -> list[dict]:
    cover = analytics.stock_cover(session, w.as_of, limit=200)
    # Products that still have stock but will run out soon (zero stock is its own signal).
    urgent = [i for i in cover["items"]
              if i["stock"] > 0 and i["days_of_cover"] is not None and i["days_of_cover"] <= 14]
    out = []
    if urgent:
        rev = sum(i["revenue"] for i in urgent)
        out.append(_signal(
            id="stockout-14d", domain="inventory", kpi="K8",
            severity="act" if any(i["days_of_cover"] <= 7 for i in urgent) else "watch",
            title=f"{len(urgent)} selling products run out within 14 days",
            metric=len(urgent), unit="count",
            evidence=[f"They sold {_inr(rev)} in the last {cover['velocity_days']} days"]
            + [f"{i['product_id']} ({i['brand']}, {i['category']}): {i['stock']} left, "
               f"{i['days_of_cover']} days of cover" for i in urgent[:3]],
            next_step="Reorder these first; they are ranked by days of cover.",
            link="/inventory#reorder", magnitude=len(urgent) / max(cover["critical"], 1),
        ))
    if cover["out_of_stock"]:
        out.append(_signal(
            id="out-of-stock", domain="inventory", kpi="K8", severity="watch",
            title=f"{cover['out_of_stock']:,} products show zero stock",
            metric=cover["out_of_stock"], baseline=cover["products"], unit="count",
            evidence=[f"{cover['critical']:,} products are below the stock-critical line of "
                      f"{cover['threshold']} units"],
            next_step="Decide which to reorder and which to delist.",
            link="/inventory", magnitude=cover["out_of_stock"] / max(cover["products"], 1),
        ))
    return out


def return_hotspots(session: Session, w: Window) -> list[dict]:
    h = analytics.return_hotspots(session, w, limit=50)
    hot = [p for p in h["pairs"] if p["z"] >= 2.0]
    if not hot:
        return []
    refunded = sum(p["refunded"] for p in hot)
    return [_signal(
        id="return-hotspots", domain="returns", kpi="K12", severity="watch",
        title=f"{len(hot)} category–brand pairs return significantly more than average",
        metric=len(hot), baseline=h["baseline_return_rate"], unit="count",
        evidence=[f"Baseline return rate {_pct(h['baseline_return_rate'])}; "
                  f"pairs need ≥ {h['min_orders']} orders and z ≥ 2",
                  f"Refunded in this window: {_inr(refunded)}"]
        + [f"{p['brand']} · {p['category']}: {_pct(p['return_rate'])} ({p['lift']:.2f}× baseline)"
           for p in hot[:3]],
        next_step="Inspect listings and quality for these brands before the next promotion.",
        link="/inventory#returns", magnitude=refunded,
    )]


# ── customers ───────────────────────────────────────────────────────────────
def churn_risk(session: Session, w: Window) -> list[dict]:
    c = analytics.churn_risk(session, w.as_of, limit=3)
    seg = {s["segment"]: s for s in c["segments"]}
    risk = seg.get("at_risk")
    if not risk or not risk["customers"]:
        return []
    return [_signal(
        id="churn-risk", domain="customers", kpi="K11",
        severity="act" if risk["revenue_share"] >= 0.10 else "watch",
        title=f"{risk['customers']:,} repeat customers have gone quiet",
        metric=risk["customers"], unit="count", delta=risk["revenue_share"],
        evidence=[f"They brought {_inr(risk['revenue'])} ({_pct(risk['revenue_share'])} of lifetime revenue)",
                  "Rule: no order for more than twice their own usual gap between orders"]
        + [f"{t['customer_id']}: {t['days_since']} days quiet (usual gap {t['avg_gap_days']} days)"
           for t in c["top_at_risk"]],
        next_step="Target them with a win-back offer, highest lifetime value first.",
        link="/customers#at-risk", magnitude=risk["revenue_share"],
    )]


# ── data trust ──────────────────────────────────────────────────────────────
def data_trust(session: Session, w: Window) -> list[dict]:
    out = []
    checks = stats.dq_checks(session)
    failed = [c for c in checks if c["violations"]]
    if failed:
        out.append(_signal(
            id="dq-violations", domain="data", kpi="R1–R7", severity="act",
            title=f"{len(failed)} data-quality rule{'s' if len(failed) > 1 else ''} found bad records",
            metric=sum(c["violations"] for c in failed), unit="count",
            evidence=[f"{c['rule']}: {c['violations']:,}" for c in failed[:4]],
            next_step="Numbers touching these records may be wrong; fix the source before reporting.",
            link="/data#quality", magnitude=1.0,
        ))
    fc_asof = session.execute(select(func.max(RevenueForecast.asof_date))).scalar()
    if fc_asof is None:
        out.append(_signal(
            id="forecast-missing", domain="data", kpi="Forecast", severity="info",
            title="No revenue forecast is published yet",
            evidence=["Run `mise run forecast` to train and publish the 30-day outlook"],
            next_step="Publish a forecast so pace can be compared with expectations.",
            link="/forecast", magnitude=0.1,
        ))
    elif fc_asof < w.as_of:
        lag = (w.as_of - fc_asof).days
        out.append(_signal(
            id="forecast-stale", domain="data", kpi="Forecast",
            severity="watch" if lag > 7 else "info",
            title=f"The forecast is {lag} days behind the data",
            metric=lag, unit="days",
            evidence=[f"Forecast trained on data up to {fc_asof.isoformat()}",
                      f"Books now run to {w.as_of.isoformat()}"],
            next_step="Refresh the forecast so it learns from the new days.",
            link="/forecast", magnitude=min(lag / 30, 1.0),
        ))
    from backend.app.governance.runs import latest as latest_run

    run = latest_run(session)
    if run is None:
        out.append(_signal(
            id="governance-none", domain="data", kpi="Governance", severity="info",
            title="The data contract has not been validated yet",
            evidence=["Great Expectations validates the books contract (R1–R8) on demand and after "
                      "every import"],
            next_step="Run a governance check from the Data page.", link="/data#governance",
            magnitude=0.1,
        ))
    elif run.status in ("failed", "error"):
        failed = [r for r in (run.results or []) if not r["success"] and r["severity"] == "critical"]
        out.append(_signal(
            id=f"governance-failed-{run.run_id}", domain="data", kpi="Governance", severity="act",
            title=(f"{run.critical_failures} critical data-contract expectation"
                   f"{'s' if run.critical_failures != 1 else ''} failed" if run.status == "failed"
                   else "The last governance run could not complete"),
            evidence=[f"{r['rule']} · {r['suite']}: {r['why']}" for r in failed[:4]] or [run.error or ""],
            next_step="Numbers built on these records may be wrong; fix them at the source.",
            link="/data#governance", magnitude=1.0,
        ))
    from backend.app.services.imports import latest_batch  # local import: avoid cycle

    batch = latest_batch(session)
    if batch and batch["rows_rejected"]:
        out.append(_signal(
            id=f"import-rejections-{batch['batch_id']}", domain="data", kpi="Import", severity="watch",
            title=f"The last import rejected {batch['rows_rejected']:,} of {batch['rows_total']:,} rows",
            metric=batch["rows_rejected"], baseline=batch["rows_total"], unit="count",
            evidence=[f"{rule}: {n:,}" for rule, n in (batch["rejections_by_rule"] or {}).items()][:4],
            next_step="Download the rejection report, fix the rows at the source and re-upload.",
            link=f"/data/imports/{batch['batch_id']}", magnitude=0.5,
        ))
    return out


def completeness(session: Session, w: Window) -> float | None:
    """Orders in the current window ÷ orders in the previous one. A sharp drop
    usually means the latest days are not fully loaded yet (partial export),
    not that the business collapsed."""
    from sqlalchemy import text

    cur, prev = session.execute(text("""
        SELECT SUM(CASE WHEN order_date BETWEEN :start AND :end THEN 1 ELSE 0 END),
               SUM(CASE WHEN order_date BETWEEN :prev_start AND :prev_end THEN 1 ELSE 0 END)
        FROM public.orders WHERE order_date BETWEEN :prev_start AND :end
    """), w.params).one()
    return (cur or 0) / prev if prev else None


#: Below this share of the previous window's volume, the window is treated as partial.
PARTIAL_BELOW = 0.5


SIGNALS: list[Callable[[Session, Window], list[dict]]] = [
    revenue_pace, category_momentum, discount_efficiency, seller_outliers, transit_backlog,
    stockout_risk, return_hotspots, churn_risk, data_trust,
]


@analytics.cached
def _brief_all(session: Session, days: int) -> dict:
    w = resolve_window(session, days)
    generated_at = datetime.datetime.now(datetime.UTC).isoformat()
    if w is None:
        return {"generated_at": generated_at, "window": None, "signals": [], "empty": True}
    signals: list[dict] = []
    for fn in SIGNALS:
        try:
            signals.extend(fn(session, w))
        except Exception as e:  # noqa: BLE001 — one broken signal must not blank the brief
            session.rollback()
            signals.append(_signal(id=f"error-{fn.__name__}", domain="data", kpi="—", severity="info",
                                   title=f"Signal '{fn.__name__}' could not be computed",
                                   evidence=[f"{type(e).__name__}: {str(e)[:160]}"],
                                   next_step="Check the API logs.", link="/data", magnitude=0.0))
    ratio = completeness(session, w)
    partial = ratio is not None and ratio < PARTIAL_BELOW
    if partial:
        # Don't raise business alarms on an incomplete period: demote them and say why.
        for sig in signals:
            if sig["domain"] in ("revenue", "category", "customers"):
                sig["severity"] = "info"
                sig["title"] = f"Partial data · {sig['title']}"
                sig["evidence"] = ["Compare with caution: the current window looks incomplete"] + sig["evidence"]
        signals.append(_signal(
            id="partial-window", domain="data", kpi="Completeness", severity="act",
            title=f"The last {w.days} days hold only {ratio * 100:.0f}% of the previous period's orders",
            metric=ratio, baseline=1.0, unit=None,
            evidence=["A drop this sharp usually means the latest days are not fully loaded "
                      "(a partial export or a late feed), not a collapse in demand",
                      f"Books currently run to {w.as_of.isoformat()}"],
            next_step="Check that the last import covers whole days for every channel; revenue "
                      "signals are marked partial until it does.",
            link="/data#import", magnitude=1.0 - ratio,
        ))
    signals.sort(key=lambda s: (SEVERITY_RANK[s["severity"]], -float(s["magnitude"] or 0)))
    return {"generated_at": generated_at, "window": w.as_dict(), "signals": signals, "empty": False,
            "completeness": ratio, "partial": partial}


def brief(session: Session, days: int = 30, role: str | None = None) -> dict:
    """The ranked brief for everyone, or only the domains a role owns."""
    full = _brief_all(session, days)
    domains = ROLE_DOMAINS.get(role or "")
    signals = [s for s in full["signals"] if not domains or s["domain"] in domains]
    counts = {k: sum(1 for s in signals if s["severity"] == k) for k in SEVERITY_RANK}
    return {**full, "role": role, "counts": counts, "signals": signals}
