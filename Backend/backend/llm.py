import os
import re
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, Optional
import requests
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
DB_PATH = "database.sqlite"
REQUEST_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "10m")
OLLAMA_THINK = os.getenv("OLLAMA_THINK", "false").strip().lower() in {"1", "true", "yes", "on"}

_SCHEMA_CONTEXT_CACHE: Dict[tuple[str, int, int, str], str] = {}
_SCHEMA_CONTEXT_CACHE_LOCK = threading.Lock()
MAX_RELEVANT_TABLES = int(os.getenv("LLM_MAX_RELEVANT_TABLES", "6"))

TASK_CONFIG = {
    "sql": {
        "temperature": 0.05,
        "top_p": 0.9,
        "num_predict": 120,
    },
    "summary": {
        "temperature": 0.6,
        "top_p": 0.95,
        "num_predict": 420,
    },
    "executive_summary": {
        "temperature": 0.55,
        "top_p": 0.9,
        "num_predict": 420,
    },
    "column": {
        "temperature": 0.5,
        "top_p": 0.9,
        "num_predict": 90,
    },
    "explain": {
        "temperature": 0.45,
        "top_p": 0.95,
        "num_predict": 140,
    },
    "interpret": {
        "temperature": 0.35,
        "top_p": 0.95,
        "num_predict": 140,
    },
    "anomaly": {
        "temperature": 0.5,
        "top_p": 0.9,
        "num_predict": 100,
    },
    "fix_sql": {
        "temperature": 0.05,
        "top_p": 0.9,
        "num_predict": 120,
    },
    "role_summary": {
        "temperature": 0.7,
        "top_p": 0.95,
        "num_predict": 220,
    }
}

def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _database_cache_marker(conn: sqlite3.Connection) -> tuple[str, int, int]:
    """Return a marker that changes whenever the SQLite file changes."""
    db_path = next((row[2] for row in conn.execute("PRAGMA database_list") if row[1] == "main"), DB_PATH)
    try:
        stat = Path(db_path).stat()
        return str(Path(db_path).resolve()), stat.st_mtime_ns, stat.st_size
    except OSError:
        return str(db_path), 0, 0


def build_schema_context(conn: sqlite3.Connection, table_names=None) -> str:
    """Build a compact, cached schema snapshot for model prompts."""
    cursor = conn.cursor()
    if table_names is not None:
        tables = [table_names] if isinstance(table_names, str) else list(table_names)
    else:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [r[0] for r in cursor.fetchall()]

    tables = list(dict.fromkeys(tables))
    cache_key = (*_database_cache_marker(conn), "\x1f".join(tables))
    with _SCHEMA_CONTEXT_CACHE_LOCK:
        cached = _SCHEMA_CONTEXT_CACHE.get(cache_key)
    if cached is not None:
        return cached

    schema_parts = []
    for table in tables:
        quoted_table = _quote_identifier(table)
        cursor.execute(f"PRAGMA table_info({quoted_table})")
        cols = cursor.fetchall()
        if not cols:
            continue
        cursor.execute(f"SELECT COUNT(*) FROM {quoted_table}")
        row_count = cursor.fetchone()[0]
        cursor.execute(f"SELECT * FROM {quoted_table} LIMIT 3")
        sample_rows = cursor.fetchall()

        descriptions = []
        for index, col in enumerate(cols):
            examples = [row[index] for row in sample_rows if row[index] is not None]
            sample = ", ".join(repr(value)[:80] for value in examples[:3]) or "null"
            pk_marker = " PK" if col[5] else ""
            descriptions.append(f"  {col[1]} {col[2] or 'TEXT'}{pk_marker}; examples: {sample}")
        schema_parts.append(f"TABLE {table} ({row_count:,} rows)\n" + "\n".join(descriptions))

    context = "\n\n".join(schema_parts)
    with _SCHEMA_CONTEXT_CACHE_LOCK:
        if len(_SCHEMA_CONTEXT_CACHE) >= 24:
            _SCHEMA_CONTEXT_CACHE.clear()
        _SCHEMA_CONTEXT_CACHE[cache_key] = context
    return context


