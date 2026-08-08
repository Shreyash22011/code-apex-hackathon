import sqlite3

import llm


def _connection():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, customer_name TEXT, region TEXT)")
    conn.execute("CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer_id INTEGER, total_amount REAL)")
    conn.executemany("INSERT INTO customers VALUES (?, ?, ?)", [(1, "Ada", "North"), (2, "Lin", "South")])
    conn.executemany("INSERT INTO orders VALUES (?, ?, ?)", [(10, 1, 25.5), (11, 2, 40.0)])
    return conn


def test_schema_context_is_compact_and_safe_for_quoted_identifiers():
    conn = _connection()
    context = llm.build_schema_context(conn, ["customers"])

    assert "TABLE customers (2 rows)" in context
    assert "customer_name TEXT; examples: 'Ada', 'Lin'" in context
    assert "null:" not in context  # five-row samples must not masquerade as null statistics


def test_relevance_ranks_table_and_column_terms():
    conn = _connection()

    assert llm.get_relevant_tables(conn, "show customer names")[0] == "customers"
    assert llm.get_relevant_tables(conn, "total order amount")[0] == "orders"


def test_sql_prompt_avoids_chain_of_thought_and_training_examples():
    prompt = llm.prompt_nl_to_sql("show customers", "TABLE customers (2 rows)")

    assert "Think step by step" not in prompt
    assert "EXAMPLES OF GOOD SQL" not in prompt
    assert "Return SQL only" in prompt
