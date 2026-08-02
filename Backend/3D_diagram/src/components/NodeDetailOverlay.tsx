import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Columns, BarChart3, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const QualityBadge = ({ score }: { score: number }) => {
  const Icon = score >= 85 ? CheckCircle : score >= 60 ? AlertTriangle : XCircle;
  const colorClass = score >= 85 ? 'text-quality-good' : score >= 60 ? 'text-quality-warn' : 'text-quality-bad';
  const bgClass = score >= 85 ? 'bg-quality-good/10' : score >= 60 ? 'bg-quality-warn/10' : 'bg-quality-bad/10';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${colorClass} ${bgClass}`}>
      <Icon className="w-3.5 h-3.5" />
      {score}%
    </span>
  );
};

export default function NodeDetailOverlay() {
  const { selectedNode, setSelectedNode } = useAppStore();

  return (
    <AnimatePresence>
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute top-4 right-4 w-80 glass-panel glow-border p-5 z-20"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-1">Table Detail</p>
              <h3 className="text-lg font-bold text-foreground">{selectedNode.name.replace('olist_', '').replace(/_/g, ' ')}</h3>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="w-4 h-4" /> Rows
              </span>
              <span className="text-sm font-semibold font-mono text-foreground">{selectedNode.rows.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Columns className="w-4 h-4" /> Columns
              </span>
              <span className="text-sm font-semibold font-mono text-foreground">{selectedNode.columns.length}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <BarChart3 className="w-4 h-4" /> Quality
              </span>
              <QualityBadge score={selectedNode.qualityScore} />
            </div>
          </div>

          {/* Quality bar */}
          <div className="mb-4">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${selectedNode.qualityScore}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{
                  background: selectedNode.qualityScore >= 85
                    ? 'hsl(var(--quality-good))'
                    : selectedNode.qualityScore >= 60
                    ? 'hsl(var(--quality-warn))'
                    : 'hsl(var(--quality-bad))',
                }}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Columns</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedNode.columns.map((col) => (
                <div key={col} className="flex items-center gap-2 py-1.5 px-2 rounded text-xs font-mono text-secondary-foreground hover:bg-secondary/50 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  {col}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