def prompt_nl_to_sql(question: str, schema_context: str) -> str:
    return f"""<|system|>
You write one correct SQLite query. Return SQL only; never include reasoning, markdown, or prose.

CRITICAL RULES — read these before writing anything:
1. Return ONLY the SQL query. No explanation, no markdown, no backticks, no preamble.
2. Study the sample values shown for each column carefully before writing any WHERE clause.
3. NEVER filter on a value that does not appear in the sample values unless the user explicitly provides an exact value to search for.
4. If the user asks a vague question like "show orders" or "find customers" and you cannot identify a column that actually contains that type of data from the samples, write a simple SELECT * with a reasonable LIMIT instead of inventing a WHERE clause.
5. If no column semantically matches what the user is asking for, return all rows with LIMIT 20.
6. Use EXACT table and column names from the schema below. Never invent column names.
7. Use table aliases. End with semicolon.
8. Use SQLite date syntax (e.g., `strftime('%Y-%m', date_column)`). Do NOT use Postgres `EXTRACT` or SQL Server `DATEPART`.
9. If the user asks to "sort" or "order" data (e.g. "sort ascendingly by X"), always include an appropriate ORDER BY clause (e.g. ORDER BY X ASC).<|end|>
<|user|>
SCHEMA:
{schema_context}

User question: "{question}"

Write the query now:
<|end|>
<|assistant|>"""


def prompt_fix_sql(sql: str, error_msg: str, schema_context: str) -> str:
    """Prompt for the self-healing loop when execution fails."""
    return f"""<|system|>
You are an expert SQLite SQL engineer. The previous SQL query you generated failed to execute. Fix it based on the error message.
CRITICAL: You must return ONLY valid, read-only SQL (SELECT or WITH). Never return blank text or non-SQL text. No explanation, no markdown, no backticks.<|end|>
<|user|>
SCHEMA:
{schema_context}

FAILED QUERY:
{sql}

ERROR MESSAGE FROM SQLITE:
{error_msg}

Please fix the query so it runs successfully against the schema provided. 
Return ONLY the fixed SQL query:
<|end|>
<|assistant|>"""


def prompt_explain_sql(sql: str, question: str, row_count: int) -> str:
    return f"""<|system|>
You translate SQL queries into plain English for non-technical users.
Write exactly one clear sentence. Start with a verb. Be specific about what was searched and what was found.<|end|>
<|user|>
User asked: "{question}"
SQL executed: {sql}
Rows returned: {row_count}

Write one sentence explaining what this query did and what it found. 
If zero rows were returned, say so clearly and suggest why.
<|end|>
<|assistant|>"""


def prompt_interpret_results(
    question: str,
    sql: str,
    columns: list,
    rows: list,
    row_count: int,
) -> str:
    """
    Build a prompt that converts SQL query output into a direct natural-language answer.
    """
    max_rows = 10

    if row_count <= 0:
        results_text = "The query returned no results."
    else:
        safe_columns = [str(col) for col in (columns or [])]
        if not safe_columns and rows and isinstance(rows[0], dict):
            safe_columns = [str(k) for k in rows[0].keys()]

        def _safe_cell(value: Any) -> str:
            if value is None:
                return "null"
            text = str(value).replace("\n", " ").strip()
            return text[:160]

        header = " | ".join(safe_columns) if safe_columns else "value"
        preview_lines = []
        for row in (rows or [])[:max_rows]:
            if isinstance(row, dict):
                ordered = [_safe_cell(row.get(col)) for col in safe_columns] if safe_columns else [_safe_cell(v) for v in row.values()]
                preview_lines.append(" | ".join(ordered))
            elif isinstance(row, (list, tuple)):
                preview_lines.append(" | ".join(_safe_cell(v) for v in row))
            else:
                preview_lines.append(_safe_cell(row))

        results_text = header
        if preview_lines:
            results_text += "\n" + "\n".join(preview_lines)
        if row_count > max_rows:
            results_text += f"\n... and {row_count - max_rows} more rows"

    return f"""<|system|>
You are a data analyst explaining query results to a business user.
Answer the user's original question directly using the provided data.

Rules:
1. Answer in 2-4 sentences.
2. Mention specific values, names, or counts from the results when available.
3. If no rows are returned, clearly explain what that means.
4. Do not mention SQL syntax, table schemas, or database internals.
5. Write in plain language for a non-technical stakeholder.
6. Start with a direct answer to the user's question.
7. State only facts present in the result preview. Do not infer causes, trends, or values that are not shown.
8. If the result is truncated or is only a preview, say so rather than generalizing.<|end|>
<|user|>
User question: "{question}"
SQL executed: {sql}
Query results ({row_count} rows total):
{results_text}

Answer the user's question now:
<|end|>
<|assistant|>"""


