from fastapi.testclient import TestClient

import main
import llm


client = TestClient(main.app)


def _assert_health_score(score):
    assert isinstance(score, (int, float)), f"health_score must be numeric, got {type(score)}"
    assert 0 <= score <= 100, f"health_score must be in 0-100 range, got {score}"


def test_schema_contract():
    resp = client.get("/schema")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert "tables" in payload and isinstance(payload["tables"], list)
    assert "links" in payload and isinstance(payload["links"], list)

    for table in payload["tables"]:
        assert "id" in table
        assert "group" in table
        assert "row_count" in table
        # Backward compatibility fields
        assert "rowCount" in table


def test_relationships_contract():
    resp = client.get("/relationships")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert payload.get("mode") in {"formal", "inferred"}
    assert isinstance(payload.get("relationship_count"), int)
    assert isinstance(payload.get("relationships"), list)

    for rel in payload["relationships"]:
        assert "id" in rel
        assert "source_table" in rel
        assert "target_table" in rel
        assert "source_column" in rel
        assert "target_column" in rel
        assert "type" in rel
        assert "confidence" in rel
        assert "cardinality" in rel
        assert "inference_method" in rel


def test_quality_contract():
    resp = client.get("/quality")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert "items" in payload and isinstance(payload["items"], list)

    for item in payload["items"]:
        assert "table" in item
        assert "health_score" in item
        _assert_health_score(item["health_score"])


def test_graph_data_contract():
    resp = client.post("/graph-data")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert "schema" in payload
    assert "relationships" in payload
    assert "quality" in payload


def test_query_has_queried_tables_field():
    original_ask = llm.ask_llm
    try:
        def fake_ask(_prompt: str, task: str = "sql") -> str:
            if task == "sql":
                return "SELECT name FROM sqlite_master LIMIT 1;"
            return "Returns one row from sqlite_master."

        llm.ask_llm = fake_ask
        resp = client.post("/query", json={"query": "show all rows"})
        assert resp.status_code == 200, resp.text
        payload = resp.json()

        assert "queried_tables" in payload
        assert isinstance(payload["queried_tables"], list)
    finally:
        llm.ask_llm = original_ask


if __name__ == "__main__":
    test_schema_contract()
    test_relationships_contract()
    test_quality_contract()
    test_graph_data_contract()
    test_query_has_queried_tables_field()
    print("All API contract checks passed.")
