from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import User
from ..schemas_auth import LoginRequest, RegisterRequest, UserOut
from ..security import (
    clear_session_cookie,
    current_user,
    hash_password,
    invalid_credentials,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Pre-computed argon2 hash of a value that will never be a real password,
# used to spend equivalent CPU on the no-such-user login branch.
_DUMMY_ARGON2_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$sbaWMsYYg9D6X6t1jtG6lw$"
    "UwQhGQgRWHTHdV3JoC52egMxvV1+zbkylIO6HIo+rCU"
)


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, created_at=user.created_at)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> UserOut:
    email_normalized = payload.email.lower().strip()

    existing = db.query(User).filter(func.lower(User.email) == email_normalized).first()
    # Email enumeration via the 409 is accepted; login is the hardened path
    # (see _DUMMY_ARGON2_HASH above).
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="registration_failed")

    user = User(email=email_normalized, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    set_session_cookie(response, user.id)
    return _user_out(user)


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> UserOut:
    email_normalized = payload.email.lower().strip()
    user = db.query(User).filter(func.lower(User.email) == email_normalized).first()

    if user is None:
        verify_password(payload.password, _DUMMY_ARGON2_HASH)
        raise invalid_credentials()

    if not verify_password(payload.password, user.password_hash):
        raise invalid_credentials()

    set_session_cookie(response, user.id)
    return _user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return _user_out(user)