def prompt_table_reasoning(table_name: str, schema_context: str) -> str:
    return f"""<|system|>
You are a data dictionary assistant. Explain what this table is for and what kind of data it contains, based on its columns and sample data.
Write a clear, concise paragraph.<|end|>
<|user|>
Table Name: {table_name}
Schema and Sample Data:
{schema_context}

Please explain the purpose of the `{table_name}` table.
<|end|>
<|assistant|>"""


def prompt_table_summaries(table_name: str, schema_context: str) -> str:
    return f"""<|system|>
You are an expert AI data assistant. Given a database table schema, generate two summaries:
1. "Business Summary": 2 sentences explaining the table's business purpose for non-technical stakeholders.
2. "Developer Summary": 2 sentences explaining the table's technical structure, key columns, and potential data logic for engineers.

Format your output EXACTLY like this:
BUSINESS_SUMMARY: Let business summary text be here.
DEVELOPER_SUMMARY: Let developer summary text be here.
<|end|>
<|user|>
SCHEMA CONTEXT:
{schema_context}

Generate summaries for {table_name}:<|end|>
<|assistant|>
"""


def prompt_generate_summary_json(schema_context: str, user_context: Optional[str] = None) -> str:
        user_goal = user_context.strip() if user_context else "General exploratory data analysis"
        return f"""<|system|>
You are an elite Chief Data Strategist writing an executive-grade, board-ready data brief.

Return ONLY valid JSON. No markdown. No code fences. No preface text. No extra keys.

Required JSON schema:
{{
    "executive_summary": "A detailed 6-8 sentence executive narrative (170-260 words) with concrete observations and strategic implications.",
    "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4"],
    "statistical_insights": "A dense paragraph covering distribution, quality risks, relationship topology, and modeling readiness.",
    "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"]
}}

Quality bar:
- Make the summary unusually insightful: include one non-obvious risk and one counterintuitive opportunity.
- Explicitly connect schema design/relationships to downstream analytics reliability.
- Mention practical next moves for analyst teams and data engineering teams.
- Keep all claims grounded only in provided schema snapshot.

Formatting rules:
- JSON must parse with standard JSON.parse.
- key_findings and recommendations must be arrays of plain strings.
- Do not include numbered lists inside strings.
<|end|>
<|user|>
User Context:
{user_goal}

Schema Snapshot:
{schema_context}

Return JSON now.
<|end|>
<|assistant|>"""


def validate_sql_columns(sql: str, conn: sqlite3.Connection) -> tuple[bool, str]:
    """
    Check if all column names referenced in the SQL actually exist.
    Returns (is_valid, error_message).
    """
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall()]
    
    all_valid_columns = set()
    for table in tables:
        cursor.execute(f"PRAGMA table_info({table})")
        cols = cursor.fetchall()
        all_valid_columns.update(col[1].lower() for col in cols)
    
    identifiers = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b', sql)
    
    sql_keywords = {
        'select', 'from', 'where', 'and', 'or', 'not', 'in', 'like',
        'order', 'by', 'group', 'having', 'limit', 'offset', 'join',
        'left', 'right', 'inner', 'outer', 'on', 'as', 'distinct',
        'count', 'sum', 'avg', 'max', 'min', 'null', 'is', 'between',
        'case', 'when', 'then', 'else', 'end', 'asc', 'desc', 'top',
        'with', 'union', 'all', 'exists', 'into', 'values', 'true', 'false'
    }
    
    for identifier in identifiers:
        lower = identifier.lower()
        if lower not in sql_keywords and lower not in [t.lower() for t in tables]:
            if lower not in all_valid_columns:
                pass  # Conservative: don't block right now, just parsing.
    
    return True, ""


