import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Database, Columns, BarChart3, MessageSquare, Send, Loader2 } from "lucide-react"
import { useVisualizationStore } from "../store/useVisualizationStore"
import { postQueryPayload, streamColumnChat } from "../api/api"

function scoreMeta(score) {
  if (score >= 85) return { text: "Excellent", color: "text-green-400", bar: "bg-green-500" }
  if (score >= 60) return { text: "Warning", color: "text-yellow-400", bar: "bg-yellow-500" }
  return { text: "Critical", color: "text-red-400", bar: "bg-red-500" }
}

export default function NodeDetailOverlay() {
  const { selectedNode, setSelectedNode } = useVisualizationStore()
  const [chatMode, setChatMode] = useState("column")
  const [activeColumn, setActiveColumn] = useState("")
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [chatError, setChatError] = useState("")
  const streamAbortRef = useRef(null)
  const messagesEndRef = useRef(null)

  const tableName = String(selectedNode?.id || selectedNode?.name || "").trim()

  const columnNames = useMemo(() => {
    const cols = Array.isArray(selectedNode?.columns) ? selectedNode.columns : []
    return cols
      .map((col, idx) => (typeof col === "string" ? col : (col?.name || `column_${idx}`)))
      .filter(Boolean)
  }, [selectedNode?.columns])

  useEffect(() => {
    if (!selectedNode) return

    const firstColumn = columnNames[0] || ""
    setActiveColumn(firstColumn)
    setChatMode(firstColumn ? "column" : "table")
    setInput("")
    setMessages([])
    setChatError("")

    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
        streamAbortRef.current = null
      }
    }
  }, [selectedNode, selectedNode?.id, selectedNode?.name, columnNames])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const closeOverlay = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }
    setSelectedNode(null)
  }

  const updateAssistantMessage = (messageId, updater) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg
        return typeof updater === "function" ? updater(msg) : { ...msg, ...updater }
      })
    )
  }

  const sendMessage = async () => {
    const q = input.trim()
    if (!q || loading) return

    if (chatMode === "column" && !activeColumn) {
      setChatError("Select a column first for column-context chat.")
      return
    }

    const assistantId = Date.now()
    setChatError("")
    setInput("")
    setLoading(true)
    setMessages((prev) => [
      ...prev,
      { id: `${assistantId}-user`, role: "user", content: q },
      { id: assistantId, role: "assistant", content: "" },
    ])

    try {
      if (chatMode === "column") {
        const controller = new AbortController()
        streamAbortRef.current = controller

        await streamColumnChat(
          {
            table: tableName,
            column: activeColumn,
            question: q,
          },
          {
            signal: controller.signal,
            onDelta: (delta) => {
              updateAssistantMessage(assistantId, (msg) => ({
                ...msg,
                content: `${msg.content || ""}${delta || ""}`,
              }))
            },
            onDone: (payload) => {
              updateAssistantMessage(assistantId, (msg) => ({
                ...msg,
                content: (msg.content || payload?.answer || "No response from assistant.").trim(),
                sql: payload?.sql,
              }))
            },
            onError: (message) => {
              setChatError(String(message || "Column chat failed."))
            },
          }
        )
      } else {
        const scopedQuery = chatMode === "table"
          ? `Focus on table ${tableName} and these columns: ${columnNames.slice(0, 20).join(", ") || "N/A"}. Question: ${q}`
          : q

        const response = await postQueryPayload({ query: scopedQuery })
        const data = response?.data || {}
        const answer =
          data.natural_answer ||
          data.explanation ||
          data.answer ||
          "No response from assistant."

        updateAssistantMessage(assistantId, {
          content: String(answer),
          sql: data.sql || "",
        })
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Node overlay chat failed:", error)
        setChatError("Failed to get assistant response. Please retry.")
        updateAssistantMessage(assistantId, {
          content: "I could not complete this request due to a backend error.",
          error: true,
        })
      }
    } finally {
      if (streamAbortRef.current) {
        streamAbortRef.current = null
      }
      setLoading(false)
    }
  }

  if (!selectedNode) return null

  const score = Number(selectedNode.qualityScore || 0)
  const meta = scoreMeta(score)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 24, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 24, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="absolute right-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] w-[430px] max-w-[95vw] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)]/95 p-4 shadow-[var(--shadow-lg)] backdrop-blur"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Table Detail</p>
            <h3 className="mt-1 break-words text-lg font-bold text-[var(--text-primary)]">{selectedNode.name}</h3>
          </div>
          <button
            onClick={closeOverlay}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            aria-label="Close node details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Database className="w-4 h-4" />Rows</span>
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{Number(selectedNode.rows || 0).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Columns className="w-4 h-4" />Columns</span>
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{(selectedNode.columns || []).length}</span>
          </div>
          <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><BarChart3 className="w-4 h-4" />Quality</span>
            <span className={`text-sm font-semibold ${meta.color}`}>{score}% ({meta.text})</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border-default)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full ${meta.bar}`}
            />
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Columns</p>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {columnNames.map((colName, idx) => {
              const isActive = activeColumn === colName
              return (
                <button
                  type="button"
                  key={`${colName}-${idx}`}
                  onClick={() => {
                    setActiveColumn(colName)
                    setChatMode("column")
                  }}
                  className={`w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-left text-xs transition ${
                    isActive
                      ? "border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {colName}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-3 py-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
              <MessageSquare className="h-3.5 w-3.5" /> Node Chat Assistant
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setChatMode("column")}
                disabled={!activeColumn}
                className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[10px] uppercase tracking-wide transition ${
                  chatMode === "column"
                    ? "border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)]"
                    : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                } disabled:opacity-40`}
              >
                Column
              </button>
              <button
                type="button"
                onClick={() => setChatMode("table")}
                className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[10px] uppercase tracking-wide transition ${
                  chatMode === "table"
                    ? "border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)]"
                    : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setChatMode("dataset")}
                className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[10px] uppercase tracking-wide transition ${
                  chatMode === "dataset"
                    ? "border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)]"
                    : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Dataset
              </button>
            </div>
          </div>

          <div className="border-b border-[var(--border-default)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
            {chatMode === "column"
              ? `Context: ${tableName}.${activeColumn || "select a column"}`
              : chatMode === "table"
                ? `Context: table ${tableName}`
                : "Context: whole dataset"}
          </div>

          <div className="max-h-52 overflow-y-auto space-y-2 p-3">
            {messages.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text-secondary)]">
                Ask about a selected column, this table, or the full dataset.
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-[var(--radius-sm)] border px-2 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "ml-6 border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                      : "mr-3 border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                  }`}
                >
                  {msg.content || (loading && msg.role === "assistant" ? "Thinking..." : "")}
                  {msg.sql ? (
                    <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-void)] p-2 font-mono text-[10px] text-[var(--text-muted)]">
                      {msg.sql}
                    </pre>
                  ) : null}
                </div>
              ))
            )}

            {loading ? (
              <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {chatError ? (
            <div className="mx-3 mb-2 rounded-[var(--radius-sm)] border border-[rgba(239,68,68,0.35)] bg-[var(--danger-dim)] px-2 py-1.5 text-[11px] text-[var(--danger)]">
              {chatError}
            </div>
          ) : null}

          <div className="border-t border-[var(--border-default)] p-3">
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-1.5 focus-within:border-[var(--accent)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={chatMode === "column" ? "Ask about this column..." : "Ask about this data..."}
                className="h-8 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)] transition hover:bg-[rgba(99,102,241,0.22)] disabled:opacity-50"
                aria-label="Send node chat question"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
