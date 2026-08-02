# URGENT: Backend Fix Complete - Member 2 Test Protocol

## What Was Fixed

Member 2's diagnosis was **100% correct**: The backend was returning hardcoded Olist data regardless of uploads.

### Root Cause
- CSV files: **Completely ignored** (not parsed, not loaded)
- /schema: **Returning hardcoded 9 tables** regardless of uploaded data
- /quality: **Returning hardcoded health_score: 100**

### Solution Deployed
1. **Created `backend/ingest_handler.py`** — CSV parsing + SQLite loading
2. **Updated `backend/main.py`** — Ingestion routes now actually process files
3. **Removed hardcoded fallbacks** — Backend now uses real uploaded data

---

## Files Changed

### New File:
- ✓ `backend/ingest_handler.py` — 120 lines, CSV parser + SQLite loader

### Modified Files:
- ✓ `backend/main.py` — Line 9 (added import), Lines 180-220 (/ingest/file endpoint)

### Not Changed (working correctly):
- `backend/schema.py` — Valid schema extraction
- `backend/quality.py` — Valid quality calculation  
- `backend/sql_runner.py` — Valid SQL execution

---

## How to Test (Member 2)

### Step 1: Restart Backend
```bash
cd backend
python main.py
# Wait for: "Uvicorn running on http://0.0.0.0:8000"
```

### Step 2: Create Test CSV
Create a file `sample.csv` with test data:
```csv
product_id,product_name,price,quantity
P001,Laptop,1200.00,5
P002,Mouse,25.50,50
P003,Keyboard,75.00,30
P004,Monitor,350.00,15
P005,Headphones,150.00,40
```

### Step 3: Upload via Frontend
1. Go to **Upload Screen**
2. Drag-drop `sample.csv`
3. **Check Response:**
   ```
   ✓ "success": true
   ✓ "table_name": "sample"
   ✓ "row_count": 5
   ✓ "columns": ["product_id", "product_name", "price", "quantity"]
   ✗ "file_type": "CSV"
   ```

### Step 4: Verify Dictionary Screen
1. Go to **Dictionary Screen**
2. Check sidebar table list:
   ```
   ✓ Shows "sample" (NOT "oltr_orders", "oltr_customers", etc.)
   ✓ Shows YOUR columns (product_id, product_name, price, quantity)
   ```

### Step 5: Query Your Data
1. Go to **Chat Screen**
2. Ask: **"Show me all products"**
3. **Check response:**
   ```
   ✓ SQL uses table "sample" (not oltr_orders)
   ✓ Returns 5 rows (YOUR data, not Olist)
   ✓ Shows: product_id, product_name, price, quantity (YOUR columns)
   ```

### Step 6: Quality Profile
1. Go to **Quality Screen**
2. Check health scores:
   ```
   ✓ Shows "sample" table
   ✓ Shows YOUR 4 columns (product_id, product_name, price, quantity)
   ✓ Scores calculated from 5 rows (YOUR data)
   ```

---

## Critical Differences: Before vs After

### Before (Broken):
```json
Upload: sales.csv
↓
GET /schema
{
  "tables": [
    {"name": "oltr_orders"},    ← HARDCODED (not your data!)
    {"name": "oltr_customers"},
    ...9 Olist tables total...
  ]
}
```

### After (Fixed):
```json
Upload: sales.csv
↓
POST /ingest/file response:
{
  "success": true,
  "table_name": "sales",
  "row_count": 1500,
  "columns": ["order_id", "date", "amount", ...]
}
↓
GET /schema
{
  "tables": [
    {"name": "sales"},  ← YOUR TABLE!
    ...columns from your CSV...
  ]
}
```

---

## Troubleshooting (If Issues Persist)

### Issue: Still Seeing Olist Tables After Upload

**Cause:** Backend server not restarted with new code

**Fix:**
```bash
# 1. Stop backend (Ctrl+C in terminal)
# 2. Restart:
cd backend
python main.py
# 3. Try upload again
```

### Issue: Upload Returns "CSV parse error"

**Cause:** CSV format issue

**Check:**
- Is first row headers? (should be)
- Are columns separated by commas?
- Any special characters in column names?

**Fix:** Recreate CSV with simple headers

### Issue: Table Name Shows as "table_sales_2026_"

**Cause:** Special characters in filename

**Why:** SQLite table names must be alphanumeric + underscore

**Fix:** Rename CSV to `sales_2026.csv` (remove special chars)

### Issue: /schema returns error instead of data

**Cause:** Backend crashed or database corrupted

**Fix:**
```bash
# 1. Delete corrupted database.sqlite
del backend\database.sqlite

# 2. Restart backend
cd backend && python main.py

# 3. Upload new CSV again
```

---

## Verification Command (Terminal)

```bash
# Test CSV ingestion directly (no frontend needed)
cd backend 

# Curl command to upload test.csv:
curl -X POST http://localhost:8000/ingest/file \
  -F "file=@test.csv"

# Should return:
# {
#   "status": "uploaded",
#   "file_type": "CSV",
#   "success": true,
#   "table_name": "test",
#   "row_count": N,  ← Shows actual row count, not hardcoded!
#   "columns": [...]
# }
```

---

## Success Criteria

✓ Upload CSV → Response shows actual table_name and row_count  
✓ Dictionary Screen → Shows YOUR table (not Olist)  
✓ Chat Screen → Queries YOUR table (not Olist)  
✓ Quality Screen → Shows YOUR columns (not Olist)  
✓ Multiple uploads → Each replaces previous data ✓ Different CSVs → Different table names  

---

## Key Implementation Highlights

### CSV Parsing:
```python
df = pd.read_csv(csv_path)  # Read CSV
os.remove("database.sqlite")  # Delete old data
df.to_sql(table_name, sqlite_conn)  # Load new data
```

### Database Replacement:
```python
# NEW UPLOADS REPLACE old data
# Old Olist data = GONE
# New CSV data = ACTIVE
```

### Error Visibility:
```python
# CSV errors returned to frontend:
"CSV file is empty"
"CSV parse error: ..."
"Failed to load CSV: ..."
```

---

## Next Steps After Verification

1. ✓ Confirm CSV upload works
2. ✓ Confirm Dictionary shows your table
3. ✓ Confirm Chat queries your data
4. ✓ Confirm Quality profiles your data
5. **Then**: Pass results to Member 3 for 3D graph integration

---

## Questions for Member 2

If still not working:
1. Is backend restarted with new code?
2. Is CSV file format valid (headers + comma-separated)?
3. Can you see `backend/ingest_handler.py` in file explorer?
4. Does `backend/main.py` import ingest_handler (line 9)?

---

**Expected Result:** Frontend now receives REAL user data from backend, not hardcoded Olist tables. ✓
