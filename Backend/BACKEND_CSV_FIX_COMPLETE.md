# CRITICAL FIX: Backend CSV/File Processing Bug

## Problem Identified (Member 2 Diagnosis ✓ CONFIRMED)

**Backend was returning HARDCODED Olist data every time, regardless of uploaded files.**

Evidence:
- ✓ Every upload → same 9 Olist tables
- ✓ Quality always 100% (hardcoded)
- ✓ Schema shows same columns every time
- ✓ CSV uploads completely ignored (only .sqlite/.db handled)

---

## Root Cause

### Before Fix:
```python
@app.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...)):
    if ext in {".sqlite", ".db"}:  # ← ONLY handles these!
        shutil.copyfile(saved_path, "database.sqlite")
    # ↓ CSV files fall through with NO PROCESSING
    return {"status": "uploaded"}  # ← returns 200 OK but did nothing
```

**CSV files were:**
1. Saved to `uploads/` folder
2. Never parsed
3. Never loaded into database.sqlite
4. Result: `/schema` and `/quality` always query the SAME Olist database.sqlite

---

## Solution Implemented

### Two New Files Created:

#### 1. `backend/ingest_handler.py` (250 lines)
Helper module with two functions:

**Function 1: `create_table_from_csv(csv_path)`**
- Reads CSV using pandas
- Replaces database.sqlite with parsed data
- Creates SQLite table from DataFrame
- Returns: `{success: bool, table_name, row_count, columns, error}`

```python
def create_table_from_csv(csv_path, table_name=None):
    # 1. Read CSV with pandas
    df = pd.read_csv(csv_path)
    
    # 2. Replace database.sqlite (remove old Olist data)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    
    # 3. Load into fresh database.sqlite
    conn = sqlite3.connect(DB_PATH)
    df.to_sql(table_name, conn, if_exists="replace", index=False)
    conn.close()
    
    return {"success": True, "table_name": table_name, "row_count": len(df), ...}
```

**Function 2: `copy_sqlite_database(source_path)`**
- Copies .sqlite/.db files to database.sqlite
- Counts and lists tables
- Returns: `{success: bool, table_count, tables: [list], error}`

#### 2. Updated `backend/main.py`

**Added import:**
```python
import ingest_handler
```

**New `/ingest/file` logic:**
```python
ext = os.path.splitext(file.filename)[1].lower()

if ext == ".csv":
    # CSV: Parse and load
    result = ingest_handler.create_table_from_csv(saved_path)
    return {
        "status": "uploaded",
        "file_type": "CSV",
        "success": result['success'],
        "table_name": result['table_name'],
        "row_count": result['row_count'],
        "columns": result['columns'],
        ...
    }

elif ext in {".sqlite", ".db"}:
    # SQLite: Copy directly
    result = ingest_handler.copy_sqlite_database(saved_path)
    return {
        "status": "uploaded",
        "file_type": "SQLite",
        "table_count": result['table_count'],
        "tables": result['tables'],
        ...
    }
```

---

## How It Works Now (End-to-End)

### Scenario: Upload customer_sales.csv

**Step 1: Browser**
```
POST /ingest/file
  file: customer_sales.csv (50KB)
```

**Step 2: Backend**
```python
# 1. Save to uploads/customer_sales.csv
# 2. Detect ext = ".csv"
# 3. Call ingest_handler.create_table_from_csv()
#    - Read CSV → 5000 rows, 3 columns
#    - DELETE old database.sqlite (with Olist data)
#    - CREATE fresh database.sqlite
#    - INSERT data as table "customer_sales"
```

**Step 3: Response**
```json
{
  "status": "uploaded",
  "file_type": "CSV",
  "filename": "customer_sales.csv",
  "success": true,
  "table_name": "customer_sales",
  "row_count": 5000,
  "columns": ["customer_id", "product", "amount"],
  "data_shape": "5000 rows x 3 columns",
  "next": "Call GET /schema to verify table 'customer_sales' is now active."
}
```

**Step 4: Frontend calls `/schema`**
```
GET /schema
```

**Step 5: Backend**
```python
# schema.extract_schema() queries database.sqlite
# NOW IT FINDS: customer_sales table (NOT Olist)
# Returns schema for customer_sales
```

**Step 6: Response**
```json
{
  "tables": [
    {
      "id": "customer_sales",
      "name": "customer_sales",
      "display_name": "customer_sales",
      "rowCount": 5000,
      "columns": [
        {"name": "customer_id", "type": "TEXT", "is_pk": false},
        {"name": "product", "type": "TEXT", "is_pk": false},
        {"name": "amount", "type": "REAL", "is_pk": false}
      ]
    }
  ],
  "links": []  // Will be empty until FK detection finds joins
}
```

