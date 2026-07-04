from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import Bike, User
from ..schemas_catalog import (
    BikesListResponse,
    BrandsResponse,
    FlagRequest,
    FrameModelIn,
    FrameModelOut,
)
from ..security import current_user

router = APIRouter(prefix="/bikes", tags=["bikes"])


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", value.lower()).strip("-")
    return slug or "x"


def _make_bike_id(user_id: str, payload: FrameModelIn) -> str:
    return (
        f"user-{user_id[:6]}-"
        f"{_slugify(payload.brand)}-{_slugify(payload.model)}-{payload.launch_year}"
    )


def _serialize(bike: Bike) -> FrameModelOut:
    return FrameModelOut(
        id=bike.id,
        submitted_by_user_id=bike.submitted_by_user_id,
        **bike.model_json,
    )


@router.get("", response_model=BikesListResponse)
def list_bikes(db: Session = Depends(get_db)) -> BikesListResponse:
    rows = db.query(Bike).filter(Bike.flagged_at.is_(None)).order_by(Bike.created_at.desc()).all()
    return BikesListResponse(bikes=[_serialize(b) for b in rows])


@router.get("/brands", response_model=BrandsResponse)
def list_brands(db: Session = Depends(get_db)) -> BrandsResponse:
    rows = (
        db.query(func.distinct(Bike.brand))
        .filter(Bike.flagged_at.is_(None))
        .order_by(Bike.brand.asc())
        .all()
    )
    return BrandsResponse(brands=[r[0] for r in rows if r[0]])


@router.post("", response_model=FrameModelOut, status_code=status.HTTP_201_CREATED)
def create_bike(
    payload: FrameModelIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FrameModelOut:
    bike_id = _make_bike_id(user.id, payload)

    existing = (
        db.query(Bike)
        .filter(
            func.lower(Bike.brand) == payload.brand.lower(),
            func.lower(Bike.model) == payload.model.lower(),
            Bike.launch_year == payload.launch_year,
            Bike.flagged_at.is_(None),
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="duplicate_bike")

    bike = Bike(
        id=bike_id,
        submitted_by_user_id=user.id,
        brand=payload.brand,
        model=payload.model,
        launch_year=payload.launch_year,
        model_json=payload.model_dump(mode="json"),
    )
    db.add(bike)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="duplicate_bike")
    db.refresh(bike)
    return _serialize(bike)


@router.patch("/{bike_id}", response_model=FrameModelOut)
def update_bike(
    bike_id: str,
    payload: FrameModelIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FrameModelOut:
    bike = db.get(Bike, bike_id)
    if bike is None or bike.flagged_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if bike.submitted_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    bike.brand = payload.brand
    bike.model = payload.model
    bike.launch_year = payload.launch_year
    bike.model_json = payload.model_dump(mode="json")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="duplicate_bike")
    db.refresh(bike)
    return _serialize(bike)


@router.post("/{bike_id}/flag", status_code=status.HTTP_200_OK)
def flag_bike(
    bike_id: str,
    payload: FlagRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    bike = db.get(Bike, bike_id)
    if bike is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if bike.submitted_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if bike.flagged_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_flagged")

    bike.flagged_at = datetime.now(timezone.utc)
    bike.flagged_reason = payload.reason
    db.commit()
    return {"status": "flagged"}
