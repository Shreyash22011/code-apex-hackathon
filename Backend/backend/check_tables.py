import sqlite3
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
tables = [row[0] for row in cursor.fetchall()]
print(f'Total tables: {len(tables)}')
for t in tables:
    cursor.execute(f'SELECT COUNT(*) FROM "{t}"')
    row_count = cursor.fetchone()[0]
    print(f'  {t}: {row_count} rows')
conn.close()
