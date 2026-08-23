"""
core/db.py

SQLite Database Engine & Auto-Migration.
Replaces flat JSON storage with an indexed SQLite database at data/redirector.db.
"""

import os
import json
import time
import sqlite3
from contextlib import contextmanager

from core.logger import logger

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "redirector.db")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Create tables and indexes if missing, and auto-migrate from JSON files."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT,
                handle TEXT,
                url TEXT,
                product_type TEXT,
                tags_json TEXT,
                image_url TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_handle ON products(handle)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY,
                broken_url TEXT UNIQUE,
                extracted_name TEXT,
                matches_json TEXT,
                custom_target TEXT,
                status TEXT DEFAULT 'pending',
                chosen_index INTEGER DEFAULT 0,
                applied_redirect_id TEXT,
                http_status INTEGER,
                http_label TEXT,
                error TEXT,
                skipped_msg TEXT,
                source TEXT,
                created_at REAL,
                updated_at REAL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_url ON matches(broken_url)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_pattern TEXT,
                to_template TEXT,
                enabled INTEGER DEFAULT 1
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                url TEXT PRIMARY KEY,
                last_checked REAL,
                last_status INTEGER
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS token_cache (
                key TEXT PRIMARY KEY,
                value_json TEXT,
                updated_at REAL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT,
                payload_json TEXT,
                status TEXT DEFAULT 'pending',
                created_at REAL,
                processed_at REAL
            )
        """)
        conn.commit()

    auto_migrate_from_json()


def auto_migrate_from_json():
    """Migrate legacy JSON files into SQLite DB if database tables are empty."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Migrate products.json
        cursor.execute("SELECT COUNT(*) FROM products")
        if cursor.fetchone()[0] == 0:
            prod_path = _find_file("products.json")
            if os.path.exists(prod_path):
                try:
                    with open(prod_path, encoding="utf-8") as f:
                        prods = json.load(f)
                    cursor.executemany("""
                        INSERT OR REPLACE INTO products (id, title, handle, url, product_type, tags_json, image_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, [
                        (p["id"], p["title"], p["handle"], p["url"], p.get("product_type", ""), json.dumps(p.get("tags", [])), p.get("image_url", ""))
                        for p in prods
                    ])
                    logger.info(f"Migrated {len(prods)} products from JSON to SQLite database.")
                except Exception as e:
                    logger.error(f"Failed to migrate products.json: {e}")

        # Migrate matches.json
        cursor.execute("SELECT COUNT(*) FROM matches")
        if cursor.fetchone()[0] == 0:
            match_path = _find_file("matches.json")
            if os.path.exists(match_path):
                try:
                    with open(match_path, encoding="utf-8") as f:
                        matches = json.load(f)
                    now = time.time()
                    cursor.executemany("""
                        INSERT OR REPLACE INTO matches
                        (id, broken_url, extracted_name, matches_json, custom_target, status, chosen_index, applied_redirect_id, http_status, http_label, error, skipped_msg, source, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, [
                        (
                            m.get("id", i),
                            m["broken_url"],
                            m.get("extracted_name", ""),
                            json.dumps(m.get("matches", [])),
                            m.get("custom_target"),
                            m.get("status", "pending"),
                            m.get("chosen_index", 0),
                            m.get("applied_redirect_id"),
                            m.get("http_status"),
                            m.get("http_label"),
                            m.get("error"),
                            m.get("skipped_msg"),
                            m.get("source", "manual"),
                            now, now
                        )
                        for i, m in enumerate(matches)
                    ])
                    logger.info(f"Migrated {len(matches)} matches from JSON to SQLite database.")
                except Exception as e:
                    logger.error(f"Failed to migrate matches.json: {e}")

        # Migrate patterns.json
        cursor.execute("SELECT COUNT(*) FROM patterns")
        if cursor.fetchone()[0] == 0:
            pat_path = _find_file("patterns.json")
            if os.path.exists(pat_path):
                try:
                    with open(pat_path, encoding="utf-8") as f:
                        pats = json.load(f)
                    cursor.executemany("""
                        INSERT OR REPLACE INTO patterns (id, from_pattern, to_template, enabled)
                        VALUES (?, ?, ?, ?)
                    """, [(p.get("id", i+1), p["from_pattern"], p["to_template"], 1 if p.get("enabled", True) else 0) for i, p in enumerate(pats)])
                    logger.info(f"Migrated {len(pats)} pattern rules to SQLite database.")
                except Exception as e:
                    logger.error(f"Failed to migrate patterns.json: {e}")

        # Migrate watchlist.json
        cursor.execute("SELECT COUNT(*) FROM watchlist")
        if cursor.fetchone()[0] == 0:
            watch_path = _find_file("watchlist.json")
            if os.path.exists(watch_path):
                try:
                    with open(watch_path, encoding="utf-8") as f:
                        watch = json.load(f)
                    cursor.executemany("""
                        INSERT OR REPLACE INTO watchlist (url, last_checked, last_status)
                        VALUES (?, ?, ?)
                    """, [(w["url"], w.get("last_checked"), w.get("last_status")) for w in watch])
                    logger.info(f"Migrated {len(watch)} watchlist URLs to SQLite database.")
                except Exception as e:
                    logger.error(f"Failed to migrate watchlist.json: {e}")

        conn.commit()


def _find_file(filename):
    p1 = os.path.join(DATA_DIR, filename)
    if os.path.exists(p1):
        return p1
    return filename


# ---------------------------------------------------------------------------
# Database Access Functions
# ---------------------------------------------------------------------------
def get_all_products():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM products").fetchall()
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "handle": r["handle"],
                "url": r["url"],
                "product_type": r["product_type"],
                "tags": json.loads(r["tags_json"] or "[]"),
                "image_url": r["image_url"],
            }
            for r in rows
        ]


