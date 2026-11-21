"""Analysis windows anchored on the data, not on the wall clock.

Every "last N days" number in the control tower is measured up to the latest
order date in the books (``as_of``). A dataset that ends in March 2026 still
shows a full 30-day window, and a CSV import that adds newer days moves
every window forward on the next request.
"""
from __future__ import annotations

import datetime
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.entities import Order


@dataclass(frozen=True)
class Window:
    as_of: datetime.date
    days: int
    start: datetime.date
    end: datetime.date
    prev_start: datetime.date
    prev_end: datetime.date

    def as_dict(self) -> dict:
        return {
            "as_of": self.as_of.isoformat(),
            "days": self.days,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "previous_start": self.prev_start.isoformat(),
            "previous_end": self.prev_end.isoformat(),
        }

    @property
    def params(self) -> dict:
        return {"start": self.start, "end": self.end,
                "prev_start": self.prev_start, "prev_end": self.prev_end}


def latest_order_date(session: Session) -> datetime.date | None:
    return session.execute(select(func.max(Order.order_date))).scalar()


def make_window(as_of: datetime.date, days: int) -> Window:
    start = as_of - datetime.timedelta(days=days - 1)
    prev_end = start - datetime.timedelta(days=1)
    prev_start = prev_end - datetime.timedelta(days=days - 1)
    return Window(as_of=as_of, days=days, start=start, end=as_of,
                  prev_start=prev_start, prev_end=prev_end)


def resolve_window(session: Session, days: int,
                   as_of: datetime.date | None = None) -> Window | None:
    """Current window = the ``days`` days ending at ``as_of`` (default: latest
    order date); previous window = the ``days`` days just before it.
    Returns None when there are no orders yet."""
    anchor = as_of or latest_order_date(session)
    if anchor is None:
        return None
    return make_window(anchor, days)
