from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DEFAULT_DB_URL = "sqlite:///./bikegeo.db"
DB_URL = os.environ.get("BIKEGEO_DB_URL", DEFAULT_DB_URL)

_connect_args: dict[str, object] = {}
if DB_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(DB_URL, connect_args=_connect_args, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models_db  # noqa: F401  ensure models register

    Base.metadata.create_all(bind=engine)