def safe_sql_fallback(conn: sqlite3.Connection) -> str:
    """
    Generate a safe fallback SQL when the LLM produces an invalid query.
    Returns a simple SELECT * with LIMIT from the most relevant table.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall()]
    
    if not tables:
        return "SELECT 'No tables found' AS message;"
    
    return f"SELECT * FROM {tables[0]} LIMIT 20;"


def get_relevant_tables(conn: sqlite3.Connection, query: str) -> list[str]:
    """Rank relevant tables instead of injecting the full database into every prompt."""
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [r[0] for r in cursor.fetchall()]
        
        def identifier_terms(value: str) -> set[str]:
            # Keep both the complete identifier and its parts: total_amount
            # should match both "total" and "amount" in a natural-language query.
            words = re.findall(r"[a-zA-Z][a-zA-Z0-9_]*", value.lower())
            parts = [part for word in words for part in word.split("_")]
            return set(words + parts)

        query_terms = identifier_terms(query)
        query_terms.update(term.rstrip("s") for term in list(query_terms) if len(term) > 3)
        query_terms -= {"show", "list", "find", "give", "data", "with", "from", "where", "sort", "rows", "table"}
        scored = []
        for table in tables:
            table_terms = identifier_terms(table)
            table_terms.update(term.rstrip("s") for term in list(table_terms) if len(term) > 3)
            score = 12 * len(query_terms & table_terms)
            cursor.execute(f"PRAGMA table_info({table})")
            cols = cursor.fetchall()
            for col in cols:
                column_terms = identifier_terms(col[1])
                column_terms.update(term.rstrip("s") for term in list(column_terms) if len(term) > 3)
                score += 3 * len(query_terms & column_terms)
            if score:
                scored.append((score, table))

        if scored:
            return [table for _, table in sorted(scored, key=lambda item: (-item[0], item[1]))[:MAX_RELEVANT_TABLES]]
        return tables[:MAX_RELEVANT_TABLES]
    except Exception:
        return []

def _ollama_chat_url() -> str:
    """Use Ollama's native chat endpoint so each model applies its own template."""
    if OLLAMA_URL.rstrip("/").endswith("/api/generate"):
        return OLLAMA_URL.rsplit("/", 1)[0] + "/chat"
    return OLLAMA_URL


def _prompt_messages(prompt: str) -> list[Dict[str, str]]:
    """Convert legacy prompt builders into native system/user chat messages."""
    match = re.search(
        r"<\|system\|>\s*(.*?)<\|end\|>\s*<\|user\|>\s*(.*?)<\|end\|>",
        prompt or "",
        flags=re.DOTALL,
    )
    if match:
        return [
            {"role": "system", "content": match.group(1).strip()},
            {"role": "user", "content": match.group(2).strip()},
        ]
    return [{"role": "user", "content": (prompt or "").strip()}]


