function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toMetricFraction(rawValue) {
  const n = toFiniteNumber(rawValue)
  if (n === null) return null
  if (n < 0) return 0
  if (n <= 1) return n
  return n / 100
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") {
    return Object.entries(value).map(([column, stats]) => ({
      column,
      ...(stats || {}),
    }))
  }
  return []
}

function normalizeColumn(item = {}) {
  return {
    ...item,
    name: item.name || item.column || "",
    type: item.type || item.data_type || "",
    null_percent: item.null_percent ?? item.null_percentage ?? item.nulls ?? null,
    uniqueness_percent: item.uniqueness_percent ?? item.uniqueness ?? item.unique_percent ?? null,
    is_pk: Boolean(item.is_pk || item.is_primary_key),
    is_fk: Boolean(item.is_fk || item.is_foreign_key),
  }
}

export function normalizeQualityItem(item = {}, fallbackTable = "") {
  return {
    ...item,
    table: item.table || item.table_name || item.name || fallbackTable || "unknown_table",
    health_score: item.health_score ?? item.score ?? item.qualityScore ?? null,
    completeness: item.completeness ?? null,
    freshness: item.freshness ?? null,
    consistency: item.consistency ?? null,
    columns: Array.isArray(item.columns) ? item.columns.map(normalizeColumn) : [],
  }
}

export function normalizeQualityItems(payload) {
  let source = payload

  if (!Array.isArray(source)) {
    if (Array.isArray(payload?.tables)) {
      source = payload.tables
    } else if (Array.isArray(payload?.items)) {
      source = payload.items
    } else {
      source = []
    }
  }

  return source.map((item) => normalizeQualityItem(item))
}

function normalizeCorrelationPairs(rawPairs) {
  let pairs = rawPairs

  if (!Array.isArray(pairs) && pairs && typeof pairs === "object") {
    pairs = Object.entries(pairs).map(([pair, value]) => ({ pair, r: value }))
  }

  if (!Array.isArray(pairs)) return []

  return pairs.map((pairItem) => {
    const pairText = String(pairItem?.pair || "")
    const [left, right] = pairText.split(/[|,]/).map((part) => part?.trim()).filter(Boolean)

    return {
      ...pairItem,
      col_a: pairItem?.col_a || pairItem?.column_a || pairItem?.x || left || "",
      col_b: pairItem?.col_b || pairItem?.column_b || pairItem?.y || right || "",
      r: pairItem?.r ?? pairItem?.correlation ?? null,
    }
  })
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value
      .map((item) => safeText(item, ""))
      .filter(Boolean)
      .join("\n")
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => `${key}: ${safeText(val, "-")}`)
      .join("\n")
  }
  return String(value)
}

export function normalizeAnalysisPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      raw: null,
      numericStats: [],
      categoricalStats: [],
      dateStats: [],
      correlationPairs: [],
      ctoNarrative: "",
      modelingReadiness: "",
      diagnostics: {},
    }
  }

  return {
    raw,
    numericStats: toArray(raw.numeric_stats ?? raw.numeric ?? raw.stats?.numeric),
    categoricalStats: toArray(raw.categorical_stats ?? raw.categorical ?? raw.stats?.categorical),
    dateStats: toArray(raw.date_stats ?? raw.date ?? raw.stats?.date),
    correlationPairs: normalizeCorrelationPairs(raw.correlation_pairs ?? raw.correlations ?? raw.stats?.correlations),
    ctoNarrative: safeText(raw.analysis_text ?? raw.llm_analysis ?? raw.report, "").trim(),
    modelingReadiness: safeText(raw.modeling_readiness, "").trim(),
    diagnostics: raw.diagnostics || {},
  }
}

export function classifyAnalysisError(error) {
  const status = error?.response?.status
  const code = error?.code

  if (code === "ECONNABORTED") {
    return {
      kind: "timeout",
      userLabel: "timeout",
      detail: "Request timed out before analysis finished.",
    }
  }

  if (!status && (code === "ERR_NETWORK" || code === "ENOTFOUND" || code === "ECONNRESET")) {
    return {
      kind: "network",
      userLabel: "network",
      detail: "Network connection to analysis service failed.",
    }
  }

  if (status === 404) {
    return {
      kind: "not-found",
      userLabel: "not found",
      detail: "Analysis endpoint returned 404 for this table.",
    }
  }

  if (status && status >= 500) {
    return {
      kind: "server",
      userLabel: "server",
      detail: "Backend analysis service returned a 5xx error.",
    }
  }

  if (status && status >= 400) {
    return {
      kind: "request",
      userLabel: `http ${status}`,
      detail: "Analysis request was rejected by backend.",
    }
  }

  return {
    kind: "unknown",
    userLabel: "unknown",
    detail: error?.message || "Unknown analysis fetch error.",
  }
}

export function toDisplayHealthScore(rawScore) {
  const fraction = toMetricFraction(rawScore)
  if (fraction === null) return null
  return Math.round(fraction * 100)
}
