import sqlite3
import pandas as pd
import numpy as np
import datetime
import math

DB_PATH = "database.sqlite"

def compute_analysis(table_name: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', conn)
    except Exception as e:
        conn.close()
        raise ValueError(f"Table not found or error: {str(e)}")
    finally:
        conn.close()

    row_count = len(df)
    col_count = len(df.columns)
    
    numeric_stats = []
    categorical_stats = []
    date_stats = []
    
    # Analyze by dtype
    for col in df.columns:
        series = df[col]
        
        # Check if it's potentially a date first (often loaded as object/string from sqlite)
        is_date = False
        if pd.api.types.is_object_dtype(series):
            try:
                # Only try to parse if looks like a date/timestamp or if column name suggests it
                if any(kw in col.lower() for kw in ["date", "time", "timestamp", "_at"]):
                    series = pd.to_datetime(series)
                    is_date = True
            except:
                pass
        elif pd.api.types.is_datetime64_any_dtype(series):
            is_date = True

        series_non_null = series.dropna()

        if is_date or pd.api.types.is_datetime64_any_dtype(series):
            if not series_non_null.empty:
                min_date = series_non_null.min()
                max_date = series_non_null.max()
                delta = max_date - min_date
                date_range_days = delta.days
                
                # most active period (month)
                periods = series_non_null.dt.to_period('M')
                most_active = periods.mode()[0] if not periods.empty else None
                
                # gap detection (simple version: missing months)
                if most_active is not None and min_date != max_date:
                    all_months = pd.period_range(start=min_date, end=max_date, freq='M')
                    actual_months = series_non_null.dt.to_period('M').unique()
                    missing = len(all_months) - len(actual_months)
                    gap_str = f"{missing} missing months" if missing > 0 else "none"
                else:
                    gap_str = "none"

                date_stats.append({
                    "column": col,
                    "min_date": min_date.strftime("%Y-%m-%d") if pd.notna(min_date) else None,
                    "max_date": max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None,
                    "date_range_days": int(date_range_days) if pd.notna(date_range_days) else None,
                    "most_active_period": str(most_active) if most_active is not None else None,
                    "gap_detection": f"missing months: {gap_str}"
                })
        
        elif pd.api.types.is_numeric_dtype(series):
            if not series_non_null.empty:
                q1 = series_non_null.quantile(0.25)
                q3 = series_non_null.quantile(0.75)
                iqr = q3 - q1
                
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                iqr_outliers = series_non_null[(series_non_null < lower_bound) | (series_non_null > upper_bound)]
                
                mean_val = series_non_null.mean()
                std_val = series_non_null.std()
                if std_val > 0:
                    zscores = np.abs((series_non_null - mean_val) / std_val)
                    z_outliers = zscores[zscores > 3]
                    z_outlier_count = len(z_outliers)
                else:
                    z_outlier_count = 0
                    
                numeric_stats.append({
                    "column": col,
                    "mean": round(float(mean_val), 2),
                    "median": round(float(series_non_null.median()), 2),
                    "std": round(float(std_val), 2) if pd.notna(std_val) else None,
                    "variance": round(float(series_non_null.var()), 2) if pd.notna(series_non_null.var()) else None,
                    "min": round(float(series_non_null.min()), 2),
                    "max": round(float(series_non_null.max()), 2),
                    "q1": round(float(q1), 2),
                    "q3": round(float(q3), 2),
                    "iqr": round(float(iqr), 2),
                    "skewness": round(float(series_non_null.skew()), 2) if len(series_non_null) > 2 else None,
                    "kurtosis": round(float(series_non_null.kurt()), 2) if len(series_non_null) > 3 else None,
                    "iqr_outlier_count": int(len(iqr_outliers)),
                    "zscore_outlier_count": int(z_outlier_count)
                })
                
        else:
            # Categorical
            if not series_non_null.empty:
                val_counts = series_non_null.value_counts(normalize=False)
                cardinality = len(val_counts)
                
                top_5 = val_counts.head(5)
                top_values = [{"value": str(k), "count": int(v)} for k, v in top_5.items()]
                
                # Entropy
                probs = series_non_null.value_counts(normalize=True)
                entropy = -sum(p * math.log2(p) for p in probs if p > 0)
                
                categorical_stats.append({
                    "column": col,
                    "cardinality": cardinality,
                    "top_values": top_values,
                    "entropy": round(float(entropy), 2)
                })

    # Correlations
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    correlation_pairs = []
    if len(numeric_cols) > 1:
        corr_matrix = df[numeric_cols].corr()
        pairs = []
        for i in range(len(corr_matrix.columns)):
            for j in range(i+1, len(corr_matrix.columns)):
                col_a = corr_matrix.columns[i]
                col_b = corr_matrix.columns[j]
                r_val = corr_matrix.iloc[i, j]
                if pd.notna(r_val):
                    pairs.append({
                        "col_a": col_a,
                        "col_b": col_b,
                        "r": round(float(r_val), 2),
                        "abs_r": abs(float(r_val))
                    })
        
        # Sort by abs(r) desc, get top 5
        pairs.sort(key=lambda x: x["abs_r"], reverse=True)
        top_pairs = pairs[:5]
        correlation_pairs = [{"col_a": p["col_a"], "col_b": p["col_b"], "r": p["r"]} for p in top_pairs]

    return {
        "table_name": table_name,
        "row_count": int(row_count),
        "col_count": int(col_count),
        "numeric_stats": numeric_stats,
        "categorical_stats": categorical_stats,
        "date_stats": date_stats,
        "correlation_pairs": correlation_pairs
    }
