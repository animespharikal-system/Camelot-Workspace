from pathlib import Path
import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / 'camelot.db'
DATABASE_URL = os.getenv('DATABASE_URL') or f'sqlite:///{DB_PATH.as_posix()}'

engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_legacy() -> None:
    """Small idempotent SQLite compatibility migration for existing hackathon DBs."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        if 'objects' in tables:
            cols = {c['name'] for c in insp.get_columns('objects')}
            if 'status' not in cols:
                conn.execute(text("ALTER TABLE objects ADD COLUMN status VARCHAR(40) NOT NULL DEFAULT 'active'"))
            if 'metadata_json' not in cols:
                conn.execute(text("ALTER TABLE objects ADD COLUMN metadata_json TEXT"))
            if 'project_id' not in cols:
                conn.execute(text("ALTER TABLE objects ADD COLUMN project_id INTEGER"))
        if 'relationships' in tables:
            cols = {c['name'] for c in insp.get_columns('relationships')}
            if 'weight' not in cols:
                conn.execute(text("ALTER TABLE relationships ADD COLUMN weight INTEGER NOT NULL DEFAULT 1"))
        if 'events' in tables:
            cols = {c['name'] for c in insp.get_columns('events')}
            if 'actor' not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN actor VARCHAR(120) NOT NULL DEFAULT 'You'"))
