from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CamelotObject(Base):
    __tablename__ = 'objects'
    __table_args__ = (Index('ix_objects_type_status', 'type', 'status'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default='active', index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey('objects.id', ondelete='SET NULL'), nullable=True, index=True)
    metadata_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)

    project = relationship('CamelotObject', remote_side='CamelotObject.id', foreign_keys=[project_id], backref='scoped_objects')
    outgoing = relationship('Relationship', foreign_keys='Relationship.source_id', back_populates='source', cascade='all, delete-orphan')
    incoming = relationship('Relationship', foreign_keys='Relationship.target_id', back_populates='target', cascade='all, delete-orphan')
    events = relationship('Event', back_populates='object', cascade='all, delete-orphan')
    attachments = relationship('Attachment', back_populates='object', cascade='all, delete-orphan')


class Relationship(Base):
    __tablename__ = 'relationships'
    __table_args__ = (
        UniqueConstraint('source_id', 'target_id', 'type', name='uq_relationship'),
        Index('ix_relationship_source_target', 'source_id', 'target_id'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey('objects.id', ondelete='CASCADE'), nullable=False, index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey('objects.id', ondelete='CASCADE'), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    source = relationship('CamelotObject', foreign_keys=[source_id], back_populates='outgoing')
    target = relationship('CamelotObject', foreign_keys=[target_id], back_populates='incoming')


class Event(Base):
    __tablename__ = 'events'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int | None] = mapped_column(ForeignKey('objects.id', ondelete='CASCADE'), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False, default='You')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    object = relationship('CamelotObject', back_populates='events')


class Member(Base):
    __tablename__ = 'members'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    initials: Mapped[str] = mapped_column(String(8), nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='online', index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey('objects.id', ondelete='SET NULL'), nullable=True, index=True)


class Attachment(Base):
    __tablename__ = 'attachments'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int | None] = mapped_column(ForeignKey('objects.id', ondelete='CASCADE'), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_name: Mapped[str | None] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(Text)
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    object = relationship('CamelotObject', back_populates='attachments')
