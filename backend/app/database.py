"""
Database layer — supports SQLite (default) and PostgreSQL.

Set DATABASE_URL env to a postgres:// URL to use Postgres,
otherwise defaults to SQLite in the downloads folder.
"""

import json
import os
from datetime import datetime
from typing import Optional

from app.config import settings

# --- Determine backend ---
USE_POSTGRES = settings.db_is_postgres

if USE_POSTGRES:
    import asyncpg
else:
    import aiosqlite

DB_PATH = os.path.join(settings.download_folder, "animekai.db")  # SQLite only

_pg_pool: Optional["asyncpg.Pool"] = None

_CREATE_TABLE_SQLITE = """
CREATE TABLE IF NOT EXISTS download_jobs (
    job_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_url           TEXT NOT NULL,
    anime_title         TEXT,
    media_type          TEXT NOT NULL DEFAULT 'tv',
    season              INTEGER,
    config              TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'initializing',
    progress            INTEGER NOT NULL DEFAULT 0,
    current_episode     TEXT,
    total_episodes      INTEGER NOT NULL DEFAULT 0,
    completed_episodes  INTEGER NOT NULL DEFAULT 0,
    error               TEXT,
    downloaded_files    TEXT NOT NULL DEFAULT '[]',
    merged_file         TEXT,
    logs                TEXT NOT NULL DEFAULT '[]',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,
    start_time          TEXT NOT NULL,
    end_time            TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_TABLE_PG = """
CREATE TABLE IF NOT EXISTS download_jobs (
    job_id              SERIAL PRIMARY KEY,
    anime_url           TEXT NOT NULL,
    anime_title         TEXT,
    media_type          TEXT NOT NULL DEFAULT 'tv',
    season              INTEGER,
    config              TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'initializing',
    progress            INTEGER NOT NULL DEFAULT 0,
    current_episode     TEXT,
    total_episodes      INTEGER NOT NULL DEFAULT 0,
    completed_episodes  INTEGER NOT NULL DEFAULT 0,
    error               TEXT,
    downloaded_files    TEXT NOT NULL DEFAULT '[]',
    merged_file         TEXT,
    logs                TEXT NOT NULL DEFAULT '[]',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,
    start_time          TEXT NOT NULL,
    end_time            TEXT,
    created_at          TEXT NOT NULL DEFAULT (now()::text)
);
"""

# Migration: add media_type column if missing
_MIGRATE_MEDIA_TYPE_SQLITE = """
ALTER TABLE download_jobs ADD COLUMN media_type TEXT NOT NULL DEFAULT 'tv';
"""
_MIGRATE_MEDIA_TYPE_PG = """
ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'tv';
"""


# ===================== Init =====================

async def init_db():
    if USE_POSTGRES:
        global _pg_pool
        _pg_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
        async with _pg_pool.acquire() as conn:
            await conn.execute(_CREATE_TABLE_PG)
            await conn.execute(_MIGRATE_MEDIA_TYPE_PG)
    else:
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(_CREATE_TABLE_SQLITE)
            # migrate old tables
            try:
                await db.execute(_MIGRATE_MEDIA_TYPE_SQLITE)
            except Exception:
                pass  # column already exists
            await db.commit()


async def check_db() -> str:
    """Quick connectivity check. Returns detail string."""
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return f"PostgreSQL ({settings.database_url.split('@')[-1] if '@' in settings.database_url else 'connected'})"
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("SELECT 1")
        return f"SQLite ({DB_PATH})"


async def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    return _pg_pool


# ===================== CRUD =====================

async def create_job(anime_url: str, config: dict, max_retries: int = 3, media_type: str = "tv") -> int:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO download_jobs
                   (anime_url, config, status, start_time, max_retries, media_type)
                   VALUES ($1, $2, 'initializing', $3, $4, $5)
                   RETURNING job_id""",
                anime_url, json.dumps(config), datetime.now().isoformat(), max_retries, media_type,
            )
            return row["job_id"]
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """INSERT INTO download_jobs
                   (anime_url, config, status, start_time, max_retries, media_type)
                   VALUES (?, ?, 'initializing', ?, ?, ?)""",
                (anime_url, json.dumps(config), datetime.now().isoformat(), max_retries, media_type),
            )
            await db.commit()
            return cursor.lastrowid


