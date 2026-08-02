"""CSV and file ingestion handlers for user-uploaded data."""
import pandas as pd
import sqlite3
import os

DB_PATH = "database.sqlite"


def create_table_from_csv(csv_path, table_name=None):
    """
    Parse CSV file and load it into database.sqlite as a new table.
    
    Args:
        csv_path: Path to CSV file
        table_name: Optional table name (defaults to filename without extension)
    
    Returns:
        {"success": bool, "table_name": str, "row_count": int, "error": str or None}
    """
    try:
        # Determine table name
        if not table_name:
            table_name = os.path.splitext(os.path.basename(csv_path))[0]
        
        # Sanitize table name (alphanumeric + underscore only)
        table_name = "".join(c if c.isalnum() or c == "_" else "_" for c in table_name)
        if not table_name or table_name[0].isdigit():
            table_name = f"table_{table_name}" if table_name else "imported_table"
        
        # Read CSV
        df = pd.read_csv(csv_path)
        
        if df.empty:
            return {
                "success": False,
                "table_name": table_name,
                "row_count": 0,
                "error": "CSV file is empty"
            }
        
        # Load into SQLite (appends as new table, appends if table name exists)
        conn = sqlite3.connect(DB_PATH)
        df.to_sql(table_name, conn, if_exists="append", index=False)
        conn.close()
        
        row_count = len(df)
        
        return {
            "success": True,
            "table_name": table_name,
            "row_count": row_count,
            "error": None,
            "columns": list(df.columns),
            "data_shape": f"{row_count} rows x {len(df.columns)} columns"
        }
    
    except pd.errors.ParserError as e:
        return {
            "success": False,
            "table_name": table_name,
            "row_count": 0,
            "error": f"CSV parse error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "table_name": table_name if 'table_name' in locals() else "unknown",
            "row_count": 0,
            "error": f"Failed to load CSV: {str(e)}"
        }


def copy_sqlite_database(source_path):
    """
    Copy SQLite database file to database.sqlite for use by backend.
    
    Args:
        source_path: Path to source SQLite file
    
    Returns:
        {"success": bool, "table_count": int, "error": str or None}
    """
    try:
        # We merge the uploaded database into the existing database
        
        # Connect to both databases
        source_conn = sqlite3.connect(source_path)
        source_cursor = source_conn.cursor()
        
        # Get all tables from source
        source_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = source_cursor.fetchall()
        
        # Merge each table into target
        target_conn = sqlite3.connect(DB_PATH)
        for table in tables:
            table_name = table[0]
            df = pd.read_sql_query(f'SELECT * FROM "{table_name}"', source_conn)
            df.to_sql(table_name, target_conn, if_exists="append", index=False)
            
        target_conn.close()
        source_conn.close()
        
        table_count = len(tables)
        table_names = [t[0] for t in tables]
        
        return {
            "success": True,
            "table_count": table_count,
            "tables": table_names,
            "error": None
        }
    
    except Exception as e:
        return {
            "success": False,
            "table_count": 0,
            "error": f"Failed to copy SQLite database: {str(e)}"
        }

def process_zip_file(zip_path):
    """
    Extract ZIP file and load all CSVs within it into database.sqlite as separate tables.
    
    Args:
        zip_path: Path to ZIP file
        
    Returns:
        {"success": bool, "table_count": int, "tables": list, "error": str or None}
    """
    import zipfile
    import tempfile
    
    try:
        # We do not clear the existing database to allow merging multiple uploads
            
        loaded_tables = []
        errors = []
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Extract zip
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
                
            conn = sqlite3.connect(DB_PATH)
            
            # Find and load all CSVs
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    if file.lower().endswith('.csv'):
                        csv_path = os.path.join(root, file)
                        table_name = os.path.splitext(file)[0]
                        
                        # Sanitize table name
                        table_name = "".join(c if c.isalnum() or c == "_" else "_" for c in table_name)
                        if not table_name or table_name[0].isdigit():
                            table_name = f"table_{table_name}" if table_name else "imported_table"
                            
                        try:
                            # Use chunking or direct text read for extremely large CSVs?
                            # For hackathon, direct read should be fine for moderate CSVs.
                            df = pd.read_csv(csv_path)
                            if not df.empty:
                                df.to_sql(table_name, conn, if_exists="append", index=False)
                                loaded_tables.append({
                                    "table_name": table_name,
                                    "row_count": len(df),
                                    "columns": list(df.columns)
                                })
                        except Exception as e:
                            errors.append(f"Failed to load {file}: {str(e)}")
                            
            conn.close()
            
        if not loaded_tables:
            return {
                "success": False,
                "table_count": 0,
                "tables": [],
                "error": "No valid CSV files found in ZIP" + (f". Errors: {', '.join(errors)}" if errors else "")
            }
            
        return {
            "success": True,
            "table_count": len(loaded_tables),
            "tables": [t["table_name"] for t in loaded_tables],
            "tables_details": loaded_tables,
            "error": ", ".join(errors) if errors else None
        }
        
    except zipfile.BadZipFile:
        return {
            "success": False,
            "table_count": 0,
            "error": "Invalid ZIP file format"
        }
    except Exception as e:
        return {
            "success": False,
            "table_count": 0,
            "error": f"Failed to process ZIP: {str(e)}"
        }
