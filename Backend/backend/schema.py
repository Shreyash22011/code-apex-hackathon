import sqlite3
import json
import os
import datetime
from typing import Any, Dict, List
import pandas as pd
from intelligent_schema import generate_intelligent_schema

DB_PATH = "database.sqlite"  # Assuming Member 3 creates this
INTELLIGENT_SAMPLE_ROWS = 2000


def _display_table_name(table_name):
    if table_name.startswith("oltr_"):
        return table_name[5:]
    return table_name


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _infer_table_group(table_name: str) -> str:
    lowered = _display_table_name(table_name).lower()
    if "order" in lowered:
        return "orders"
    if "customer" in lowered or "client" in lowered or "user" in lowered:
        return "customers"
    if "product" in lowered or "item" in lowered or "inventory" in lowered:
        return "products"
    if "payment" in lowered or "invoice" in lowered or "billing" in lowered:
        return "payments"
    if "review" in lowered or "rating" in lowered or "feedback" in lowered:
        return "reviews"
    if "seller" in lowered or "vendor" in lowered or "supplier" in lowered:
        return "sellers"
    if "ship" in lowered or "deliver" in lowered or "logistics" in lowered:
        return "shipping"
    return "other"


def _table_name_variants(table_name: str) -> set[str]:
    base = _display_table_name(table_name).lower()
    variants = {base}
    if base.endswith("s"):
        variants.add(base[:-1])
    else:
        variants.add(base + "s")
    return variants


def _relationship_id(source_table: str, source_column: str, target_table: str, target_column: str) -> str:
    return f"{source_table}.{source_column}->{target_table}.{target_column}"


def _build_fast_summaries(table_name: str, row_count: int, columns: List[Dict[str, Any]]) -> tuple[str, str]:
    display = _display_table_name(table_name)
    col_count = len(columns)
    pk_cols = [c.get("name") for c in columns if c.get("is_pk")]
    fk_cols = [c.get("name") for c in columns if c.get("is_fk") or c.get("foreign_key")]

    business_summary = (
        f"{display} stores structured records used by the analytics workflow. "
        f"It currently contains {row_count:,} rows and supports cross-table exploration."
    )
    developer_summary = (
        f"Table {table_name} has {col_count} columns"
        f"; primary keys: {', '.join(pk_cols) if pk_cols else 'none'}"
        f"; foreign keys: {', '.join(fk_cols) if fk_cols else 'none'}."
    )
    return business_summary, developer_summary

def connect_db():
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database file {DB_PATH} not found. Ensure ingestion is run first.")
    return sqlite3.connect(DB_PATH)


def _get_tables(cursor: sqlite3.Cursor) -> List[str]:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    return [row[0] for row in cursor.fetchall()]


def _get_columns_for_table(cursor: sqlite3.Cursor, table: str) -> List[Dict[str, Any]]:
    cursor.execute(f"PRAGMA table_info({_quote_identifier(table)});")
    columns_info = cursor.fetchall()
    
    cursor.execute(f"PRAGMA foreign_key_list({_quote_identifier(table)});")
    fk_list = cursor.fetchall()
    fk_columns = set([fk[3] for fk in fk_list])
    
    try:
        cursor.execute(f"SELECT * FROM {_quote_identifier(table)} LIMIT 1;")
        sample_row = cursor.fetchone()
        sample_columns = [description[0] for description in cursor.description] if sample_row else []
        sample_dict = dict(zip(sample_columns, sample_row)) if sample_row else {}
    except sqlite3.OperationalError:
        sample_dict = {}

    cols = []
    for col in columns_info:
        col_name = col[1]
        col_type = col[2]
        notnull = col[3]
        dflt_value = col[4]
        is_pk = col[5] > 0
        
        cols.append({
            "name": col_name, 
            "type": col_type, 
            "is_pk": is_pk,
            "nullable": notnull == 0,
            "foreign_key": col_name in fk_columns,
            "default": dflt_value,
            "sample": sample_dict.get(col_name)
        })
    return cols


def _get_row_count(cursor: sqlite3.Cursor, table: str) -> int:
    cursor.execute(f"SELECT COUNT(*) FROM {_quote_identifier(table)}")
    return int(cursor.fetchone()[0])


