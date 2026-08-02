import sqlite3
import pandas as pd
import os
from datetime import datetime

DB_PATH = "database.sqlite"

def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'

def compute_quality(table_name):
    if not os.path.exists(DB_PATH):
         return {"error": "Database not found"}
         
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {_quote_identifier(table_name)}")
            total_rows = cursor.fetchone()[0]
        except Exception:
            return {"error": f"Table {table_name} not found"}

        if total_rows == 0:
            conn.close()
            return {
                "table": table_name,
                "health_score": 0,
                "completeness": 0,
                "freshness": None,
                "freshness_latest_date": None,
                "freshness_days_ago": None,
                "consistency": 100,
                "orphan_issues": []
            }

        cursor.execute(f"PRAGMA table_info({_quote_identifier(table_name)})")
        columns = [row[1] for row in cursor.fetchall()]
        num_columns = len(columns)
        
        completeness_sum = 0
        date_columns = []
        DATE_KEYWORDS = ["date", "time", "timestamp", "created", "updated", "_at", "_on"]
        
        if num_columns > 0:
            counts_query = "SELECT " + ", ".join([f"COUNT({_quote_identifier(c)})" for c in columns]) + f" FROM {_quote_identifier(table_name)}"
            cursor.execute(counts_query)
            counts = cursor.fetchone()
            
            for col, non_null_count in zip(columns, counts):
                pct = (non_null_count / total_rows) * 100
                completeness_sum += pct
                
                if any(kw in col.lower() for kw in DATE_KEYWORDS):
                    date_columns.append(col)
                
        completeness_score = completeness_sum / num_columns if num_columns > 0 else 0

        freshness_score = None
        freshness_latest_date_str = None
        freshness_days_ago = None
        
        global_max_date = None
        
        if date_columns:
            try:
                max_query = "SELECT " + ", ".join([f"MAX({_quote_identifier(c)})" for c in date_columns]) + f" FROM {_quote_identifier(table_name)}"
                cursor.execute(max_query)
                max_vals = cursor.fetchone()
                
                for max_val in max_vals:
                    if max_val:
                        try:
                            parsed_date = pd.to_datetime(max_val)
                            if pd.notna(parsed_date):
                                if parsed_date.tzinfo is not None:
                                    parsed_date = parsed_date.tz_convert(None)
                                if global_max_date is None or parsed_date > global_max_date:
                                    global_max_date = parsed_date
                        except Exception:
                            pass
            except Exception:
                pass
                
        if global_max_date is not None:
            now = datetime.now()
            days_ago = (now - global_max_date).days
            days_ago = max(0, days_ago)
            
            freshness_latest_date_str = global_max_date.strftime("%Y-%m-%d")
            freshness_days_ago = days_ago
            
            if days_ago <= 30:
                freshness_score = 100
            elif days_ago <= 180:
                freshness_score = 100 - ((days_ago - 30) / 150) * 50
            else:
                freshness_score = max(0, 50 - ((days_ago - 180) / 365) * 50)
                
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        all_tables = [r[0] for r in cursor.fetchall()]
        
        fks = []
        for col in columns:
            if col.endswith("_id"):
                parent_table = col[:-3]
                if parent_table in all_tables and parent_table != table_name:
                    fks.append({
                        "child_col": col,
                        "parent_table": parent_table
                    })
        
        for col in columns:
            if col.endswith("_id"):
                parent_table_variant = col[:-3] + "s"
                if parent_table_variant in all_tables and parent_table_variant != table_name:
                    fks.append({
                        "child_col": col,
                        "parent_table": parent_table_variant
                    })

        orphan_issues = []
        fk_scores = []
        for fk in fks:
            child_col = fk["child_col"]
            parent_table = fk["parent_table"]
            
            cursor.execute(f"PRAGMA table_info({_quote_identifier(parent_table)})")
            pcols = [r[1] for r in cursor.fetchall()]
            
            actual_parent_col = None
            if child_col in pcols:
                actual_parent_col = child_col
            elif "id" in pcols:
                actual_parent_col = "id"
                
            if actual_parent_col:
                try:
                    q = f'''
                    SELECT COUNT(*) FROM {_quote_identifier(table_name)} c
                    LEFT JOIN {_quote_identifier(parent_table)} p 
                      ON c.{_quote_identifier(child_col)} = p.{_quote_identifier(actual_parent_col)}
                    WHERE c.{_quote_identifier(child_col)} IS NOT NULL 
                      AND p.{_quote_identifier(actual_parent_col)} IS NULL
                    '''
                    cursor.execute(q)
                    orphan_count = cursor.fetchone()[0]
                    
                    orphan_ratio = orphan_count / total_rows if total_rows > 0 else 0
                    fk_score = (1 - orphan_ratio) * 100
                    fk_scores.append(fk_score)
                    
                    orphan_issues.append({
                        "col": child_col,
                        "parent": parent_table,
                        "orphans": orphan_count
                    })
                except Exception:
                    pass

        consistency_score = sum(fk_scores) / len(fk_scores) if fk_scores else 100.0

        completeness_score_int = int(round(completeness_score))
        consistency_score_int = int(round(consistency_score))
        
        if freshness_score is not None:
            freshness_score_int = int(round(freshness_score))
            health_score = (completeness_score_int * 0.40) + (freshness_score_int * 0.30) + (consistency_score_int * 0.30)
        else:
            freshness_score_int = None
            health_score = (completeness_score_int * 0.55) + (consistency_score_int * 0.45)
            
        health_score_int = int(round(health_score))
        
                # Fetch full column metadata matching requested payload
        cursor.execute(f"PRAGMA table_info({_quote_identifier(table_name)})")
        cols_info = cursor.fetchall()
        
        # Check FKs using pragma for is_fk
        cursor.execute(f"PRAGMA foreign_key_list({_quote_identifier(table_name)})")
        fk_list = set([fk[3] for fk in cursor.fetchall()])

        column_metrics = []
        if total_rows > 0 and len(cols_info) > 0:
            agg_exprs = []
            for row_c in cols_info:
                cname = row_c[1]
                agg_exprs.append(f"COUNT({_quote_identifier(cname)})")
                agg_exprs.append(f"COUNT(DISTINCT {_quote_identifier(cname)})")
            
            try:
                cursor.execute(f"SELECT {', '.join(agg_exprs)} FROM {_quote_identifier(table_name)}")
                agg_results = cursor.fetchone()
            except Exception:
                agg_results = [0] * (len(cols_info) * 2)
        else:
            agg_results = [0] * (len(cols_info) * 2)

        for i, row_c in enumerate(cols_info):
            cname = row_c[1]
            ctype = row_c[2] or "UNKNOWN"
            is_pk = bool(row_c[5] > 0)
            is_fk = cname in fk_list
            
            non_null_count = agg_results[i*2]
            distinct_count = agg_results[i*2 + 1]
            
            null_percent = round((1.0 - (non_null_count / total_rows)) * 100, 1) if total_rows > 0 else 0.0
            uniqueness_percent = round((distinct_count / total_rows) * 100, 1) if total_rows > 0 else 0.0
            
            column_metrics.append({
                "name": cname,
                "type": ctype,
                "null_percent": float(null_percent),
                "uniqueness_percent": float(uniqueness_percent),
                "is_pk": is_pk,
                "is_fk": is_fk
            })
        
        conn.close()
        
        return {
            "table": table_name,
            "health_score": health_score_int,
            "completeness": completeness_score_int,
            "freshness": freshness_score_int,
            "freshness_latest_date": freshness_latest_date_str,
            "freshness_days_ago": freshness_days_ago,
            "consistency": consistency_score_int,
            "orphan_issues": orphan_issues,
            "columns": column_metrics # keep for frontend compatibility if it accesses .columns
        }
    except Exception as e:
        if 'conn' in locals():
            try:
                conn.close()
            except:
                pass
        return {"error": str(e)}

if __name__ == "__main__":
    print(compute_quality("child"))