def replace_all_products(products_list):
    with get_db() as conn:
        conn.execute("DELETE FROM products")
        conn.executemany("""
            INSERT INTO products (id, title, handle, url, product_type, tags_json, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (p["id"], p["title"], p["handle"], p["url"], p.get("product_type", ""), json.dumps(p.get("tags", [])), p.get("image_url", ""))
            for p in products_list
        ])
        conn.commit()


def get_all_matches():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM matches ORDER BY id DESC").fetchall()
        return [_row_to_match_dict(r) for r in rows]


def get_match_by_id(match_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
        return _row_to_match_dict(row) if row else None


def upsert_match(match_dict):
    now = time.time()
    with get_db() as conn:
        conn.execute("""
            INSERT INTO matches
            (id, broken_url, extracted_name, matches_json, custom_target, status, chosen_index, applied_redirect_id, http_status, http_label, error, skipped_msg, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                broken_url=excluded.broken_url,
                extracted_name=excluded.extracted_name,
                matches_json=excluded.matches_json,
                custom_target=excluded.custom_target,
                status=excluded.status,
                chosen_index=excluded.chosen_index,
                applied_redirect_id=excluded.applied_redirect_id,
                http_status=excluded.http_status,
                http_label=excluded.http_label,
                error=excluded.error,
                skipped_msg=excluded.skipped_msg,
                updated_at=excluded.updated_at
        """, (
            match_dict.get("id"),
            match_dict["broken_url"],
            match_dict.get("extracted_name", ""),
            json.dumps(match_dict.get("matches", [])),
            match_dict.get("custom_target"),
            match_dict.get("status", "pending"),
            match_dict.get("chosen_index", 0),
            match_dict.get("applied_redirect_id"),
            match_dict.get("http_status"),
            match_dict.get("http_label"),
            match_dict.get("error"),
            match_dict.get("skipped_msg"),
            match_dict.get("source", "manual"),
            match_dict.get("created_at", now),
            now
        ))
        conn.commit()


def update_match_fields(match_id, **fields):
    if not fields:
        return
    fields["updated_at"] = time.time()
    set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
    values = list(fields.values()) + [match_id]
    with get_db() as conn:
        conn.execute(f"UPDATE matches SET {set_clause} WHERE id = ?", values)
        conn.commit()


def get_next_match_id():
    with get_db() as conn:
        row = conn.execute("SELECT MAX(id) FROM matches").fetchone()
        max_id = row[0]
        return (max_id + 1) if max_id is not None else 0


def get_all_patterns():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM patterns ORDER BY id ASC").fetchall()
        return [
            {
                "id": r["id"],
                "from_pattern": r["from_pattern"],
                "to_template": r["to_template"],
                "enabled": bool(r["enabled"]),
            }
            for r in rows
        ]


def add_pattern(from_pattern, to_template):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO patterns (from_pattern, to_template, enabled) VALUES (?, ?, 1)", (from_pattern, to_template))
        conn.commit()
        return {"id": cursor.lastrowid, "from_pattern": from_pattern, "to_template": to_template, "enabled": True}


def toggle_pattern(pattern_id):
    with get_db() as conn:
        row = conn.execute("SELECT enabled FROM patterns WHERE id = ?", (pattern_id,)).fetchone()
        if not row:
            return None
        new_val = 0 if row["enabled"] else 1
        conn.execute("UPDATE patterns SET enabled = ? WHERE id = ?", (new_val, pattern_id))
        conn.commit()
        return bool(new_val)


def delete_pattern(pattern_id):
    with get_db() as conn:
        conn.execute("DELETE FROM patterns WHERE id = ?", (pattern_id,))
        conn.commit()


def get_all_watchlist():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY url ASC").fetchall()
        return [
            {"url": r["url"], "last_checked": r["last_checked"], "last_status": r["last_status"]}
            for r in rows
        ]


def add_watchlist_url(url):
    with get_db() as conn:
        conn.execute("INSERT OR IGNORE INTO watchlist (url, last_checked, last_status) VALUES (?, NULL, NULL)", (url,))
        conn.commit()


def update_watchlist_status(url, status_code):
    with get_db() as conn:
        conn.execute("UPDATE watchlist SET last_checked = ?, last_status = ? WHERE url = ?", (time.time(), status_code, url))
        conn.commit()


def bulk_add_watchlist(urls):
    with get_db() as conn:
        conn.executemany("INSERT OR IGNORE INTO watchlist (url, last_checked, last_status) VALUES (?, NULL, NULL)", [(u,) for u in urls])
        conn.commit()


def enqueue_task(task_type, payload_dict):
    now = time.time()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO task_queue (task_type, payload_json, status, created_at) VALUES (?, ?, 'pending', ?)", (task_type, json.dumps(payload_dict), now))
        conn.commit()
        return cursor.lastrowid


def dequeue_task():
    with get_db() as conn:
        cursor = conn.cursor()
        row = cursor.execute("SELECT * FROM task_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1").fetchone()
        if not row:
            return None
        cursor.execute("UPDATE task_queue SET status = 'processing' WHERE id = ?", (row["id"],))
        conn.commit()
        return {
            "id": row["id"],
            "task_type": row["task_type"],
            "payload": json.loads(row["payload_json"] or "{}"),
        }


def complete_task(task_id, error=None):
    status = "failed" if error else "completed"
    with get_db() as conn:
        conn.execute("UPDATE task_queue SET status = ?, processed_at = ? WHERE id = ?", (status, time.time(), task_id))
        conn.commit()


def _row_to_match_dict(r):
    return {
        "id": r["id"],
        "broken_url": r["broken_url"],
        "extracted_name": r["extracted_name"],
        "matches": json.loads(r["matches_json"] or "[]"),
        "custom_target": r["custom_target"],
        "status": r["status"],
        "chosen_index": r["chosen_index"],
        "applied_redirect_id": r["applied_redirect_id"],
        "http_status": r["http_status"],
        "http_label": r["http_label"],
        "error": r["error"],
        "skipped_msg": r["skipped_msg"],
        "source": r["source"],
    }
