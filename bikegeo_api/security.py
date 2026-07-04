from __future__ import annotations

import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.hash import argon2
from sqlalchemy.orm import Session

from .db import get_db
from .models_db import User

SESSION_COOKIE_NAME = "bgsession"
SESSION_TTL_SECONDS = 14 * 24 * 60 * 60  # 14 days
SESSION_REFRESH_THRESHOLD_SECONDS = 24 * 60 * 60  # refresh if <1 day used (sliding)

APP_ENV = os.environ.get("APP_ENV", "dev")
_SECRET_KEY = os.environ.get("SECRET_KEY")
if not _SECRET_KEY:
    if APP_ENV == "prod":
        raise RuntimeError("SECRET_KEY env var is required in prod")
    _SECRET_KEY = "dev-insecure-secret-change-me"

_serializer = URLSafeTimedSerializer(_SECRET_KEY, salt="bikegeo-session")


def hash_password(password: str) -> str:
    return argon2.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return argon2.verify(password, password_hash)
    except (ValueError, TypeError):
        return False


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def make_session_token(user_id: str) -> str:
    return _serializer.dumps({"uid": user_id, "n": secrets.token_hex(8)})


def parse_session_token(token: str) -> str | None:
    try:
        data = _serializer.loads(token, max_age=SESSION_TTL_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict):
        return None
    uid = data.get("uid")
    return uid if isinstance(uid, str) else None


def set_session_cookie(response: Response, user_id: str) -> None:
    token = make_session_token(user_id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=APP_ENV == "prod",
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


def invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid_credentials",
    )


def _resolve_user(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    uid = parse_session_token(token)
    if not uid:
        return None
    return db.get(User, uid)


def current_user(
    bgsession: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    user = _resolve_user(bgsession, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    return user


def current_user_optional(
    bgsession: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User | None:
    return _resolve_user(bgsession, db)


__all__ = [
    "SESSION_COOKIE_NAME",
    "SESSION_TTL_SECONDS",
    "hash_password",
    "verify_password",
    "constant_time_eq",
    "make_session_token",
    "parse_session_token",
    "set_session_cookie",
    "clear_session_cookie",
    "invalid_credentials",
    "current_user",
    "current_user_optional",
]
