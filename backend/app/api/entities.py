"""Entity profiles and ⌘K search: sellers, products, customers, orders."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.services import entities

router = APIRouter(tags=["entities"])


def _found(profile: dict | None, kind: str, key: str) -> dict:
    if profile is None:
        raise HTTPException(status_code=404, detail=f"{kind} {key} not found")
    return profile


@router.get("/sellers/{seller_id}")
def get_seller(seller_id: str, session: Session = Depends(get_db)):
    return _found(entities.seller_profile(session, seller_id), "seller", seller_id)


@router.get("/products/{product_id}")
def get_product(product_id: str, session: Session = Depends(get_db)):
    return _found(entities.product_profile(session, product_id), "product", product_id)


@router.get("/customers/{customer_id}")
def get_customer(customer_id: str, session: Session = Depends(get_db)):
    return _found(entities.customer_profile(session, customer_id), "customer", customer_id)


@router.get("/search")
def get_search(q: str = Query(min_length=1, max_length=40), session: Session = Depends(get_db)):
    return entities.search(session, q)
