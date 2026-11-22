"""The Today brief: ranked, evidence-backed signals for marketplace roles.

Each signal function reads live PostgreSQL state for the current window and
returns zero or more signals. Thresholds come from the data in scope
(peer percentiles, a baseline rate, minimum volumes scaled to the data),
not from fixed numbers, so the brief stays meaningful after an import adds
new days, sellers or products.

Signal shape (stable API contract, see docs/product.md):
    id, domain, severity (act | watch | info), title, metric, baseline, delta,
    unit, evidence[], next_step, link, kpi,
    figure, visual, facts[], note   (what the brief card draws; see _figure / _visual)
"""
from __future__ import annotations

import datetime
import logging
from collections.abc import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.entities import RevenueForecast
from backend.app.services import analytics, stats
from backend.app.services.period import Window, resolve_window

log = logging.getLogger(__name__)

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
    kw.setdefault("figure", None)
    kw.setdefault("visual", None)
    kw.setdefault("facts", [])
    kw.setdefault("note", None)
    return kw


# Structured parts of a signal, drawn by the brief card:
#   figure  the one number to remember: {value, kind: pct|signed_pct|inr|count|days, caption, of?}
#           (`of` = the value is a share of a whole: drawn as a 10 × 10 dot grid)
#   visual  the chart chosen for the signal:
#           compare  two or three values side by side (this period vs last, actual vs expected)
#           steps    a distribution over ordered buckets (e.g. days past promise)
#           ranking  the named items behind the signal, with an optional reference value
#   facts   two or three labelled figures, already formatted
#   note    one caveat line (e.g. "estimated")
def _figure(value: float, kind: str, caption: str, of: bool = False) -> dict:
    return {"value": value, "kind": kind, "caption": caption, "of": of}


def _visual(kind: str, title: str, unit: str, items: list[dict], reference: dict | None = None) -> dict:
    return {"kind": kind, "title": title, "unit": unit, "items": items, "reference": reference}


def _fact(label: str, value: str) -> dict:
    return {"label": label, "value": value}


_IMPORT_RULES = {
    "R0 columns": "Missing columns", "R1 required": "Missing values", "R1 type": "Wrong format",
    "R4 final_price": "Price doesn't add up", "R5 enum": "Unknown value", "R6 range": "Out of range",
    "R7 date": "Impossible date",
}


def _plain_rule(name: str) -> str:
    n = name.lower()
    for key, label in (("null", "Missing identifiers"), ("unique", "Duplicates"), ("→", "Broken links"),
                       ("final_price", "Price doesn't add up"), ("enum", "Unknown values"),
                       ("range", "Out-of-range values"), ("date", "Impossible dates")):
        if key in n:
            return label
    return name


def _signed(x: float | None) -> str:
    return "n/a" if x is None else f"{'+' if x >= 0 else '−'}{abs(x) * 100:.1f}%"


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def _inr(x: float) -> str:
    """International units for prose: ₹9.94B · ₹419.0M · ₹959K · ₹9,939."""
    a = abs(x)
    if a >= 1e9:
        return f"₹{x / 1e9:.2f}B"
    if a >= 1e6:
        return f"₹{x / 1e6:.1f}M"
    if a >= 1e5:
        return f"₹{x / 1e3:.0f}K"
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
            figure=_figure(change, "signed_pct", f"revenue vs the previous {w.days} days"),
            visual=_visual("compare", "Revenue", "inr", [
                {"label": f"Last {w.days} days", "value": m["current"], "current": True},
                {"label": f"Previous {w.days} days", "value": m["previous"]}]),
            facts=[_fact("Orders", f"{summary['metrics']['orders']['current']:,.0f}"),
                   _fact("Orders vs previous", _signed(summary["metrics"]["orders"]["relative_change"])),
                   _fact("Average order", _inr(summary["metrics"]["aov"]["current"]))],
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
                          f"Actual {_inr(actual)} against an expected {_inr(fc)}"],
                next_step="Check Forecast; refresh the model if the gap persists.",
                link="/forecast", magnitude=abs(gap),
                figure=_figure(gap, "signed_pct", f"actual vs forecast over {len(pairs)} days"),
                visual=_visual("compare", "Revenue on the forecasted days", "inr", [
                    {"label": "Actual", "value": actual, "current": True},
                    {"label": "Expected", "value": fc}]),
                facts=[_fact("Days compared", f"{len(pairs)}")],
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
            figure=_figure(worst["change"], "signed_pct", f"{worst['category']} revenue vs the previous {w.days} days"),
            visual=_category_visual(cats, worst["category"], w),
            facts=[_fact("Share of revenue", _pct(worst["share"])),
                   _fact(f"Last {w.days} days", _inr(worst["current"]))],
        ))
    if best["change"] > 0.05 and best is not worst:
        out.append(_signal(
            id=f"category-up-{best['category'].lower()}", domain="category", kpi="K5", severity="info",
            title=f"{best['category']} is the fastest-growing category (+{best['change'] * 100:.1f}%)",
            metric=best["current"], baseline=best["previous"], delta=best["change"], unit="inr",
            evidence=[f"Share of revenue: {_pct(best['share'])}"],
            next_step="Make sure stock cover keeps up with demand in this category.",
            link=f"/inventory?category={best['category']}", magnitude=best["change"] * best["share"],
            figure=_figure(best["change"], "signed_pct", f"{best['category']} revenue vs the previous {w.days} days"),
            visual=_category_visual(cats, best["category"], w),
            facts=[_fact("Share of revenue", _pct(best["share"])),
                   _fact(f"Last {w.days} days", _inr(best["current"]))],
        ))
    return out