async def update_job(job_id: int, **fields):
    if not fields:
        return
    for key in ("downloaded_files", "logs", "config"):
        if key in fields and not isinstance(fields[key], str):
            fields[key] = json.dumps(fields[key])

    if USE_POSTGRES:
        pool = await _get_pg_pool()
        cols = ", ".join(f"{k} = ${i+1}" for i, k in enumerate(fields))
        vals = list(fields.values())
        vals.append(job_id)
        async with pool.acquire() as conn:
            await conn.execute(
                f"UPDATE download_jobs SET {cols} WHERE job_id = ${len(vals)}",
                *vals,
            )
    else:
        cols = ", ".join(f"{k} = ?" for k in fields)
        vals = list(fields.values())
        vals.append(job_id)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(f"UPDATE download_jobs SET {cols} WHERE job_id = ?", vals)
            await db.commit()


async def get_job(job_id: int) -> Optional[dict]:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM download_jobs WHERE job_id = $1", job_id)
            return _record_to_dict(row) if row else None
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM download_jobs WHERE job_id = ?", (job_id,))
            row = await cursor.fetchone()
            return _row_to_dict(row) if row else None


async def list_jobs() -> list[dict]:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM download_jobs ORDER BY job_id DESC")
            return [_record_to_dict(r) for r in rows]
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM download_jobs ORDER BY job_id DESC")
            rows = await cursor.fetchall()
            return [_row_to_dict(r) for r in rows]


async def delete_job(job_id: int) -> bool:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM download_jobs WHERE job_id = $1 AND status IN ('completed', 'failed')",
                job_id,
            )
            return result.split()[-1] != "0"
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM download_jobs WHERE job_id = ? AND status IN ('completed', 'failed')",
                (job_id,),
            )
            await db.commit()
            return cursor.rowcount > 0


async def get_retryable_jobs() -> list[dict]:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM download_jobs WHERE status = 'failed' AND retry_count < max_retries ORDER BY job_id"
            )
            return [_record_to_dict(r) for r in rows]
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM download_jobs WHERE status = 'failed' AND retry_count < max_retries ORDER BY job_id"
            )
            rows = await cursor.fetchall()
            return [_row_to_dict(r) for r in rows]


async def get_interrupted_jobs() -> list[dict]:
    if USE_POSTGRES:
        pool = await _get_pg_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM download_jobs WHERE status NOT IN ('completed', 'failed') ORDER BY job_id"
            )
            return [_record_to_dict(r) for r in rows]
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM download_jobs WHERE status NOT IN ('completed', 'failed') ORDER BY job_id"
            )
            rows = await cursor.fetchall()
            return [_row_to_dict(r) for r in rows]


# ===================== Row Helpers =====================

def _parse_json_fields(d: dict) -> dict:
    for key in ("downloaded_files", "logs", "config"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                d[key] = [] if key != "config" else {}
    return d


def _add_elapsed(d: dict) -> dict:
    start = d.get("start_time")
    end = d.get("end_time")
    if end:
        try:
            d["elapsed_seconds"] = int((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds())
        except Exception:
            d["elapsed_seconds"] = None
    elif start:
        try:
            d["elapsed_seconds"] = int((datetime.now() - datetime.fromisoformat(start)).total_seconds())
        except Exception:
            d["elapsed_seconds"] = None
    else:
        d["elapsed_seconds"] = None
    return d


def _row_to_dict(row) -> dict:
    """SQLite Row -> dict"""
    d = dict(row)
    _parse_json_fields(d)
    return _add_elapsed(d)


def _record_to_dict(record) -> dict:
    """asyncpg Record -> dict"""
    d = dict(record)
    _parse_json_fields(d)
    return _add_elapsed(d)
