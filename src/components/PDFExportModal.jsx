import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Loader2, FileText, CheckCircle2,
  BarChart2, ShieldCheck
} from 'lucide-react';
import { getSummaryNarrative, getTableAnalysis, requestWithRetry } from '../api/api';
import {
  classifyAnalysisError,
  normalizeAnalysisPayload,
  normalizeQualityItems,
  toDisplayHealthScore,
} from '../utils/reportData';

export default function PDFExportModal({ open, onClose, schemaData, qualityData, userContext }) {
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState('');
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch AI narrative from your backend
  async function fetchAINarrative() {
    try {
      const response = await requestWithRetry(
        () => getSummaryNarrative({
          schema_data: schemaData ?? { tables: [] },
          user_context: userContext ?? "",
        }),
        { retries: 1, baseDelayMs: 500 }
      );
      return response?.data ?? null;
    } catch (error) {
      console.error('Failed to fetch AI summary for PDF export:', error?.response?.data || error);
      return null;
    }
  }

  function buildLocalEngineerNarrative() {
    const tables = Array.isArray(schemaData?.tables) ? schemaData.tables : [];
    const qualityItems = normalizeQualityItems(qualityData);

    const totalRows = tables.reduce((sum, table) => {
      const rawRows = Number(table?.row_count ?? table?.rowCount ?? table?.rows ?? 0);
      return sum + (Number.isFinite(rawRows) ? rawRows : 0);
    }, 0);

    const totalColumns = tables.reduce((sum, table) => {
      const cols = Array.isArray(table?.columns) ? table.columns.length : 0;
      return sum + cols;
    }, 0);

    const relationshipLines = Array.isArray(schemaData?.relationship_lines)
      ? schemaData.relationship_lines
      : [];
    const links = Array.isArray(schemaData?.links) ? schemaData.links : [];
    const relationshipCount = relationshipLines.length || links.length;

    const qualityScores = qualityItems
      .map((item) => toDisplayHealthScore(item.health_score ?? item.score))
      .filter((score) => score !== null);

    const avgHealth = qualityScores.length
      ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
      : null;

    const lowHealthTables = qualityItems
      .map((item) => ({
        table: item.table || item.name || 'unknown_table',
        score: toDisplayHealthScore(item.health_score ?? item.score),
      }))
      .filter((item) => item.score !== null && item.score < 70)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 4)
      .map((item) => `${item.table} (${item.score}%)`);

    const highNullColumns = qualityItems
      .flatMap((item) => {
        const tableName = item.table || item.name || 'unknown_table';
        const columns = Array.isArray(item.columns) ? item.columns : [];
        return columns.map((col) => {
          const nullRaw = Number(col?.null_percent ?? col?.null_percentage ?? -1);
          const nullPercent = Number.isFinite(nullRaw)
            ? (nullRaw <= 1 ? nullRaw * 100 : nullRaw)
            : -1;
          return {
            table: tableName,
            column: col?.name || 'unknown_column',
            nullPercent,
          };
        });
      })
      .filter((item) => item.nullPercent >= 20)
      .sort((a, b) => b.nullPercent - a.nullPercent)
      .slice(0, 6)
      .map((item) => `${item.table}.${item.column} (${Math.round(item.nullPercent)}% null)`);

    const largestTables = tables
      .map((table) => ({
        name: table?.name || table?.id || table?.table || 'unknown_table',
        rows: Number(table?.row_count ?? table?.rowCount ?? table?.rows ?? 0),
      }))
      .filter((item) => Number.isFinite(item.rows))
      .sort((a, b) => b.rows - a.rows)
      .slice(0, 4)
      .map((item) => `${item.name} (${item.rows.toLocaleString()} rows)`);

    const avgColumnsPerTable = tables.length ? (totalColumns / tables.length).toFixed(1) : '0.0';
    const relationshipDensity = tables.length ? (relationshipCount / tables.length).toFixed(2) : '0.00';

    const executiveSummary = [
      `This dataset currently spans ${tables.length} tables, ${totalColumns.toLocaleString()} columns, and approximately ${totalRows.toLocaleString()} rows, which is sufficient for production-grade analytics and feature engineering pipelines.`,
      `Schema coupling shows ${relationshipCount} detected inter-table links (${relationshipDensity} relationships per table), indicating moderate join complexity that should be validated with key-cardinality tests before metric publication.`,
      avgHealth !== null
        ? `Quality telemetry reports an average table health of ${avgHealth}%, which means dashboard trust depends on isolating low-confidence entities from critical KPI paths.`
        : 'Quality telemetry is incomplete, so reliability scoring should be finalized before leadership-facing dashboards are automated.',
      largestTables.length
        ? `Highest-volume entities are ${largestTables.join(', ')}, and these should be prioritized for indexing, partition strategy, and freshness monitoring.`
        : 'No high-volume table signal was detected from the provided schema payload.',
      highNullColumns.length
        ? `Null concentration hotspots were detected in ${highNullColumns.join(', ')}, creating material risk for silent bias in aggregates and downstream model training sets.`
        : 'No severe null-concentration hotspots were detected above the configured risk threshold in available profiling data.',
      lowHealthTables.length
        ? `At-risk tables include ${lowHealthTables.join(', ')} and should be wrapped with stricter contracts, lineage checks, and alerting before cross-team reuse.`
        : 'No table fell below the high-risk quality threshold in this snapshot.',
      `For software engineering teams, the immediate objective should be enforcing deterministic transformations, testable metric definitions, and join-coverage checks so analytical behavior remains stable across releases.`
    ].join(' ');

    const keyFindings = [
      `Schema footprint: ${tables.length} tables, ${totalColumns.toLocaleString()} columns, ${totalRows.toLocaleString()} rows.`,
      `Relationship graph exposes ${relationshipCount} links, requiring explicit FK/cardinality verification in CI.`,
      `Average columns per table is ${avgColumnsPerTable}, suggesting ${Number(avgColumnsPerTable) >= 15 ? 'wide-table normalization opportunities' : 'manageable schema width'} for modeling and reporting.`
    ];

    if (largestTables.length) {
      keyFindings.push(`Primary volume drivers: ${largestTables.join(', ')}.`);
    }
    if (lowHealthTables.length) {
      keyFindings.push(`Quality-critical tables: ${lowHealthTables.join(', ')}.`);
    }
    if (highNullColumns.length) {
      keyFindings.push(`High-null columns affecting reliability: ${highNullColumns.slice(0, 4).join(', ')}.`);
    }

    const statisticalInsights = [
      `Profile metrics indicate a row distribution dominated by the largest entities, so query plans and caching policies should focus on those heavy tables first to control latency and cost.`,
      highNullColumns.length
        ? `Missingness patterns in ${highNullColumns.slice(0, 3).join(', ')} imply non-random null behavior; teams should validate whether nulls represent true absence or ingest gaps before feature generation.`
        : `Null patterns are within acceptable thresholds in available metadata, but periodic drift checks are still required to detect ingestion regressions early.`,
      relationshipCount > 0
        ? `Detected relationship topology enables multi-hop analytics, but it also amplifies risk of row-multiplication errors unless uniqueness and orphan ratios are continuously monitored.`
        : `Relationship topology is sparse in current metadata, limiting confidence in cross-table attribution until additional key mappings are established.`,
      `Given this profile, modeling readiness is moderate-to-high if schema contracts and data quality gates are enforced in deployment pipelines.`
    ].join(' ');

    const recommendations = [
      'Add automated key-cardinality and orphan-ratio checks for every declared relationship before each release.',
      'Promote high-volume tables into performance-aware serving patterns (indexes, partitioning, and incremental refresh).',
      'Define column-level null-handling policies and enforce them in ETL test suites for high-risk fields.',
      'Track table health scores over time and block downstream publication when quality SLOs are breached.',
      'Version business metrics in a governed semantic layer to prevent logic drift across dashboards and services.'
    ];

    return {
      executive_summary: executiveSummary,
      key_findings: keyFindings,
      statistical_insights: statisticalInsights,
      recommendations: recommendations,
    };
  }

  async function generatePDF() {
    setGenerating(true);
    setDone(false);
    setErrorMessage('');

    try {
      setStep('Generating AI analysis narrative...');
      const aiNarrative = await fetchAINarrative();
      const localNarrative = buildLocalEngineerNarrative();

      setStep('Building PDF structure...');
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTableFn = autoTableModule?.default || autoTableModule?.autoTable;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210, MARGIN = 18, LINE = W - MARGIN * 2;
      let y = 0;

      function renderAutoTable(options, nextGap = 8) {
        if (typeof doc.autoTable === 'function') {
          doc.autoTable(options);
          const tableY = doc?.lastAutoTable?.finalY;
          if (Number.isFinite(tableY)) {
            y = tableY + nextGap;
          }
          return true;
        }

        if (typeof autoTableFn === 'function') {
          autoTableFn(doc, options);
          const tableY = doc?.lastAutoTable?.finalY;
          if (Number.isFinite(tableY)) {
            y = tableY + nextGap;
          }
          return true;
        }

        return false;
      }

      function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
      }

      function toFiniteNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      }

      // Accept both 0-1 and 0-100 formats from backend payloads.
      function toMetricFraction(rawValue) {
        const n = toFiniteNumber(rawValue);
        if (n === null) return null;
        if (n < 0) return 0;
        return n <= 1 ? clamp(n, 0, 1) : clamp(n / 100, 0, 1);
      }

      function toPercentText(rawValue) {
        const fraction = toMetricFraction(rawValue);
        if (fraction === null) return 'N/A';
        return `${Math.round(fraction * 100)}%`;
      }

      function toPercentCell(rawValue) {
        const n = toFiniteNumber(rawValue);
        if (n === null) return 'N/A';
        const percent = n <= 1 ? n * 100 : n;
        return `${Math.round(percent * 10) / 10}%`;
      }

      function toFixedOrDash(rawValue, digits = 2) {
        const n = toFiniteNumber(rawValue);
        if (n === null) return '-';
        return n.toFixed(digits);
      }

      function safeText(value, fallback = '') {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
          return value
            .map((item) => safeText(item, ''))
            .filter(Boolean)
            .join('\n');
        }
        if (typeof value === 'object') {
          return Object.entries(value)
            .map(([key, val]) => `${key}: ${safeText(val, '-')}`)
            .join('\n');
        }
        return String(value);
      }

      function toBulletList(value, fallback = []) {
        if (Array.isArray(value)) {
          const normalized = value
            .map((item) => safeText(item, '').trim())
            .filter(Boolean);
          return normalized.length ? normalized : fallback;
        }
        if (typeof value === 'string') {
          const normalized = value
            .split(/\r?\n|;/)
            .map((item) => item.trim())
            .filter(Boolean);
          return normalized.length ? normalized : fallback;
        }
        if (value && typeof value === 'object') {
          const normalized = Object.values(value)
            .map((item) => safeText(item, '').trim())
            .filter(Boolean);
          return normalized.length ? normalized : fallback;
        }
        return fallback;
      }

      const normalizedQualityData = normalizeQualityItems(qualityData);
      const qualityScores = normalizedQualityData
        .map((item) => toDisplayHealthScore(item.health_score ?? item.score))
        .filter((score) => score !== null);

      function addPage() {
        doc.addPage();
        y = MARGIN;
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 140);
        doc.text(`SchemaSense AI — Confidential Data Analysis Report`, MARGIN, 287);
        doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, W - MARGIN, 287, { align: 'right' });
      }

      function checkY(needed = 20) {
        if (y + needed > 270) addPage();
      }

      function sectionHeading(text, color = [99, 102, 241]) {
        checkY(16);
        doc.setFillColor(...color);
        doc.roundedRect(MARGIN, y, 3, 10, 1, 1, 'F');
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 40);
        doc.text(text, MARGIN + 7, y + 7);
        y += 16;
        doc.setDrawColor(230, 230, 240);
        doc.line(MARGIN, y, W - MARGIN, y);
        y += 6;
      }

      function bodyText(text, indent = 0) {
        const normalizedText = safeText(text, '').trim();
        if(!normalizedText) return;
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 55, 70);
        const lines = doc.splitTextToSize(normalizedText, LINE - indent);
        lines.forEach(line => {
          checkY(6);
          doc.text(line, MARGIN + indent, y);
          y += 5.5;
        });
        y += 2;
      }

      function bulletPoint(text, color = [99, 102, 241]) {
        const normalizedText = safeText(text, '').trim();
        if(!normalizedText) return;
        checkY(7);
        doc.setFillColor(...color);
        doc.circle(MARGIN + 2, y - 1, 1.2, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 55, 70);
        const lines = doc.splitTextToSize(normalizedText, LINE - 8);
        doc.text(lines[0], MARGIN + 6, y);
        y += 5;
        for (let i = 1; i < lines.length; i++) {
          checkY(5);
          doc.text(lines[i], MARGIN + 6, y);
          y += 5;
        }
      }

      // COVER
      doc.setFillColor(15, 18, 32);
      doc.rect(0, 0, W, 70, 'F');
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 68, W, 2, 'F');
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(248, 250, 252);
      doc.text('SchemaSense', MARGIN, 30);
      doc.setTextColor(129, 140, 248);
      doc.text(' AI', MARGIN + 76, 30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Data Intelligence Report — Analyst Edition', MARGIN, 40);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 18, 32);
      doc.text('Database Analysis\nReport', MARGIN, 100);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(99, 102, 241);
      doc.text(`${schemaData?.tables?.length ?? 0} Tables · ${
        schemaData?.tables?.reduce((s,t) => s + (t.columns?.length ?? 0), 0) ?? 0
      } Columns`, MARGIN, 122);
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 140);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, MARGIN, 132);

      const kpis = [
        { label: 'Tables', value: schemaData?.tables?.length ?? 0, color: [99,102,241] },
        {
          label: 'Avg Health',
          value: qualityScores.length
            ? `${Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)}%`
            : 'N/A',
          color: [16,185,129]
        },
        {
          label: 'Critical',
          value: normalizedQualityData
            .map((item) => toDisplayHealthScore(item.health_score ?? item.score))
            .filter((score) => score !== null && score < 70).length,
          color: [239,68,68]
        },
        { label: 'Model', value: 'qwen3.5:4b', color: [99,102,241] },
      ];

      kpis.forEach((kpi, i) => {
        const bx = MARGIN + i * 44;
        doc.setFillColor(248, 248, 255);
        doc.setDrawColor(...kpi.color);
        doc.roundedRect(bx, 145, 40, 22, 2, 2, 'FD');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...kpi.color);
        doc.text(String(kpi.value), bx + 20, 155, { align: 'center' });
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 120);
        doc.text(kpi.label, bx + 20, 162, { align: 'center' });
      });

      if (userContext?.trim()) {
        y = 180;
        doc.setFillColor(245, 245, 255);
        doc.setDrawColor(200, 200, 230);
        doc.roundedRect(MARGIN, y, LINE, 30, 3, 3, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(99, 102, 241);
        doc.text('Analyst Context (provided on upload):', MARGIN + 4, y + 8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 55, 70);
        const ctxLines = doc.splitTextToSize(userContext, LINE - 8);
        ctxLines.slice(0, 3).forEach((line, li) => {
          doc.text(line, MARGIN + 4, y + 14 + li * 5);
        });
      }

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 140);
      doc.text('Powered by qwen3.5:4b via Ollama — 100% local, zero data sent to cloud', MARGIN, 287);

      // EXECUTIVE SUMMARY
      addPage();
      sectionHeading('Executive Summary', [99, 102, 241]);
      const executiveSummaryText = safeText(aiNarrative?.executive_summary, '').trim() || localNarrative.executive_summary;
      if (executiveSummaryText) {
        bodyText(executiveSummaryText);
      } else {
        bodyText(
          `This report provides a comprehensive analysis of the loaded dataset. ` +
          `Tables require review based on data quality insights detailed below.`
        );
      }

      checkY(10);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 40);
      doc.text('Key Findings', MARGIN, y);
      y += 8;

      const findings = Array.from(new Set([
        ...toBulletList(aiNarrative?.key_findings, []),
        ...toBulletList(localNarrative?.key_findings, [
          'Schema structure detected with relationships',
          'Data completeness varies across tables',
        ]),
      ])).slice(0, 8);
      findings.forEach(f => bulletPoint(f));

      // NEW: Statistical Insights
      const statisticalInsightsText = safeText(aiNarrative?.statistical_insights, '').trim() || safeText(localNarrative?.statistical_insights, '').trim();
      if (statisticalInsightsText) {
        checkY(20);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 40);
        doc.text('Statistical Insights', MARGIN, y);
        y += 8;
        doc.setFont('helvetica', 'normal');
        bodyText(statisticalInsightsText);
      }

      // NEW: Recommendations
      const recommendations = Array.from(new Set([
        ...toBulletList(aiNarrative?.recommendations, []),
        ...toBulletList(localNarrative?.recommendations, []),
      ])).slice(0, 8);
      if (recommendations.length > 0) {
        checkY(20);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 40);
        doc.text('Recommendations', MARGIN, y);
        y += 8;
        doc.setFont('helvetica', 'normal');
        recommendations.forEach(r => bulletPoint(r));
      }

      // NEW: ER Diagram (Pre-formatted text from backend)
      const erText = safeText(aiNarrative?.er_diagram_text, '').trim();
      const relationshipText = Array.isArray(aiNarrative?.relationship_lines)
        ? aiNarrative.relationship_lines.join('\n')
        : safeText(aiNarrative?.relationship_lines, '').trim();
      const erData = erText || relationshipText;
      if (erData) {
        addPage();
        sectionHeading('Entity-Relationship Overview', [99, 102, 241]);
        
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 60);
        
        const erLines = doc.splitTextToSize(erData, LINE);
        erLines.forEach((line) => {
          checkY(5);
          doc.text(line, MARGIN, y);
          y += 4.5;
        });
        
        // reset font for remaining sections
        doc.setFont('helvetica', 'normal');
      }
      // DATA QUALITY
      addPage();
      sectionHeading('Data Quality Analysis', [16, 185, 129]);
      setStep('Adding quality analysis...');

      normalizedQualityData.forEach((table, ti) => {
        checkY(45);
        const score = toDisplayHealthScore(table.health_score ?? table.score);
        const scoreColor = score === null
          ? [148, 163, 184]
          : score >= 85
            ? [16,185,129]
            : score >= 70
              ? [245,158,11]
              : [239,68,68];
        const scoreText = score === null ? 'N/A' : `${score}%`;
        doc.setFillColor(248, 248, 255);
        doc.roundedRect(MARGIN, y, LINE, 14, 2, 2, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 40);
        doc.text(table.table ?? `Table ${ti+1}`, MARGIN + 4, y + 9);
        doc.setFillColor(...scoreColor);
        doc.roundedRect(W - MARGIN - 24, y + 2, 22, 10, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(scoreText, W - MARGIN - 13, y + 9, { align: 'center' });
        y += 18;

        const metrics = [
          { label: 'Completeness', rawValue: table.completeness, color: [99,102,241] },
          { label: 'Freshness', rawValue: table.freshness, color: [6,182,212] },
          { label: 'Consistency', rawValue: table.consistency, color: [16,185,129] },
        ];

        metrics.forEach(m => {
          checkY(10);
          const metricFraction = toMetricFraction(m.rawValue);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(80, 80, 100);
          doc.text(m.label, MARGIN, y);
          doc.text(toPercentText(m.rawValue), W - MARGIN, y, { align: 'right' });
          const maxWidth = LINE - 34 > 0 ? LINE - 34 : 0;
          doc.setFillColor(230, 230, 240);
          doc.roundedRect(MARGIN + 28, y - 3.5, maxWidth, 4, 1, 1, 'F');
          const valueWidth = metricFraction === null ? 0 : maxWidth * metricFraction;
          if (valueWidth > 0) {
              doc.setFillColor(...m.color);
              doc.roundedRect(MARGIN + 28, y - 3.5, valueWidth, 4, 1, 1, 'F');
          }
          y += 8;
        });

        if (table.columns?.length) {
          checkY(10);
          const tableRendered = renderAutoTable({
            startY: y,
            margin: { left: MARGIN, right: MARGIN },
            head: [['Column', 'Type', 'Null %', 'Unique %']],
            body: table.columns.map(col => [
              col.name ?? '', col.type ?? '',
              toPercentCell(col.null_percent ?? col.null_percentage),
              toPercentCell(col.uniqueness_percent ?? col.uniqueness)
            ]),
            headStyles: { fillColor: [15, 18, 32], textColor: [200, 200, 220], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8, textColor: [55, 55, 70] },
            alternateRowStyles: { fillColor: [250, 250, 255] }
          }, 10);

          if (!tableRendered) {
            bodyText('Detailed column table could not be rendered in this environment.', 2);
          }
        }

        y += 6;
        if (ti < normalizedQualityData.length - 1) {
          doc.setDrawColor(230, 230, 240);
          doc.line(MARGIN, y, W - MARGIN, y);
          y += 8;
        }
      });

      // MATHEMATICAL ANALYSIS
      setStep('Adding mathematical analysis reports...');
      if (schemaData?.tables?.length) {
        const analysisFailures = [];
        addPage();
        sectionHeading('Mathematical & Statistical Analysis', [236, 72, 153]);
        const tableTargets = schemaData.tables
          .map((table, index) => ({
            index,
            tableName: (table?.name || table?.table || '').trim(),
          }))
          .filter((target) => target.tableName);

        const fetchResults = [];
        const maxConcurrency = Math.min(1, tableTargets.length);
        let nextTargetIndex = 0;
        let completedTargets = 0;

        async function runWorker() {
          while (nextTargetIndex < tableTargets.length) {
            const target = tableTargets[nextTargetIndex];
            nextTargetIndex += 1;

            setStep(`Fetching stats (${completedTargets + 1}/${tableTargets.length}): ${target.tableName}...`);

            try {
              const res = await requestWithRetry(
                () => getTableAnalysis(target.tableName, { params: { include_llm: false } }),
                { retries: 1, baseDelayMs: 500 }
              );

              fetchResults.push({
                status: 'fulfilled',
                index: target.index,
                tableName: target.tableName,
                analysis: normalizeAnalysisPayload(res?.data),
              });
            } catch (error) {
              const failure = classifyAnalysisError(error);

              analysisFailures.push({
                tableName: target.tableName,
                failure,
              });

              fetchResults.push({
                status: 'rejected',
                index: target.index,
                tableName: target.tableName,
                failure,
              });

              console.error(
                `Failed to fetch analysis for table ${target.tableName}:`,
                error?.response?.data || error
              );
            } finally {
              completedTargets += 1;
              setStep(`Fetched ${completedTargets}/${tableTargets.length} analysis reports...`);
            }
          }
        }

        if (maxConcurrency > 0) {
          await Promise.all(Array.from({ length: maxConcurrency }, () => runWorker()));
        }

        fetchResults
          .sort((left, right) => left.index - right.index)
          .forEach((result) => {
            if (result.status !== 'fulfilled') return;

            const tName = result.tableName;
            const analysis = result.analysis;

            try {

            checkY(25);
            doc.setFillColor(245, 245, 255);
            doc.roundedRect(MARGIN, y, LINE, 10, 2, 2, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 30, 40);
            doc.text(`Table: ${tName}`, MARGIN + 4, y + 7);
            y += 14;

            const numericStats = analysis.numericStats;
            const catStats = analysis.categoricalStats;
            const dateStats = analysis.dateStats;
            const corPairs = analysis.correlationPairs;

            const hasStructuredStats =
              numericStats.length > 0 ||
              catStats.length > 0 ||
              dateStats.length > 0 ||
              corPairs.length > 0;

            // Numeric Stats
            if (numericStats.length > 0) {
              checkY(20);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('Distribution & Outliers', MARGIN, y);
              y += 6;

              const body = numericStats.map((s, idx) => {
                const directIqr = toFiniteNumber(s.iqr);
                const q1 = toFiniteNumber(s.q1 ?? s.Q1 ?? s.percentile_25);
                const q3 = toFiniteNumber(s.q3 ?? s.Q3 ?? s.percentile_75);
                const computedIqr = directIqr ?? (q1 !== null && q3 !== null ? q3 - q1 : null);
                const out = toFiniteNumber(s.iqr_outlier_count ?? s.outlier_count);
                return [
                  s.column || `numeric_${idx + 1}`,
                  toFixedOrDash(s.mean),
                  toFixedOrDash(s.std),
                  toFixedOrDash(s.min),
                  toFixedOrDash(s.max),
                  computedIqr === null ? '-' : computedIqr.toFixed(2),
                  out === null ? '-' : String(Math.round(out))
                ];
              });

              const tableRendered = renderAutoTable({
                startY: y,
                margin: { left: MARGIN, right: MARGIN },
                head: [['Column', 'Mean', 'Std', 'Min', 'Max', 'IQR', 'Outliers']],
                body,
                headStyles: { fillColor: [236, 72, 153], fontSize: 8 },
                bodyStyles: { fontSize: 7, overflow: 'linebreak', cellPadding: 1.4 },
                columnStyles: {
                  1: { halign: 'right' },
                  2: { halign: 'right' },
                  3: { halign: 'right' },
                  4: { halign: 'right' },
                  5: { halign: 'right' },
                  6: { halign: 'right' },
                },
              }, 8);

              if (!tableRendered) {
                bodyText('Distribution table rendering unavailable; values skipped for this export run.', 2);
              }
            }

            // Categorical Entropy
            if (catStats.length > 0) {
              checkY(15);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('Categorical Entropy', MARGIN, y);
              y += 6;

              const bodyCat = catStats.map((s, idx) => [
                s.column || `categorical_${idx + 1}`,
                String(s.cardinality ?? '-'),
                toFixedOrDash(s.entropy),
              ]);

              const tableRendered = renderAutoTable({
                startY: y,
                margin: { left: MARGIN, right: MARGIN },
                head: [['Column', 'Cardinality', 'Entropy']],
                body: bodyCat,
                headStyles: { fillColor: [236, 72, 153], fontSize: 8 },
                bodyStyles: { fontSize: 7, overflow: 'linebreak', cellPadding: 1.4 },
                columnStyles: {
                  1: { halign: 'right' },
                  2: { halign: 'right' },
                },
              }, 8);

              if (!tableRendered) {
                bodyText('Categorical summary table rendering unavailable; values skipped for this export run.', 2);
              }
            }

            // Temporal Patterns
            if (dateStats.length > 0) {
              checkY(15);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('Temporal Patterns', MARGIN, y);
              y += 6;

              const bodyDate = dateStats.map((s, idx) => {
                const rangeDays = toFiniteNumber(s.date_range_days);
                return [
                  s.column || `date_${idx + 1}`,
                  safeText(s.min_date, '-'),
                  safeText(s.max_date, '-'),
                  rangeDays === null ? '-' : String(Math.round(rangeDays)),
                  safeText(s.most_active_period, '-'),
                ];
              });

              const tableRendered = renderAutoTable({
                startY: y,
                margin: { left: MARGIN, right: MARGIN },
                head: [['Column', 'Min Date', 'Max Date', 'Range (Days)', 'Peak Activity']],
                body: bodyDate,
                headStyles: { fillColor: [236, 72, 153], fontSize: 8 },
                bodyStyles: { fontSize: 7, overflow: 'linebreak', cellPadding: 1.4 },
                columnStyles: {
                  3: { halign: 'right' },
                },
              }, 8);

              if (!tableRendered) {
                bodyText('Temporal summary table rendering unavailable; values skipped for this export run.', 2);
              }
            }

            // Correlation Insights
            if (corPairs.length > 0) {
              checkY(15);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('Key Correlations', MARGIN, y);
              y += 6;

              const bodyCor = corPairs.slice(0, 10).map((pair) => [
                pair.col_a || 'unknown_a',
                pair.col_b || 'unknown_b',
                toFixedOrDash(pair.r, 3),
              ]);

              const tableRendered = renderAutoTable({
                startY: y,
                margin: { left: MARGIN, right: MARGIN },
                head: [['Feature A', 'Feature B', 'Pearson (r)']],
                body: bodyCor,
                headStyles: { fillColor: [236, 72, 153], fontSize: 8 },
                bodyStyles: { fontSize: 7, overflow: 'linebreak', cellPadding: 1.4 },
                columnStyles: {
                  2: { halign: 'right' },
                },
              }, 8);

              if (!tableRendered) {
                bodyText('Correlation table rendering unavailable; values skipped for this export run.', 2);
              }
            }

            const ctoNarrative = analysis.ctoNarrative;
            if (ctoNarrative) {
              checkY(15);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('CTO Narrative', MARGIN, y);
              y += 6;
              bodyText(ctoNarrative);
            }

            const readinessNarrative = analysis.modelingReadiness;
            if (readinessNarrative && readinessNarrative !== ctoNarrative) {
              checkY(15);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(50, 50, 60);
              doc.text('Modeling Readiness', MARGIN, y);
              y += 6;
              bodyText(readinessNarrative);
            }

            if (!hasStructuredStats && !ctoNarrative && !readinessNarrative) {
              checkY(12);
              doc.setFontSize(8.5);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(100, 100, 120);
              doc.text('No detailed statistical blocks were returned by the backend for this table.', MARGIN, y);
              y += 8;
            }
            } catch (renderError) {
              const failure = classifyAnalysisError(renderError);
              analysisFailures.push({
                tableName: tName,
                failure: {
                  ...failure,
                  userLabel: failure.userLabel === 'unknown' ? 'rendering' : failure.userLabel,
                },
              });
              console.error(`Failed to render analysis block for table ${tName}:`, renderError);
            }
          });

        if (analysisFailures.length > 0) {
          checkY(16);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(185, 28, 28);
          doc.text('Analysis Fetch Warnings', MARGIN, y);
          y += 6;
          analysisFailures.forEach(({ tableName, failure }) => {
            bulletPoint(
              `Could not load detailed analysis for table: ${tableName} (${failure.userLabel})`,
              [239, 68, 68]
            );
          });
          console.warn('PDF export completed with analysis fetch warnings for tables:', analysisFailures);
        }
      }

      // FINISH
      setStep('Saving PDF...');
      const filename = `schemasense-report-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      setDone(true);
    } catch (error) {
      console.error('PDF generation failed:', error);
      setStep('Error: ' + error.message);
      setErrorMessage(error?.message || 'Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <div className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden" 
                 style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center">
                    <FileText size={18} className="text-[var(--accent-bright)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">Export AI Analysis Report</p>
                    <p className="text-xs text-[var(--text-muted)]">Analyst-grade PDF — schema, quality, statistics</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="p-6">
                {!generating && !done && (
                  <div className="space-y-2 mb-6">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Report includes</p>
                    {[
                      { icon: FileText, text: 'Executive summary with AI narrative' },
                      { icon: ShieldCheck, text: 'Per-table quality scores with metric bars' },
                      { icon: BarChart2, text: 'Full statistical analysis & ER architecture' }
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-3">
                        <Icon size={14} className="text-[var(--accent-bright)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-secondary)]">{text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {generating && (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mx-auto mb-4">
                      <Loader2 size={22} className="text-[var(--accent-bright)] animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Building your report...</p>
                    <p className="text-xs text-[var(--text-muted)]">{step}</p>
                  </div>
                )}
                {done && (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={22} className="text-[var(--success)]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Report downloaded</p>
                    <p className="text-xs text-[var(--text-muted)]">Check your downloads folder</p>
                  </div>
                )}
                {!generating && !done && errorMessage && (
                  <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    Export failed: {errorMessage}
                  </div>
                )}
                {!generating && (
                  <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border-default)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                      {done ? 'Close' : 'Cancel'}
                    </button>
                    {!done && (
                      <button onClick={generatePDF} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                        <Download size={15} /> Generate & Download
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
