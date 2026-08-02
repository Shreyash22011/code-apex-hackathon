import { motion } from 'framer-motion';
import { Eye, Activity, Zap, RotateCcw, BarChart3, Box } from 'lucide-react';
import { useAppStore, type VisualMode } from '@/store/useAppStore';

const modes: { id: VisualMode; label: string; icon: typeof Eye; desc: string }[] = [
  { id: 'default', label: 'Schema', icon: Eye, desc: 'Table relationships' },
  { id: 'quality', label: 'Quality', icon: Activity, desc: 'Data health scores' },
  { id: 'ai-query', label: 'AI Query', icon: Zap, desc: 'Simulate AI trace' },
];

export default function ControlPanel() {
  const { visualMode, setVisualMode, simulateQuery, resetQuery, viewMode, setViewMode } = useAppStore();

  const handleModeChange = (mode: VisualMode) => {
    if (viewMode !== '3d') setViewMode('3d');
    setVisualMode(mode);
    if (mode === 'ai-query') {
      resetQuery();
      setTimeout(simulateQuery, 300);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20"
    >
      <div className="glass-panel glow-border px-2 py-2 flex items-center gap-1">
        {/* View toggle */}
        <button
          onClick={() => setViewMode(viewMode === '3d' ? 'analytics' : '3d')}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            viewMode === 'analytics' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {viewMode === 'analytics' && (
            <motion.div
              layoutId="activeMode"
              className="absolute inset-0 bg-primary rounded-lg"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {viewMode === '3d' ? <BarChart3 className="w-4 h-4" /> : <Box className="w-4 h-4" />}
            {viewMode === '3d' ? 'Analytics' : '3D View'}
          </span>
        </button>

        <div className="w-px h-6 bg-border/50 mx-1" />

        {modes.map((m) => {
          const active = viewMode === '3d' && visualMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeMode"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <m.icon className="w-4 h-4" />
                {m.label}
              </span>
            </button>
          );
        })}

        {visualMode === 'ai-query' && viewMode === '3d' && (
          <button
            onClick={() => { resetQuery(); setTimeout(simulateQuery, 300); }}
            className="ml-1 p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Replay query"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