def _load_table_frames(
    conn: sqlite3.Connection,
    tables: List[str],
    max_rows: int = INTELLIGENT_SAMPLE_ROWS,
) -> Dict[str, pd.DataFrame]:
    frames: Dict[str, pd.DataFrame] = {}
    for table in tables:
        frames[table] = pd.read_sql_query(
            f"SELECT * FROM {_quote_identifier(table)} LIMIT {int(max_rows)}",
            conn,
        )
    return frames


def _merge_intelligent_columns(
    legacy_cols: List[Dict[str, Any]],
    intelligent_cols: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    by_name = {c.get("name"): c for c in intelligent_cols}
    merged: List[Dict[str, Any]] = []

    for col in legacy_cols:
        intel = by_name.get(col.get("name"), {})
        is_pk = bool(intel.get("is_primary_key", col.get("is_pk", False)))
        is_fk = bool(intel.get("is_foreign_key", col.get("foreign_key", False)))
        is_composite_part = bool(intel.get("is_composite_part", False))

        merged.append({
            "name": col.get("name"),
            "type": intel.get("type", col.get("type", "TEXT")),
            "null_percentage": float(intel.get("null_percentage", 0.0)),
            "uniqueness": float(intel.get("uniqueness", 0.0)),
            "is_primary_key": is_pk,
            "is_composite_part": is_composite_part,
            "is_foreign_key": is_fk,
            "references": intel.get("references"),
            # Compatibility aliases used by existing frontend/backend pieces.
            "is_pk": is_pk,
            "is_fk": is_fk,
            "foreign_key": is_fk,
            "nullable": col.get("nullable", True),
            "default": col.get("default"),
            "sample": col.get("sample"),
        })

    return merged

def extract_schema():
    """Extract schema with intelligent column stats, PK/FK inference, and links."""
    conn = connect_db()
    cursor = conn.cursor()
    
    schema = {"tables": [], "links": []}
    
    tables = _get_tables(cursor)
    
    all_columns = {}  # {table_name: [{col_name, type, is_pk}]}
    table_frames = _load_table_frames(conn, tables)
    intelligent_schema = generate_intelligent_schema(table_frames, DB_PATH)
    intelligent_by_table = {item["table_name"]: item for item in intelligent_schema}
    
    for table in tables:
        legacy_cols = _get_columns_for_table(cursor, table)
        intelligent_cols = intelligent_by_table.get(table, {}).get("columns", [])
        cols = _merge_intelligent_columns(legacy_cols, intelligent_cols)
        row_count = _get_row_count(cursor, table)
        business_summary, developer_summary = _build_fast_summaries(table, row_count, cols)
            
        all_columns[table] = cols
        schema["tables"].append({
            "id": table,
            "name": table,
            "display_name": _display_table_name(table),
            "group": _infer_table_group(table),
            "row_count": row_count,
            "rowCount": row_count,
            "qualityScore": None,
            "business_summary": business_summary,
            "developer_summary": developer_summary,
            "columns": cols
        })
        
    conn.close()
    
    # Run Implicit FK detection
    schema["links"] = detect_implicit_foreign_keys(all_columns)
    exports = _build_relationship_exports(schema["links"])
    schema["relationship_lines"] = exports["relationship_lines"]
    schema["mermaid_relationships"] = exports["mermaid_relationships"]
    
    return schema

def detect_implicit_foreign_keys(all_columns):
    """
    Detects relationships that aren't formally declared as Foreign Keys.
    Logic: If table A has a column ending in '_id' that perfectly matches 
    a Primary Key or exact column name in table B, we assume a relationship.
    """
    detailed_links = detect_inferred_relationships(all_columns)
    legacy_links = []
    for rel in detailed_links:
        legacy_links.append({
            "source": rel["source_table"],
            "target": rel["target_table"],
            "source_col": rel["source_col"],
              "target_col": rel["target_col"],
            "type": "implicit",
        })
    return legacy_links


def _build_relationship_exports(links: List[Dict[str, Any]]) -> Dict[str, Any]:
    relationship_lines: List[str] = []
    mermaid_lines: List[str] = ["graph LR"]
    table_nodes: Dict[str, str] = {}
    node_index = 0

    for link in links:
        source = link.get("source")
        target = link.get("target")
        source_col = link.get("source_col", "")
        target_col = link.get("target_col", "")

        if not source or not target:
            continue

        relationship_lines.append(f"[{source}] {source_col} -> [{target}] {target_col}")

        if source not in table_nodes:
            table_nodes[source] = f"T{node_index}"
            node_index += 1
        if target not in table_nodes:
            table_nodes[target] = f"T{node_index}"
            node_index += 1

        source_node = table_nodes[source]
        target_node = table_nodes[target]
        label = f"{source_col}->{target_col}" if source_col or target_col else "rel"
        mermaid_lines.append(
            f"  {source_node}[{source}] -->|{label}| {target_node}[{target}]"
        )

    return {
        "relationship_lines": relationship_lines,
        "mermaid_relationships": "\n".join(mermaid_lines),
    }


def detect_formal_foreign_keys(cursor: sqlite3.Cursor, tables: List[str], all_columns: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    links: List[Dict[str, Any]] = []

    for source_table in tables:
        cursor.execute(f"PRAGMA foreign_key_list({_quote_identifier(source_table)});")
        foreign_keys = cursor.fetchall()
        for fk in foreign_keys:
            target_table = fk[2]
            source_column = fk[3]
            target_column = fk[4] or "id"

            # If target column isn't provided, try to infer the PK from target table.
            if not fk[4] and target_table in all_columns:
                pk_cols = [c["name"] for c in all_columns[target_table] if c["is_pk"]]
                if pk_cols:
                    target_column = pk_cols[0]

            links.append({
                "id": _relationship_id(source_table, source_column, target_table, target_column),
                "source": source_table,
                "target": target_table,
                "source_table": source_table,
                "target_table": target_table,
                "source_col": source_column,
                "target_col": target_column,
                "source_display": _display_table_name(source_table),
                "target_display": _display_table_name(target_table),
                "label": source_column,
                "type": "formal",
                "confidence": 1.0,
                "cardinality": "one_to_many",
                "inference_method": "sqlite_foreign_key_list",
            })

    return links


def detect_inferred_relationships(all_columns: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    links: List[Dict[str, Any]] = []
    seen = set()
    tables = list(all_columns.keys())

    for source_table in tables:
        source_columns = all_columns[source_table]
        for col in source_columns:
            source_col = col["name"]

            # Trust intelligent FK if it matched
            reference = col.get("references")
            if bool(col.get("is_foreign_key")) and isinstance(reference, str) and "." in reference:
                target_table, target_column = reference.split(".", 1)
                dedupe_key = (source_table, source_col, target_table, target_column)
                if dedupe_key not in seen:
                    seen.add(dedupe_key)
                    links.append({
                        "id": _relationship_id(source_table, source_col, target_table, target_column),
                        "source": source_table,
                        "target": target_table,
                        "source_table": source_table,
                        "target_table": target_table,
                        "source_col": source_col,
                        "target_col": target_column,
                        "source_display": _display_table_name(source_table),
                        "target_display": _display_table_name(target_table),
                        "label": source_col,
                        "type": "inferred",
                        "confidence": 0.97,
                        "cardinality": "one_to_many",
                        "inference_method": "intelligent_reference_subset",
                    })
                continue

            if not source_col.lower().endswith("_id"):
                continue

            # Prevent reverse mapping for standalone PK columns. Allow composite parts.
            if bool(col.get("is_pk") or col.get("is_primary_key")) and not bool(col.get("is_composite_part")):
                continue

            # Removed the strict skip: if intelligent_schema missed it due to LIMIT 8000 sampling, 
            # we want to still fall back to name-based heuristic below.
            
            prefix = source_col[:-3].lower()  # drop trailing '_id'

            for target_table in tables:
                if target_table == source_table:
                    continue

                target_columns = all_columns[target_table]
                target_by_name = {c["name"].lower(): c for c in target_columns}
                target_variants = _table_name_variants(target_table)

                matches_exact_name = source_col.lower() in target_by_name
                matches_prefix_name = f"{prefix}_id" in target_by_name
                matches_generic_id = "id" in target_by_name and target_by_name["id"]["is_pk"]
                matches_table_name = prefix in target_variants

                target_column = None
                method = None
                confidence = 0.65

                if matches_exact_name and target_by_name[source_col.lower()]["is_pk"]:
                    target_column = source_col
                    method = "exact_column_name_pk_match"
                    confidence = 0.92
                elif matches_exact_name:
                    target_column = source_col
                    method = "exact_column_name_match"
                    confidence = 0.85
                elif matches_prefix_name and target_by_name[f"{prefix}_id"]["is_pk"]:
                    target_column = f"{prefix}_id"
                    method = "prefix_pk_match"
                    confidence = 0.83
                elif matches_table_name and matches_generic_id:
                    target_column = "id"
                    method = "table_name_plus_id_pk_match"
                    confidence = 0.75
                elif matches_table_name and matches_prefix_name:
                    target_column = f"{prefix}_id"
                    method = "table_name_plus_prefix_match"
                    confidence = 0.72

                if not target_column:
                    continue

                dedupe_key = (source_table, source_col, target_table, target_column)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)

                links.append({
                    "id": _relationship_id(source_table, source_col, target_table, target_column),
                    "source": source_table,
                    "target": target_table,
                    "source_table": source_table,
                    "target_table": target_table,
                    "source_col": source_col,
                    "target_col": target_column,
                    "source_display": _display_table_name(source_table),
                    "target_display": _display_table_name(target_table),
                    "label": source_col,
                    "type": "inferred",
                    "confidence": confidence,
                    "cardinality": "one_to_many",
                    "inference_method": method,
                })

    return links


def extract_relationships() -> Dict[str, Any]:
    conn = connect_db()
    cursor = conn.cursor()

    tables = _get_tables(cursor)
    table_frames = _load_table_frames(conn, tables)
    intelligent_schema = generate_intelligent_schema(table_frames, DB_PATH)
    intelligent_by_table = {item["table_name"]: item for item in intelligent_schema}

    all_columns: Dict[str, List[Dict[str, Any]]] = {}
    for table in tables:
        legacy_cols = _get_columns_for_table(cursor, table)
        intelligent_cols = intelligent_by_table.get(table, {}).get("columns", [])
        all_columns[table] = _merge_intelligent_columns(legacy_cols, intelligent_cols)

    formal = detect_formal_foreign_keys(cursor, tables, all_columns)
    inferred = detect_inferred_relationships(all_columns)
    
    # Merge both to ensure we get comprehensive relationships even if some are formal
    combined = {link["id"]: link for link in inferred}
    for link in formal:
        combined[link["id"]] = link # Formal takes precedence if ID matches
        
    # Deduplicate reciprocal edges (e.g., A->B and B->A on the same columns)
    # We want deterministic direction: prefer Child -> Parent.
    # We'll sort by type (formal first), then confidence, then alphabetical source table.
    def edge_sort_key(e):
        is_formal = 1 if e.get("type") == "formal" else 0
        conf = e.get("confidence", 0)
        return (is_formal, conf, e["source_table"], e["target_table"])

    sorted_links = sorted(combined.values(), key=edge_sort_key, reverse=True)
    final_relationships = []
    seen_pairs = set()

    for link in sorted_links:
        # Create a direction-agnostic pair signature
        pair = tuple(sorted([
            f"{link['source_table']}.{link['source_col']}",
            f"{link['target_table']}.{link['target_col']}"
        ]))
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            final_relationships.append(link)
            
    relationships = final_relationships
    mode = "hybrid" if formal and inferred else ("formal" if formal else "inferred")

    diagnostics = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "tables_analyzed": len(tables),
        "columns_checked": sum(len(cols) for cols in all_columns.values()),
        "edge_count": len(relationships),
    }
    if not relationships:
        diagnostics["reason"] = "No column names matched id patterns or foreign key subsets."

    conn.close()
    return {
        "mode": mode,
        "relationship_count": len(relationships),
        "relationships": relationships,
        "diagnostics": diagnostics
    }

if __name__ == "__main__":
    # If run directly, just test it out and print JSON
    try:
        print("Extracting schema...")
        result = extract_schema()
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}")
