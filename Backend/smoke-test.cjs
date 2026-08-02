const axios = require("axios");

const BASE = "https://olivaceous-shaunte-indeterminedly.ngrok-free.dev";
const HEADERS = { "ngrok-skip-browser-warning": "true" };

const checks = [];
function pass(name, extra = "") { checks.push({ ok: true, name, extra }); }
function fail(name, extra = "") { checks.push({ ok: false, name, extra }); }

function hasControlTokens(text) {
  const s = String(text || "").toLowerCase();
  return ["<|system|>", "<|user|>", "<|assistant|>", "<|end|>"].some((t) => s.includes(t));
}

(async () => {
  try {
    // 1) Schema
    const schemaRes = await axios.get(BASE + "/schema", { headers: HEADERS });
    const tables = Array.isArray(schemaRes.data?.tables) ? schemaRes.data.tables : [];
    if (tables.length >= 1) pass("schema returns tables", "tables=" + tables.length);
    else fail("schema returns tables", "tables=0");

    if (tables.length >= 3) pass("multi-file ingest merged", "tables=" + tables.length);
    else fail("multi-file ingest merged", "expected >=3 tables after multi-upload, got " + tables.length);

    // Optional metadata check
    const firstCol = tables[0]?.columns?.[0];
    if (firstCol && typeof firstCol === "object") {
      const hasAnyMeta =
        ("nullable" in firstCol) || ("foreign_key" in firstCol) || ("default" in firstCol) ||
        ("default_value" in firstCol) || ("sample" in firstCol) || ("sample_value" in firstCol);
      if (hasAnyMeta) pass("schema has richer column metadata");
      else fail("schema has richer column metadata", "nullable/fk/default/sample missing");
    } else {
      fail("schema has richer column metadata", "column object not available");
    }

    // 2) Relationships
    const relRes = await axios.get(BASE + "/relationships", { headers: HEADERS });
    const rels = Array.isArray(relRes.data?.relationships) ? relRes.data.relationships : [];
    if (rels.length > 0) pass("relationships inferred/formal links exist", "relationships=" + rels.length);
    else fail("relationships inferred/formal links exist", "relationships=0");

    // 3) Combined graph-data
    const graphRes = await axios.post(BASE + "/graph-data", {}, { headers: HEADERS });
    const graphTables = Array.isArray(graphRes.data?.schema?.tables) ? graphRes.data.schema.tables : [];
    if (graphTables.length >= 1) pass("graph-data contains schema tables", "tables=" + graphTables.length);
    else fail("graph-data contains schema tables", "tables=0");

    // 4) Query normal
    const q1 = "show 5 rows from products";
    const q1Res = await axios.post(BASE + "/query", { query: q1 }, { headers: HEADERS });
    const q1Data = q1Res.data || {};

    if (Array.isArray(q1Data.queried_tables))
      pass("query returns queried_tables array", "len=" + q1Data.queried_tables.length);
    else
      fail("query returns queried_tables array", "missing array");

    if (!hasControlTokens(q1Data.sql) && !hasControlTokens(q1Data.generated_sql))
      pass("sql/generated_sql sanitized from control tokens");
    else
      fail("sql/generated_sql sanitized from control tokens", "control tokens found");

    // 5) Query likely fallback path
    const q2 = "sort ascendingly product_length_cm";
    const q2Res = await axios.post(BASE + "/query", { query: q2 }, { headers: HEADERS });
    const q2Data = q2Res.data || {};

    const usedFallback = q2Data.used_fallback === true;
    const execOk = q2Data.execution_ok === true;
    const execErr = String(q2Data.execution_error || "").trim().length > 0;

    // Contract consistency:
    // if used_fallback=true => execution_ok should be false and execution_error should exist
    if (usedFallback) {
      if (!execOk && execErr) pass("fallback flags consistent");
      else fail("fallback flags consistent", "used_fallback=true but execution_ok/execution_error inconsistent");
    } else {
      // non-fallback path can be success or hard error, but should not be contradictory
      if (!(execOk && execErr)) pass("non-fallback flags non-contradictory");
      else fail("non-fallback flags non-contradictory", "execution_ok=true with execution_error present");
    }

  } catch (e) {
    fail("unexpected runtime error", e.message);
  }

  // Output summary
  const total = checks.length;
  const ok = checks.filter((c) => c.ok).length;
  const bad = total - ok;

  console.log("\nAPI SMOKE TEST RESULTS");
  console.log("----------------------");
  checks.forEach((c, i) => {
    const mark = c.ok ? "PASS" : "FAIL";
    console.log((i + 1) + ". " + mark + " - " + c.name + (c.extra ? " (" + c.extra + ")" : ""));
  });
  console.log("----------------------");
  console.log("Passed: " + ok + "/" + total);
  if (bad > 0) process.exit(1);
})();
