"""Read-only stats router — KPI aggregates (business-model §4, K1–K12).

Endpoints taking ``days`` measure the window ending at the latest order date
(services/period.py); omit it for all-time numbers.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.services import analytics, stats
from backend.app.services.period import resolve_window

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview")
def get_overview(session: Session = Depends(get_db)):
    return stats.overview(session)


@router.get("/performance-summary")
def get_performance_summary(
    days: int = Query(default=90, ge=7, le=365),
    session: Session = Depends(get_db),
):
    return stats.performance_summary(session, days=days)


@router.get("/revenue-trend")
def get_revenue_trend(
    days: int = Query(default=30, ge=7, le=365),
    session: Session = Depends(get_db),
):
    return stats.revenue_trend(session, days=days)


@router.get("/revenue-by-category")
def get_revenue_by_category(session: Session = Depends(get_db)):
    return stats.revenue_by_category(session)


@router.get("/discount-bands")
def get_discount_bands(session: Session = Depends(get_db)):
    return stats.discount_bands(session)


@router.get("/top-sellers")
def get_top_sellers(
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_db),
):
    return stats.top_sellers(session, limit=limit)


@router.get("/pareto")
def get_pareto(session: Session = Depends(get_db)):
    return stats.pareto_share(session)


@router.get("/dq-checks")
def get_dq_checks(session: Session = Depends(get_db)):
    return stats.dq_checks(session)


@router.get("/seller-performance")
def get_seller_performance(
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_db),
):
    return stats.seller_performance(session, limit=limit)


@router.get("/category-trend")
def get_category_trend(
    months: int = Query(default=12, ge=3, le=36),
    session: Session = Depends(get_db),
):
    return stats.category_trend(session, months=months)


@router.get("/stock-critical")
def get_stock_critical(
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_db),
):
    return stats.stock_critical_list(session, limit=limit)


@router.get("/city-performance")
def get_city_performance(session: Session = Depends(get_db)):
    return stats.city_performance(session)


@router.get("/forecast")
def get_forecast(
    trailing: int = Query(default=90, ge=30, le=365),
    session: Session = Depends(get_db),
):
    from backend.app.services.forecast import read_forecast

    return read_forecast(session, trailing=trailing)


Days = Query(default=None, ge=7, le=730, description="Window length ending at the latest order date")


def _window(session: Session, days: int | None):
    return resolve_window(session, days) if days else None


def _empty_guard(session: Session):
    w = resolve_window(session, 30)
    if w is None:
        raise HTTPException(status_code=404, detail="No orders yet: load the seed or import a CSV")
    return w


@router.get("/revenue-monthly")
def get_revenue_monthly(months: int = Query(default=24, ge=3, le=60),
                        session: Session = Depends(get_db)):
    return analytics.revenue_monthly(session, months=months)


@router.get("/daily-revenue")
def get_daily_revenue(days: int = Query(default=30, ge=7, le=365), session: Session = Depends(get_db)):
    w = resolve_window(session, days)
    return {"window": w.as_dict() if w else None,
            "days": analytics.daily_revenue(session, w) if w else []}


@router.get("/category-comparison")
def get_category_comparison(days: int = Query(default=30, ge=7, le=365),
                            session: Session = Depends(get_db)):
    w = resolve_window(session, days)
    return {"window": w.as_dict() if w else None,
            "categories": analytics.category_comparison(session, w) if w else []}


@router.get("/margin")
def get_margin(days: int | None = Days, session: Session = Depends(get_db)):
    return analytics.margin(session, _window(session, days))


@router.get("/pareto-curve")
def get_pareto_curve(session: Session = Depends(get_db)):
    return analytics.pareto_curve(session)


@router.get("/churn-risk")
def get_churn_risk(limit: int = Query(default=20, ge=1, le=100), session: Session = Depends(get_db)):
    return analytics.churn_risk(session, _empty_guard(session).as_of, limit=limit)


@router.get("/return-hotspots")
def get_return_hotspots(days: int | None = Days, limit: int = Query(default=12, ge=1, le=100),
                        session: Session = Depends(get_db)):
    return analytics.return_hotspots(session, _window(session, days), limit=limit)


@router.get("/stock-cover")
def get_stock_cover(limit: int = Query(default=50, ge=1, le=500), session: Session = Depends(get_db)):
    return analytics.stock_cover(session, _empty_guard(session).as_of, limit=limit)


@router.get("/fulfillment-funnel")
def get_fulfillment_funnel(days: int | None = Days, session: Session = Depends(get_db)):
    return analytics.fulfillment_funnel(session, _window(session, days))


@router.get("/in-transit-ageing")
def get_in_transit_ageing(session: Session = Depends(get_db)):
    return analytics.in_transit_ageing(session, _empty_guard(session).as_of)


@router.get("/seller-scorecard")
def get_seller_scorecard(days: int | None = Days, limit: int = Query(default=200, ge=1, le=2000),
                         session: Session = Depends(get_db)):
    return analytics.seller_scorecard(session, _window(session, days), limit=limit)


@router.get("/city-scorecard")
def get_city_scorecard(days: int | None = Days, session: Session = Depends(get_db)):
    return analytics.city_scorecard(session, _window(session, days))