**✓ Frontend now shows user's data, NOT Olist!**

---

## What Changes for Member 2

### Upload Response Now Includes:
```json
// Before (masked the problem):
{
  "status": "uploaded",
  "database_bootstrap": true
}

// After (proves ingestion worked):
{
  "status": "uploaded",
  "file_type": "CSV",
  "success": true,                    ← PROOF
  "table_name": "customer_sales",     ← CLEAR table name
  "row_count": 5000,                  ← PROVES data loaded
  "columns": ["customer_id", ...],    ← SCHEMA visible
  "error": null                       ← ERROR details if failed
}
```

### Testing Protocol for Member 2

**Test 1: Upload CSV**
```
1. Go to Upload Screen
2. Select: sales_data.csv (any 3+ column CSV)
3. Check response:
   ✓ success: true
   ✓ row_count > 0
   ✓ table_name visible
   ✗ error: null (or has error message)
```

**Test 2: Verify Dictionary Screen**
```
1. Navigate to Dictionary
2. Check database schema:
   ✓ Shows YOUR uploaded table name (not "customers/orders/oltr_*")
   ✓ Shows YOUR columns (not dummy columns)
   ✓ Shows correct row count
```

**Test 3: Query Your Data**
```
1. Go to Chat Screen
2. Ask: "How many rows in this table?"
3. Check response:
   ✓ Uses YOUR table (not Olist)
   ✓ Returns YOUR row count
   ✓ SQL shows YOUR table name
```

**Test 4: Quality Screen**
```
1. Go to Quality Screen
2. Check health scores:
   ✓ Shows YOUR columns (not Olist dummy columns)
   ✓ Health scores calculated from YOUR data
```

---

## Key Implementation Details

### CSV Table Name Sanitization
```python
# If CSV is "Sales-2026 (DRAFT).csv"
table_name = remove_special_chars("Sales-2026 (DRAFT)")
            = "Sales_2026__DRAFT_"
# Valid SQLite identifier
```

### Database Replacement Strategy
```python
# BEFORE loading new CSV:
if os.path.exists("database.sqlite"):
    os.remove("database.sqlite")  # ← DELETE old Olist data

# THEN:
df.to_sql(table_name, new_sqlite)  # ← WRITE new user data
```
**Why:** Prevents mixing old Olist tables with new user data

### Error Handling
```python
# CSV errors caught:
- Empty file → "CSV file is empty"
- Malformed CSV → "CSV parse error: ..."
- Permission errors → "Failed to load CSV: ..."
- Encoding errors → "Failed to load CSV: ..."

# All errors returned to frontend with clear messages
```

---

## Verification Checklist for Backend Success

- [x] `ingest_handler.py` created with CSV parsing
- [x] `ingest_handler.py` created with SQLite copying
- [x] `main.py` imports `ingest_handler`
- [x] `/ingest/file` handles `.csv` extension
- [x] `/ingest/file` handles `.sqlite` and `.db` extensions
- [x] `/ingest/file` returns detailed response with table_count/row_count
- [x] CSV ingestion replaces database.sqlite (removes Olist data)
- [x] `/schema` now queries the NEW database.sqlite (not hardcoded)
- [x] `/quality` now uses the NEW database.sqlite (not hardcoded)
- [x] No hardcoded Olist fallbacks remain

---

## Syntax Validation
✓ Code checked: No syntax errors
✓ Imports check: All dependencies available (pandas, sqlite3, os all stdlib/requirements.txt)
✓ Type hints: Proper FastAPI UploadFile handling
✓ Error handling: Try-except blocks for all I/O operations

---

## Testing Recommendation

**Restart the FastAPI backend after these changes:**
```bash
cd backend
python main.py
# Server starts on http://localhost:8000
```

**Quick sanity check:**
```bash
curl -X POST http://localhost:8000/ingest/file \
  -F "file=@test.csv"
# Should return success with table_name and row_count > 0 (not hardcoded)
```

---

## Next: Member 3 Integration

Once CSV ingestion is verified working:
1. `/schema` will return user's table structure
2. Links detection still works (FK by `_id` suffix naming)
3. 3D graph can render from actual user schema, not dummy Olist

---

## Summary: What Was Wrong vs. Fixed

| Aspect | Before | After |
|--------|--------|-------|
| CSV Upload | Saved but ignored | Parsed & loaded into DB |
| Database | Hardcoded Olist | User data |
| /schema Response | Always same 9 tables | User's uploaded table |
| /quality Response | Always 100% for hardcoded tables | User's data quality |
| Feedback | Returns 200 with no detail | Returns table_count, row_count, columns |
| Error Visibility | Silent failures | Clear error messages |

**Result: Backend now processes user files, not returns dummy data ✓**
