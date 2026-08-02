import Papa from 'papaparse';
import type { TableNode, ForeignKeyLink } from '@/store/useAppStore';

export interface ParsedFile {
  fileName: string;
  tableName: string;
  columns: string[];
  rowCount: number;
  data: Record<string, unknown>[];
}

const GROUP_PALETTE = [
  'customer', 'order', 'product', 'seller', 'review', 'geo',
  'analytics', 'finance', 'inventory', 'shipping',
];

export function parseCSVFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const columns = results.meta.fields ?? [];
        const tableName = file.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
        resolve({
          fileName: file.name,
          tableName,
          columns,
          rowCount: results.data.length,
          data: results.data as Record<string, unknown>[],
        });
      },
      error(err) {
        reject(err);
      },
    });
  });
}

export function inferForeignKeys(tables: ParsedFile[]): ForeignKeyLink[] {
  const links: ForeignKeyLink[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tables.length; i++) {
    for (let j = 0; j < tables.length; j++) {
      if (i === j) continue;
      const tA = tables[i];
      const tB = tables[j];

      for (const colA of tA.columns) {
        for (const colB of tB.columns) {
          if (colA === colB && (colA.endsWith('_id') || colA.endsWith('_key') || colA.endsWith('_code') || colA.includes('id'))) {
            const key = [tA.tableName, tB.tableName, colA].sort().join('|');
            if (!seen.has(key)) {
              seen.add(key);
              links.push({
                source: tA.tableName,
                target: tB.tableName,
                sourceCol: colA,
                targetCol: colB,
              });
            }
          }
        }
      }
    }
  }

  return links;
}

export function computeQualityScore(data: Record<string, unknown>[], columns: string[]): number {
  if (data.length === 0 || columns.length === 0) return 100;
  let totalCells = 0;
  let filledCells = 0;
  const sampleSize = Math.min(data.length, 500);

  for (let i = 0; i < sampleSize; i++) {
    const row = data[i];
    for (const col of columns) {
      totalCells++;
      const val = row[col];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        filledCells++;
      }
    }
  }

  return totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 100;
}

export function buildTableNodes(parsedFiles: ParsedFile[]): TableNode[] {
  return parsedFiles.map((pf, idx) => ({
    id: pf.tableName,
    name: pf.tableName,
    rows: pf.rowCount,
    columns: pf.columns,
    qualityScore: computeQualityScore(pf.data, pf.columns),
    isQueried: false,
    group: GROUP_PALETTE[idx % GROUP_PALETTE.length],
  }));
}
