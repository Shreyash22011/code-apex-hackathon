import schema
import traceback

try:
    result = schema.extract_schema()
    print(f"✓ schema.extract_schema() succeeded")
    print(f"  Tables found: {len(result['tables'])}")
    if result['tables']:
        print(f"  First table: {result['tables'][0]['name']}")
    else:
        print(f"  ERROR: No tables returned!")
except Exception as e:
    print(f"✗ schema.extract_schema() failed: {e}")
    traceback.print_exc()
