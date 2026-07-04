from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    bikes: Mapped[list["Bike"]] = relationship(back_populates="submitted_by", cascade="all, delete-orphan")


class Bike(Base):
    __tablename__ = "bike"

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    submitted_by_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    brand: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    launch_year: Mapped[int] = mapped_column(nullable=False)
    model_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    flagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    flagged_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    submitted_by: Mapped[User] = relationship(back_populates="bikes")

    __table_args__ = (
        Index(
            "ix_bike_unique_active",
            func.lower(brand),
            func.lower(model),
            "launch_year",
            unique=True,
            sqlite_where=flagged_at.is_(None),
        ),
        Index("ix_bike_brand_lower", func.lower(brand)),
    )