def _category_visual(cats: list[dict], highlight: str, w: Window) -> dict:
    return _visual("ranking", f"Change by category, last {w.days} days vs previous", "signed_pct", [
        {"label": c["category"], "value": c["change"], "current": c["category"] == highlight,
         "hint": _inr(c["current"])}
        for c in sorted(cats, key=lambda c: c["change"])])


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
                  "Estimated: assumes goods cost 65% of their list price (real costs are not recorded)"],
        next_step="Cap seller-funded discounts near the break-even level, or confirm real costs first.",
        link="/revenue#margin", magnitude=share,
        figure=_figure(b["est_margin"], "inr", "estimated margin on sales at 50–70% off"),
        visual=_visual("ranking", "Estimated margin by discount", "signed_pct", [
            {"label": f"{x['band']}% off", "value": x["est_margin_pct"], "current": x["band"] == "50–70",
             "hint": _inr(x["est_margin"])} for x in m["by_discount_band"]]),
        facts=[_fact("Share of revenue", _pct(share)),
               _fact("Break-even discount", f"{m['break_even_discount_pct']}%")],
        note="Estimated: assumes goods cost 65% of their list price (real costs are not recorded).",
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
            title=(f"{len(flagged)} sellers {label}" if len(flagged) > 1
                   else f"Seller {flagged[0]['seller_id']} {label.replace('deliver ', 'delivers ').replace('get ', 'gets ')}"),
            metric=len(flagged), baseline=peers[p90_key], unit="count",
            evidence=[f"A typical seller is at {_pct(peers[p50_key])}; these sellers are above "
                      f"{_pct(peers[p90_key])}, worse than 9 in 10 of their peers",
                      f"Only sellers with at least {peers['min_orders']} orders are compared, and only "
                      "gaps too large to be chance are flagged",
                      f"They carry {_pct(share)} of revenue in this window"]
            + [f"{s['seller_id']}: {_pct(s[rate_key])} on {s['orders']} orders" for s in top],
            next_step=("Review delivery times with these sellers, starting with the largest."
                       if flag == "late_deliveries"
                       else "Check listing accuracy and product quality with these sellers."),
            link=f"/sellers?flag={flag}", magnitude=share,
            figure=_figure(
                sum(s[rate_key] * s["orders"] for s in flagged) / max(sum(s["orders"] for s in flagged), 1), "pct",
                (f"of their deliveries arrived late, against {_pct(peers[p50_key])} for a typical seller"
                 if flag == "late_deliveries"
                 else f"of their orders came back, against {_pct(peers[p50_key])} for a typical seller"),
                of=True),
            visual=_visual("ranking", ("Share of deliveries that arrived late" if flag == "late_deliveries"
                                       else "Share of orders returned"), "pct",
                           [{"label": s["seller_id"], "value": s[rate_key], "current": True,
                             "hint": f"{s['orders']:,} orders"} for s in flagged[:5]],
                           reference={"label": "Typical seller", "value": peers[p50_key]}),
            facts=[_fact("Sellers flagged", f"{len(flagged):,}"),
                   _fact("Their share of revenue", _pct(share)),
                   _fact("Worst 10% of sellers start at", _pct(peers[p90_key]))],
            note=f"Only sellers with at least {peers['min_orders']} orders are compared, and only gaps "
                 "too large to be chance are flagged.",
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
            figure=_figure(share, "pct", f"of the {recent_total:,} orders shipped in the last 30 days and "
                           "still in transit", of=True),
            visual=_visual("steps", "Shipments past their promise, by days since order", "count",
                           [{"label": b["bucket"].replace(" days", "d"), "value": b["past_promise"] or 0}
                            for b in a["buckets"] if b["bucket"] != "30+ days"]),
            facts=[_fact("Past promise", f"{a['recent_past_promise']:,}"),
                   _fact("Still in transit", f"{recent_total:,}")],
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
            figure=_figure(share, "pct", "of all orders marked in transit", of=True),
            facts=[_fact("Stuck over 30 days", f"{a['stale_over_30d']:,}"),
                   _fact("All in transit", f"{a['in_transit']:,}"),
                   _fact("Promised delivery", "1–6 days")],
            note="Until closed, they are left out of the late-delivery rate.",
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
            figure=_figure(rev, "inr", f"of sales in the last {cover['velocity_days']} days at stake"),
            visual=_visual("ranking", "Days of stock left", "days",
                           [{"label": i["product_id"], "value": i["days_of_cover"], "current": i["days_of_cover"] <= 7,
                             "hint": f"{i['brand']} · {i['stock']} left"} for i in urgent[:5]],
                           reference={"label": "One week", "value": 7}),
            facts=[_fact("Products", f"{len(urgent):,}"),
                   _fact("Out within a week", f"{sum(1 for i in urgent if i['days_of_cover'] <= 7):,}")],
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
            figure=_figure(cover["out_of_stock"], "count", f"of {cover['products']:,} products have none left"),
            facts=[_fact("Zero stock", f"{cover['out_of_stock']:,}"),
                   _fact(f"Under {cover['threshold']} units", f"{cover['critical']:,}"),
                   _fact("Products", f"{cover['products']:,}")],
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
        title=(f"{len(hot)} brands get returned far more often than usual" if len(hot) > 1
               else f"{hot[0]['brand']} in {hot[0]['category']} gets returned far more often than usual"),
        metric=len(hot), baseline=h["baseline_return_rate"], unit="count",
        evidence=[f"Normally {_pct(h['baseline_return_rate'])} of orders come back; these brands are "
                  "above that by more than chance would explain",
                  f"Refunded in this window: {_inr(refunded)}"]
        + [f"{p['brand']} in {p['category']}: {_pct(p['return_rate'])} returned ({p['lift']:.1f}× the usual rate)"
           for p in hot[:3]],
        next_step="Inspect listings and quality for these brands before the next promotion.",
        link="/inventory#returns", magnitude=refunded,
        figure=_figure(refunded, "inr", f"refunded on these brands in the last {w.days} days"),
        visual=_visual("ranking", "Share of orders returned", "pct",
                       [{"label": p["brand"], "value": p["return_rate"], "current": True,
                         "hint": f"{p['category']} · {p['lift']:.1f}× usual"} for p in hot[:5]],
                       reference={"label": "Usual", "value": h["baseline_return_rate"]}),
        facts=[_fact("Brands", f"{len(hot):,}"), _fact("Usual return rate", _pct(h["baseline_return_rate"]))],
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
                  "Quiet for more than twice their usual time between orders"]
        + [f"{t['customer_id']}: {t['days_since']} days quiet (usual gap {t['avg_gap_days']} days)"
           for t in c["top_at_risk"]],
        next_step="Target them with a win-back offer, highest lifetime value first.",
        link="/customers#at-risk", magnitude=risk["revenue_share"],
        figure=_figure(risk["revenue_share"], "pct", "of lifetime revenue came from them", of=True),
        visual=_visual("ranking", "Days since their last order", "days",
                       [{"label": t["customer_id"], "value": t["days_since"], "current": True,
                         "hint": f"usually every {t['avg_gap_days']:.0f} days"} for t in c["top_at_risk"]]),
        facts=[_fact("Customers", f"{risk['customers']:,}"), _fact("Lifetime revenue", _inr(risk["revenue"]))],
        note="Quiet for more than twice their usual time between orders.",
    )]


