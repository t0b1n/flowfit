from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import Fit, User
from ..schemas_fits import FitIn, FitOut, FitRename, FitsListResponse, FitSnapshot, FitSummary
from ..security import current_user

router = APIRouter(prefix="/fits", tags=["fits"])

LIST_LIMIT = 200


def _summary(fit: Fit) -> FitSummary:
    snap = fit.snapshot_json or {}
    return FitSummary(
        id=fit.id,
        name=fit.name,
        created_at=fit.created_at,
        metrics=snap.get("metrics", {}),
        frame_label=snap.get("frame_label"),
    )


def _out(fit: Fit) -> FitOut:
    return FitOut(
        **_summary(fit).model_dump(),
        schema_version=fit.schema_version,
        inputs=fit.inputs_json,
        snapshot=FitSnapshot(**fit.snapshot_json),
    )


def _own_fit(db: Session, user: User, fit_id: str) -> Fit:
    """Another user's fit is a 404 (not 403) so fits cannot be enumerated."""
    fit = db.query(Fit).filter(Fit.id == fit_id, Fit.user_id == user.id).one_or_none()
    if fit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="fit_not_found")
    return fit


@router.get("", response_model=FitsListResponse)
def list_fits(user: User = Depends(current_user), db: Session = Depends(get_db)) -> FitsListResponse:
    rows = (
        db.query(Fit)
        .filter(Fit.user_id == user.id)
        .order_by(Fit.created_at.desc(), Fit.id.desc())
        .limit(LIST_LIMIT)
        .all()
    )
    return FitsListResponse(fits=[_summary(f) for f in rows])


@router.post("", response_model=FitOut, status_code=status.HTTP_201_CREATED)
def create_fit(payload: FitIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> FitOut:
    fit = Fit(
        user_id=user.id,
        name=payload.name,
        schema_version=1,
        inputs_json=payload.inputs,
        snapshot_json=payload.snapshot.model_dump(mode="json"),
    )
    db.add(fit)
    db.commit()
    db.refresh(fit)
    return _out(fit)


@router.get("/{fit_id}", response_model=FitOut)
def get_fit(fit_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> FitOut:
    return _out(_own_fit(db, user, fit_id))


@router.patch("/{fit_id}", response_model=FitOut)
def rename_fit(
    fit_id: str,
    payload: FitRename,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FitOut:
    fit = _own_fit(db, user, fit_id)
    fit.name = payload.name
    db.commit()
    db.refresh(fit)
    return _out(fit)


@router.delete("/{fit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fit(fit_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    fit = _own_fit(db, user, fit_id)
    db.delete(fit)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
