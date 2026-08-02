import { motion } from 'framer-motion';
import { Database, Sparkles, Upload } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export default function Header() {
  const { tables, foreignKeys, resetDataset } = useAppStore();

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-border">
          <Database className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
            SchemaSense
            <span className="text-xs font-mono font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">3D</span>
          </h1>
          <p className="text-xs text-muted-foreground">Interactive Database Visualization</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="glass-panel px-3 py-1.5 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono text-muted-foreground">
            {tables.length} tables · {foreignKeys.length} relations
          </span>
        </div>
        <button
          onClick={resetDataset}
          className="glass-panel px-3 py-1.5 flex items-center gap-2 hover:border-primary/30 transition-colors cursor-pointer"
          title="Upload new dataset"
        >
          <Upload className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">New Dataset</span>
        </button>
      </div>
    </motion.header>
  );
}