# ── data trust ──────────────────────────────────────────────────────────────
def data_trust(session: Session, w: Window) -> list[dict]:
    out = []
    checks = stats.dq_checks(session)
    failed = [c for c in checks if c["violations"]]
    if failed:
        out.append(_signal(
            id="dq-violations", domain="data", kpi="Data checks", severity="act",
            title=f"{len(failed)} data check{'s' if len(failed) > 1 else ''} found records to fix",
            metric=sum(c["violations"] for c in failed), unit="count",
            evidence=[f"{_plain_rule(c['rule'])}: {c['violations']:,} records" for c in failed[:4]],
            next_step="Numbers touching these records may be wrong; fix the source before reporting.",
            link="/data#quality", magnitude=1.0,
            figure=_figure(sum(c["violations"] for c in failed), "count", "records to fix"),
            visual=_visual("ranking", "Records to fix, by problem", "count",
                           [{"label": _plain_rule(c["rule"]), "value": c["violations"], "current": True}
                            for c in failed[:5]]),
        ))
    fc_asof = session.execute(select(func.max(RevenueForecast.asof_date))).scalar()
    if fc_asof is None:
        out.append(_signal(
            id="forecast-missing", domain="data", kpi="Forecast", severity="info",
            title="No revenue forecast is published yet",
            evidence=["Publish the 30-day outlook from the Forecast page"],
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
            evidence=[f"The forecast was last refreshed with sales up to {fc_asof.isoformat()}",
                      f"Books now run to {w.as_of.isoformat()}"],
            next_step="Refresh the forecast so it learns from the new days.",
            link="/forecast", magnitude=min(lag / 30, 1.0),
            figure=_figure(lag, "days", "between the forecast and the latest sales"),
            facts=[_fact("Forecast built on sales up to", fc_asof.isoformat()),
                   _fact("Books run to", w.as_of.isoformat())],
        ))
    from backend.app.governance.runs import latest as latest_run

    run = latest_run(session)
    if run is None:
        out.append(_signal(
            id="governance-none", domain="data", kpi="Data checks", severity="info",
            title="The data has not been checked yet",
            evidence=["Automatic checks confirm the records are complete and consistent; they run on "
                      "demand and after every import"],
            next_step="Run the data checks from the Data & governance page.", link="/data#governance",
            magnitude=0.1,
        ))
    elif run.status in ("failed", "error"):
        failed = [r for r in (run.results or []) if not r["success"] and r["severity"] == "critical"]
        out.append(_signal(
            id=f"governance-failed-{run.run_id}", domain="data", kpi="Data checks", severity="act",
            title=(f"{run.critical_failures} critical data check"
                   f"{'s' if run.critical_failures != 1 else ''} failed" if run.status == "failed"
                   else "The last data check could not complete"),
            evidence=[r["why"] for r in failed[:4]] or ["The check could not finish; try again later"],
            next_step="Numbers built on these records may be wrong; fix them at the source.",
            link="/data#governance", magnitude=1.0,
        ))
    from backend.app.services.imports import latest_batch  # local import: avoid cycle

    batch = latest_batch(session)
    if batch and batch["rows_rejected"]:
        out.append(_signal(
            id=f"import-rejections-{batch['batch_id']}", domain="data", kpi="New data", severity="watch",
            title=f"The last import rejected {batch['rows_rejected']:,} of {batch['rows_total']:,} rows",
            metric=batch["rows_rejected"], baseline=batch["rows_total"], unit="count",
            evidence=[f"{_IMPORT_RULES.get(rule, rule)}: {n:,} rows"
                      for rule, n in (batch["rejections_by_rule"] or {}).items()][:4],
            next_step="Download the rejection report, fix the rows at the source and re-upload.",
            link=f"/data/imports/{batch['batch_id']}", magnitude=0.5,
            figure=_figure(batch["rows_rejected"] / max(batch["rows_total"], 1), "pct", "of the last import was refused", of=True),
            visual=_visual("ranking", "Rows refused, by reason", "count",
                           [{"label": _IMPORT_RULES.get(rule, rule), "value": n, "current": True}
                            for rule, n in (batch["rejections_by_rule"] or {}).items()][:5]),
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
                                   title="One part of the brief could not be worked out",
                                   evidence=["The other signals are unaffected"],
                                   next_step="Try again in a minute; if it persists, ask the data team.",
                                   link="/data", magnitude=0.0))
            log.warning("signal %s failed: %s", fn.__name__, e)
    ratio = completeness(session, w)
    partial = ratio is not None and ratio < PARTIAL_BELOW
    if partial:
        # Don't raise business alarms on an incomplete period: demote them and say why.
        for sig in signals:
            if sig["domain"] in ("revenue", "category", "customers"):
                sig["severity"] = "info"
                sig["title"] = f"Partial data · {sig['title']}"
                sig["evidence"] = ["Compare with caution: the current window looks incomplete"] + sig["evidence"]
                sig["note"] = "Compare with caution: the current period looks incomplete."
        signals.append(_signal(
            id="partial-window", domain="data", kpi="Data checks", severity="act",
            title=f"The last {w.days} days hold only {ratio * 100:.0f}% of the previous period's orders",
            metric=ratio, baseline=1.0, unit=None,
            evidence=["A drop this sharp usually means the latest days are not fully loaded "
                      "(a partial export or a late feed), not a collapse in demand",
                      f"Books currently run to {w.as_of.isoformat()}"],
            next_step="Check that the last import covers whole days for every channel; revenue "
                      "signals are marked partial until it does.",
            link="/data#import", magnitude=1.0 - ratio,
            figure=_figure(ratio, "pct", "of the previous period's orders are loaded", of=True),
            facts=[_fact("Books run to", w.as_of.isoformat())],
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
