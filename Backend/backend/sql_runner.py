import re
import sqlite3
from typing import Any, Dict, List

DB_PATH = "database.sqlite"
FORBIDDEN = ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "ATTACH")


def _get_db_tables() -> List[str]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        names = [row[0] for row in cur.fetchall()]
        conn.close()
        return names
    except Exception:
        return []


def extract_queried_tables(sql: str) -> List[str]:
    """Extract table names referenced by FROM/JOIN and validate against actual DB tables."""
    normalized_sql = _normalize_sql(sql)
    if not normalized_sql:
        return []

    candidates = []
    # Matches identifiers that appear after FROM/JOIN, including quoted names.
    pattern = re.compile(r'(?is)\b(?:FROM|JOIN)\s+([`"\[]?[A-Za-z_][A-Za-z0-9_\.]*[`"\]]?)')
    for match in pattern.finditer(normalized_sql):
        token = match.group(1).strip()
        token = token.strip('`"[]')
        # Handle schema-qualified names if present.
        if "." in token:
            token = token.split(".")[-1]
        if token:
            candidates.append(token)

    if not candidates:
        return []

    existing_tables = {name.lower(): name for name in _get_db_tables()}
    deduped = []
    seen = set()
    for token in candidates:
        lowered = token.lower()
        if lowered in existing_tables and lowered not in seen:
            deduped.append(existing_tables[lowered])
            seen.add(lowered)

    return deduped


def _normalize_sql(sql: str) -> str:
    cleaned = (sql or "").strip()
    cleaned = cleaned.rstrip(";")

    # Convert Oracle-style ROWNUM filter to SQLite LIMIT when possible.
    match = re.search(r"(?is)\bWHERE\s+ROWNUM\s*<=\s*(\d+)\b", cleaned)
    if match:
        limit = match.group(1)
        cleaned = re.sub(r"(?is)\bWHERE\s+ROWNUM\s*<=\s*\d+\b", "", cleaned).strip()
        cleaned = f"{cleaned} LIMIT {limit}"

    return cleaned


def _is_read_only_sql(sql: str) -> bool:
    upper_sql = sql.strip().upper()
    if not upper_sql.startswith("SELECT") and not upper_sql.startswith("WITH"):
        return False
    return not any(keyword in upper_sql for keyword in FORBIDDEN)


def execute_read_only_sql(sql: str, max_rows: int = 200) -> Dict[str, Any]:
    normalized_sql = _normalize_sql(sql)
    queried_tables = extract_queried_tables(normalized_sql)

    if not normalized_sql:
        return {
            "ok": False,
            "error": "Empty SQL generated.",
            "rows": [],
            "columns": [],
            "queried_tables": queried_tables,
            "row_count": 0,
            "truncated": False,
            "executed_sql": normalized_sql,
        }

    if not _is_read_only_sql(normalized_sql):
        return {
            "ok": False,
            "error": "Only read-only SELECT/WITH SQL is allowed.",
            "rows": [],
            "columns": [],
            "queried_tables": queried_tables,
            "row_count": 0,
            "truncated": False,
            "executed_sql": normalized_sql,
        }

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(normalized_sql)

        fetched_rows: List[sqlite3.Row] = cur.fetchmany(max_rows + 1)
        truncated = len(fetched_rows) > max_rows
        if truncated:
            fetched_rows = fetched_rows[:max_rows]

        rows = [dict(row) for row in fetched_rows]
        columns = list(rows[0].keys()) if rows else []

        conn.close()
        return {
            "ok": True,
            "error": None,
            "rows": rows,
            "columns": columns,
            "queried_tables": queried_tables,
            "row_count": len(rows),
            "truncated": truncated,
            "executed_sql": normalized_sql,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "rows": [],
            "columns": [],
            "queried_tables": queried_tables,
            "row_count": 0,
            "truncated": False,
            "executed_sql": normalized_sql,
        }
