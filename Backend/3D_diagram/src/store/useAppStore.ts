import { create } from 'zustand';
import { tables as defaultTables, foreignKeys as defaultFKs } from '@/data/olistSchema';
import type { ParsedFile } from '@/lib/csvParser';

export type VisualMode = 'default' | 'quality' | 'ai-query';
export type ViewMode = '3d' | 'analytics';

export interface TableNode {
  id: string;
  name: string;
  rows: number;
  columns: string[];
  qualityScore: number;
  isQueried: boolean;
  group: string;
}

export interface ForeignKeyLink {
  source: string;
  target: string;
  sourceCol: string;
  targetCol: string;
}

interface AppState {
  // Dataset state
  datasetLoaded: boolean;
  tables: TableNode[];
  foreignKeys: ForeignKeyLink[];
  parsedFiles: ParsedFile[];
  loadDataset: (tables: TableNode[], fks: ForeignKeyLink[], parsedFiles?: ParsedFile[]) => void;
  loadDefaultDataset: () => void;
  resetDataset: () => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Viz state
  visualMode: VisualMode;
  setVisualMode: (mode: VisualMode) => void;
  selectedNode: TableNode | null;
  setSelectedNode: (node: TableNode | null) => void;
  queriedTables: string[];
  simulateQuery: () => void;
  resetQuery: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  datasetLoaded: false,
  tables: [],
  foreignKeys: [],
  parsedFiles: [],

  loadDataset: (tables, fks, parsedFiles) =>
    set({ datasetLoaded: true, tables, foreignKeys: fks, parsedFiles: parsedFiles ?? [], selectedNode: null, queriedTables: [], visualMode: 'default', viewMode: '3d' }),

  loadDefaultDataset: () =>
    set({ datasetLoaded: true, tables: defaultTables, foreignKeys: defaultFKs, parsedFiles: [], selectedNode: null, queriedTables: [], visualMode: 'default', viewMode: '3d' }),

  resetDataset: () =>
    set({ datasetLoaded: false, tables: [], foreignKeys: [], parsedFiles: [], selectedNode: null, queriedTables: [], visualMode: 'default', viewMode: '3d' }),

  viewMode: '3d',
  setViewMode: (mode) => set({ viewMode: mode }),

  visualMode: 'default',
  setVisualMode: (mode) => set({ visualMode: mode }),
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),
  queriedTables: [],
  simulateQuery: () => {
    const allTables = get().tables;
    const toQuery = allTables.slice(0, Math.min(3, allTables.length)).map(t => t.id);
    let i = 0;
    const interval = setInterval(() => {
      if (i >= toQuery.length) {
        clearInterval(interval);
        return;
      }
      set((s) => ({ queriedTables: [...s.queriedTables, toQuery[i]] }));
      i++;
    }, 800);
  },
  resetQuery: () => set({ queriedTables: [] }),
}));
