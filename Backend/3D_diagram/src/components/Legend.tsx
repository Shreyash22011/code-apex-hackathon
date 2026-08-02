import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';

const GROUP_COLORS: Record<string, string> = {
  customer: '#00e5cc',
  order: '#7c5cfc',
  product: '#ff6b9d',
  seller: '#fbbf24',
  review: '#38bdf8',
  geo: '#a78bfa',
  analytics: '#f472b6',
  finance: '#34d399',
  inventory: '#fb923c',
  shipping: '#818cf8',
};

const FALLBACK_COLORS = ['#00e5cc', '#7c5cfc', '#ff6b9d', '#fbbf24', '#38bdf8', '#a78bfa'];

const qualityLegend = [
  { color: '#22c55e', label: '≥ 85% Good' },
  { color: '#f59e0b', label: '60-84% Warning' },
  { color: '#ef4444', label: '< 60% Critical' },
];

export default function Legend() {
  const { visualMode, tables } = useAppStore();

  if (visualMode === 'ai-query') {
    return (
      <motion.div key="ai" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="absolute bottom-24 left-6 z-20 glass-panel p-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">AI Query Trace</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-quality-warn pulse-glow" />
          <span className="text-xs text-secondary-foreground">Queried by AI</span>
        </div>
      </motion.div>
    );
  }

  if (visualMode === 'quality') {
    return (
      <motion.div key="quality" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="absolute bottom-24 left-6 z-20 glass-panel p-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Data Quality</p>
        <div className="space-y-1.5">
          {qualityLegend.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-secondary-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Build dynamic legend from current tables
  const groups = [...new Set(tables.map(t => t.group))];
  const schemaLegend = groups.map((g, i) => ({
    color: GROUP_COLORS[g] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    label: g.charAt(0).toUpperCase() + g.slice(1),
  }));

  return (
    <motion.div key="schema" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="absolute bottom-24 left-6 z-20 glass-panel p-3">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Table Groups</p>
      <div className="space-y-1.5">
        {schemaLegend.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-secondary-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
