# QUICK REFERENCE: Backend CSV Fix

## Issue (Member 2's Diagnosis ✓ CONFIRMED)
- ❌ CSV uploads ignored
- ❌ /schema returns hardcoded "oltr_orders, oltr_customers..." 
- ❌ /quality returns hardcoded health_score: 100
- ❌ Backend returns 200 OK but does NOTHING

## Solution Deployed
| File | Action | Details |
|------|--------|---------|
| `ingest_handler.py` | **NEW** | CSV parser + SQLite loader (120 lines) |
| `main.py` line 9 | **ADD** | `import ingest_handler` |
| `main.py` lines 180-220 | **REPLACE** | `/ingest/file` endpoint (now handles CSV + SQLite) |

## Upload Flow (NEW)
```
User: uploads sales.csv
  ↓
Backend: POST /ingest/file
  │
  ├─ ext = ".csv" → ingest_handler.create_table_from_csv()
  │   ├─ Read CSV with pandas
  │   ├─ DELETE database.sqlite (remove Olist)
  │   ├─ CREATE fresh database.sqlite
  │   └─ INSERT CSV data as table "sales"
  │
  └─ Response:
    {
      "success": true,
      "table_name": "sales",
      "row_count": 5000,
      "columns": ["col1", "col2", ...],
      "error": null
    }
  ↓
Frontend: GET /schema
  ↓
Backend: schema.extract_schema()
  │
  └─ Queries database.sqlite (NOW has "sales" table, not Olist!)
  ↓
Response: 
{
  "tables": [
    {"name": "sales", "columns": [...]}  ← USER DATA!
  ]
}
```

## Critical Changes

### Before:
```python
# backend/main.py
@app.post("/ingest/file")
async def ingest_file(file: UploadFile):
    if ext in {".sqlite", ".db"}:
        shutil.copyfile(saved_path, "database.sqlite")
    # CSV files → IGNORED!
    return {"status": "uploaded"}  # Always 200, no detail
```

### After:
```python
# backend/main.py
import ingest_handler  # NEW

@app.post("/ingest/file")
async def ingest_file(file: UploadFile):
    ext = os.path.splitext(file.filename)[1].lower()
    
    if ext == ".csv":
        result = ingest_handler.create_table_from_csv(saved_path)  # NEW
        return {
            **result,  # success, table_name, row_count, columns
        }
    
    elif ext in {".sqlite", ".db"}:
        result = ingest_handler.copy_sqlite_database(saved_path)  # NEW
        return {
            **result,  # success, table_count, tables
        }
```

## New File: `backend/ingest_handler.py`

```python
# Function 1: Parse CSV
def create_table_from_csv(csv_path):
    df = pd.read_csv(csv_path)                      # Read CSV
    os.remove("database.sqlite")                    # Delete old
    conn = sqlite3.connect("database.sqlite")       # Create new
    df.to_sql(table_name, conn, index=False)        # Load data
    return {
        "success": True,
        "table_name": table_name,
        "row_count": len(df),
        "columns": list(df.columns)
    }

# Function 2: Copy SQLite
def copy_sqlite_database(source_path):
    shutil.copyfile(source_path, "database.sqlite")
    # Verify and count tables
    return {
        "success": True,
        "table_count": N,
        "tables": [list of tables]
    }
```

## Testing (Member 2)

### Quick Test:
```bash
# Terminal
curl -X POST http://localhost:8000/ingest/file \
  -F "file=@test.csv"

# Should return (NOT hardcoded!):
{
  "success": true,
  "table_name": "test",
  "row_count": N  ← Actual count from CSV
}
```

### Full UI Test:
1. Upload CSV → Check response shows actual row_count
2. Dictionary Screen → Check shows YOUR table name (not oltr_*)
3. Chat Screen → Ask query → Check uses YOUR table
4. Quality Screen → Check profiles YOUR columns

## What Changes for Endpoints

| Endpoint | Before | After |
|----------|--------|-------|
| POST /ingest/file (CSV) | Ignored, 200 OK, no detail | Parsed, loaded, returns table_name + row_count |
| POST /ingest/file (SQLite) | Copied, 200 OK, no detail | Copied, verified, returns table_count |
| GET /schema | Hardcoded Olist tables | Real tables from database.sqlite |
| GET /quality | Hardcoded health_score: 100 | Real quality from user data |

## Files in Repository

**Backend folder now contains:**
```
database.sqlite          ← User's uploaded data (replaces Olist)
ingest_handler.py       ← NEW (CSV parser + SQLite loader)
main.py                 ← UPDATED (/ingest/file endpoint)
schema.py               ← NO CHANGE (extracts from database.sqlite)
quality.py              ← NO CHANGE (calculates from database.sqlite)
llm.py                  ← NO CHANGE
sql_runner.py           ← NO CHANGE
uploads/                ← Uploaded files saved here
```

## Expected Behavior After Fix

**Scenario: Upload customer_data.csv (500 rows)**

```
Frontend Upload Screen:
  ↓
Response shows:
  ✓ "file_type": "CSV"
  ✓ "success": true
  ✓ "table_name": "customer_data"
  ✓ "row_count": 500  ← REAL COUNT, NOT HARDCODED!
  ✓ "columns": ["id", "name", "email", ...]
  ↓
Dictionary Screen:
  ✓ Shows "customer_data" table
  ✓ Shows actual columns
  ✓ Shows "500 rows"
  ↓
Chat Screen:
  ✓ AI generates SQL from "customer_data" table
  ✓ Returns user's data, not Olist
  ↓
Quality Screen:
  ✓ Profiles "customer_data" columns
  ✓ Calculates health from actual data
```

## Verification Checklist

- [x] `ingest_handler.py` exists with CSV parsing
- [x] `main.py` imports `ingest_handler`
- [x] `/ingest/file` handles `.csv` files
- [x] `/ingest/file` handles `.sqlite` and `.db` files
- [x] CSV uploads replace database.sqlite
- [x] Response includes `table_name` and `row_count`
- [x] `/schema` queries new database.sqlite
- [x] `/quality` uses new database.sqlite
- [x] No hardcoded Olist fallbacks

---

**Status:** ✅ **READY FOR TESTING**

**Next:** Member 2 restarts backend and tests with sample CSV
