import pandas as pd
import sqlite3
from itertools import combinations

def compute_column_stats(df: pd.DataFrame) -> tuple[dict, int]:
    """Computes exact nulls, percentages, and uniqueness for each column."""
    total_rows = len(df)
    stats = {}
    
    for col in df.columns:
        null_count = int(df[col].isnull().sum())
        null_percentage = round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        unique_count = int(df[col].nunique())
        uniqueness_pct = round((unique_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        
        # Determine strict base type
        col_type = "TEXT"
        if pd.api.types.is_numeric_dtype(df[col]):
            col_type = "FLOAT" if pd.api.types.is_float_dtype(df[col]) else "INTEGER"
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            col_type = "TIMESTAMP"
            
        stats[col] = {
            "name": col,
            "type": col_type,
            "null_count": null_count,
            "null_percentage": null_percentage,
            "uniqueness": uniqueness_pct,
            "unique_count": unique_count
        }
    return stats, total_rows

def detect_primary_keys(stats: dict, total_rows: int, df: pd.DataFrame | None = None) -> dict:
    """Detect single or composite primary keys and annotate stats in-place."""
    for stat in stats.values():
        stat["is_primary_key"] = False
        stat["is_composite_part"] = False

    if total_rows <= 0:
        return stats

    # 1) Single-column PK candidates
    single_candidates = []
    for col, stat in stats.items():
        if stat["unique_count"] == total_rows and stat["null_count"] == 0:
            single_candidates.append(col)

    if single_candidates:
        single_candidates.sort(key=lambda c: (0 if "id" in c.lower() else 1, len(c)))
        best_pk = single_candidates[0]
        stats[best_pk]["is_primary_key"] = True
        return stats

    # 2) Composite key detection when no single-column PK exists
    composite_pool = []
    for col, stat in stats.items():
        val_col = col.lower()
        if stat["null_count"] == 0 and ("id" in val_col or "seq" in val_col or "step" in val_col):
            composite_pool.append(col)

    composite_parts = []
    if df is not None and len(composite_pool) >= 2:
        pair_candidates = []
        for c1, c2 in combinations(composite_pool, 2):
            try:
                unique_pairs = int(df[[c1, c2]].drop_duplicates().shape[0])
            except Exception:
                continue

            if unique_pairs == total_rows:
                score = 0
                if "id" in c1.lower():
                    score += 2
                if "id" in c2.lower():
                    score += 2
                score += int(stats[c1]["uniqueness"] + stats[c2]["uniqueness"])
                pair_candidates.append((score, (c1, c2)))

        if pair_candidates:
            pair_candidates.sort(reverse=True)
            composite_parts = list(pair_candidates[0][1])

    # Fallback composite marking if no strict unique pair was found
    if not composite_parts and len(composite_pool) >= 2:
        composite_pool.sort(key=lambda c: (-stats[c]["uniqueness"], 0 if "id" in c.lower() else 1, len(c)))
        composite_parts = composite_pool[:2]

    if composite_parts:
        for col in composite_parts:
            stats[col]["is_primary_key"] = True
            stats[col]["is_composite_part"] = True
        return stats

    # 3) Soft fallback for near-unique ID-like columns
    for col, stat in sorted(stats.items(), key=lambda item: (-item[1]["uniqueness"], len(item[0]))):
        if "id" in col.lower() and stat["uniqueness"] > 90.0:
            stats[col]["is_primary_key"] = True
            break

    return stats

def detect_foreign_keys(
    db_schema: dict[str, dict],
    tables_dict: dict[str, pd.DataFrame],
) -> dict[str, dict]:
    """
    Direction-safe FK detection:
    child_col subset of parent primary-key values.

    Supports:
    - ID-based FKs
    - exact-name non-ID FKs (e.g. product_category_name)
    - composite PK parts acting as FKs
    """
    # Candidate parent PK columns (exclude composite parts for parent side matching)
    parent_candidates: list[tuple[str, str, set]] = []
    for parent_table, table_meta in db_schema.items():
        parent_df = tables_dict.get(parent_table)
        if parent_df is None:
            continue

        for parent_col, parent_data in table_meta["columns"].items():
            if not parent_data.get("is_primary_key") or parent_data.get("is_composite_part"):
                continue
            if parent_col not in parent_df.columns:
                continue

            parent_values = set(parent_df[parent_col].dropna().unique())
            if parent_values:
                parent_candidates.append((parent_table, parent_col, parent_values))

    for child_table, table_meta in db_schema.items():
        child_df = tables_dict.get(child_table)
        if child_df is None:
            continue

        for child_col, child_data in table_meta["columns"].items():
            # Protect standalone PK columns. Composite PK parts are allowed as FK.
            if child_data.get("is_primary_key") and not child_data.get("is_composite_part"):
                continue
            if child_col not in child_df.columns:
                continue

            child_values = set(child_df[child_col].dropna().unique())
            if not child_values:
                continue

            best_match = None
            best_score = -1

            for parent_table, parent_pk_col, parent_values in parent_candidates:
                if parent_table == child_table:
                    continue
                if not child_values.issubset(parent_values):
                    continue

                is_id_based = "id" in child_col.lower()
                is_exact_match = child_col.lower() == parent_pk_col.lower()
                if not (is_id_based or is_exact_match):
                    continue

                parent_table_norm = parent_table.lower().replace("olist_", "").replace("_dataset", "")
                parent_table_singular = parent_table_norm[:-1] if parent_table_norm.endswith("s") else parent_table_norm

                score = 0
                if is_exact_match:
                    score += 5
                if is_id_based:
                    score += 2
                if parent_table_singular and parent_table_singular in child_col.lower():
                    score += 3
                if child_data.get("is_composite_part"):
                    score += 1

                if score > best_score:
                    best_score = score
                    best_match = (parent_table, parent_pk_col)

            if best_match is None:
                continue

            parent_table, parent_pk_col = best_match
            child_data["is_foreign_key"] = True
            child_data["references"] = f"{parent_table}.{parent_pk_col}"

    return db_schema

def generate_intelligent_schema(tables_dict: dict[str, pd.DataFrame], db_path: str = "temp.db") -> list[dict]:
    """Orchestrates stats, PKs, FKs, and generates the final JSON structure while auto-indexing DB."""
    schema_payload = []
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    db_schema: dict[str, dict] = {}
    for table_name, df in tables_dict.items():
        stats, total_rows = compute_column_stats(df)
        stats = detect_primary_keys(stats, total_rows, df=df)

        columns_map: dict[str, dict] = {}
        for col, stat in stats.items():
            columns_map[col] = {
                "name": col,
                "type": stat["type"],
                "null_count": stat["null_count"],
                "null_percentage": stat["null_percentage"],
                "uniqueness": stat["uniqueness"],
                "is_primary_key": bool(stat.get("is_primary_key", False)),
                "is_composite_part": bool(stat.get("is_composite_part", False)),
                "is_foreign_key": False,
                "references": None,
            }

        db_schema[table_name] = {
            "row_count": total_rows,
            "columns": columns_map,
        }

    db_schema = detect_foreign_keys(db_schema, tables_dict)

    for table_name, table_meta in db_schema.items():
        columns_payload = []
        for col in tables_dict[table_name].columns:
            col_data = table_meta["columns"][col]

            # DB Write (Index Creation for High-Impact Query Performance)
            if col_data["is_primary_key"] or col_data["is_foreign_key"]:
                try:
                    cursor.execute(f'CREATE INDEX IF NOT EXISTS "idx_{table_name}_{col}" ON "{table_name}" ("{col}")')
                except sqlite3.OperationalError:
                    pass

            columns_payload.append(col_data)

        schema_payload.append({
            "table_name": table_name,
            "row_count": table_meta["row_count"],
            "columns": columns_payload
        })
        
    conn.commit()
    conn.close()
    return schema_payload