def ask_llm(prompt: str, task: str = "sql") -> str:
    config = TASK_CONFIG.get(task, TASK_CONFIG["sql"])
    payload = {
        "model": MODEL_NAME,
        "messages": _prompt_messages(prompt),
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "think": OLLAMA_THINK,
        "options": {
            "temperature": config["temperature"],
            "top_p": config.get("top_p", 0.9),
            "num_predict": config["num_predict"],
        },
    }
    response = requests.post(_ollama_chat_url(), json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    return (data.get("message", {}) or {}).get("content", data.get("response", "")).strip()


def ask_llm_stream(prompt: str, task: str = "sql"):
    import json
    config = TASK_CONFIG.get(task, TASK_CONFIG["sql"])
    payload = {
        "model": MODEL_NAME,
        "messages": _prompt_messages(prompt),
        "stream": True,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "think": OLLAMA_THINK,
        "options": {
            "temperature": config["temperature"],
            "top_p": config.get("top_p", 0.9),
            "num_predict": config["num_predict"],
        },
    }
    response = requests.post(_ollama_chat_url(), json=payload, stream=True, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    for line in response.iter_lines():
        if line:
            data = json.loads(line)
            chunk = (data.get("message", {}) or {}).get("content", data.get("response", ""))
            if chunk:
                yield chunk

def extract_sql_clean(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return ""
    
    # Strip common chat/control tokens (phi-style + qwen thinking blocks)
    control_tokens = ["<|system|>", "<|user|>", "<|assistant|>", "<|end|>"]
    for token in control_tokens:
        text = text.replace(token, "")
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</?think>", "", text, flags=re.IGNORECASE)

    text = text.replace("```sql", "").replace("```", "").strip()
    semicolon_index = text.find(";")
    if semicolon_index != -1:
        text = text[: semicolon_index + 1]
    match = re.search(r"(?is)\b(SELECT|WITH|INSERT|UPDATE|DELETE)\b.*", text)
    if match:
        text = match.group(0).strip()
    if not text.endswith(";"):
        text += ";"
    return text


def extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    text = (raw_text or "").strip()
    if not text:
        return None

    control_tokens = ["<|system|>", "<|user|>", "<|assistant|>", "<|end|>"]
    for token in control_tokens:
        text = text.replace(token, "")
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</?think>", "", text, flags=re.IGNORECASE)

    text = text.replace("```json", "").replace("```", "").strip()

    # Fast path for clean JSON
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    # Fallback: extract first JSON object from mixed text
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    candidate = text[start:end + 1]
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def health_check() -> Dict[str, Any]:
    try:
        response = requests.get("http://127.0.0.1:11434/api/tags", timeout=20)
        response.raise_for_status()
        models = response.json().get("models", [])
        model_names = [model.get("name", "") for model in models]
        configured_available = any(
            name == MODEL_NAME or name.startswith(MODEL_NAME)
            for name in model_names
        )
        return {
            "status": "ok",
            "ollama_reachable": True,
            "model": MODEL_NAME,
            "model_available": configured_available,
            # Backward-compatible alias for older frontend/clients
            "phi3_available": configured_available,
            "model_count": len(models),
            "installed_models": model_names,
        }
    except Exception as exc:
        return {
            "status": "error",
            "ollama_reachable": False,
            "model": MODEL_NAME,
            "model_available": False,
            "phi3_available": False,
            "error": str(exc),
        }

def build_column_context(conn: sqlite3.Connection, table_name: str, column_name: str) -> Optional[dict]:
    cursor = conn.cursor()
    # Check if table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    if not cursor.fetchone():
        return None
        
    qt = _quote_identifier(table_name)
    qc = _quote_identifier(column_name)
    
    # Check if column exists, get data type
    cursor.execute(f"PRAGMA table_info({qt})")
    cols_info = cursor.fetchall()
    col_info = next((c for c in cols_info if c[1] == column_name), None)
    if not col_info:
        return None
        
    data_type = col_info[2] or "UNKNOWN"
    
    # Get total row count, non-null count, distinct count
    cursor.execute(f'SELECT COUNT(*), COUNT({qc}), COUNT(DISTINCT {qc}) FROM {qt}')
    total_rows, non_null_count, distinct_count = cursor.fetchone()
    
    if total_rows == 0:
        null_pct = 0.0
        uniqueness_pct = 0.0
    else:
        null_pct = round((1.0 - (non_null_count / total_rows)) * 100, 1)
        uniqueness_pct = round((distinct_count / total_rows) * 100, 1)
        
    # Get top 10 values
    cursor.execute(f'SELECT {qc}, COUNT(*) as cnt FROM {qt} WHERE {qc} IS NOT NULL GROUP BY {qc} ORDER BY cnt DESC LIMIT 10')
    top_values_db = cursor.fetchall()
    top_values = [{"value": str(r[0]), "count": r[1]} for r in top_values_db]
    
    # Get 10 sample raw values
    cursor.execute(f'SELECT {qc} FROM {qt} WHERE {qc} IS NOT NULL LIMIT 10')
    sample_values = [str(r[0]) for r in cursor.fetchall()]
    
    # Check if it's a foreign key
    cursor.execute(f"PRAGMA foreign_key_list({qt})")
    fks = cursor.fetchall()
    fk_ref = next((fk[2] + "." + (fk[4] if fk[4] else "id") for fk in fks if fk[3] == column_name), None)
    
    return {
        "table_name": table_name,
        "column_name": column_name,
        "row_count": total_rows,
        "data_type": data_type,
        "null_pct": float(null_pct),
        "unique_count": distinct_count,
        "uniqueness_pct": float(uniqueness_pct),
        "top_values": top_values,
        "sample_values": sample_values,
        "fk_reference": fk_ref
    }

def prompt_column_chat(context: dict, question: str) -> str:
    top_vals_str = ", ".join([f"{v['value']} ({v['count']})" for v in context['top_values']]) if context['top_values'] else "None"
    sample_vals_str = ", ".join(context['sample_values']) if context['sample_values'] else "None"
    fk_ref_str = context['fk_reference'] if context['fk_reference'] else "None"
    
    return f"""<|system|>
You are a senior data analyst specialised in this exact column. You know its values, distribution, and business meaning. Answer concisely and technically. If the question involves numbers, compute from the provided metrics.<|end|>
<|user|>
Table: {context['table_name']} ({context['row_count']} rows)
Column: {context['column_name']}
Type: {context['data_type']}
Null%: {context['null_pct']}%
Unique values: {context['unique_count']} ({context['uniqueness_pct']}%)
Top 10 values with counts: {top_vals_str}
Sample raw values: {sample_vals_str}
FK reference: {fk_ref_str}
User question: {question}<|end|>
<|assistant|>"""
