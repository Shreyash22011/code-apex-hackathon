import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, X, ArrowRight, AlertCircle } from 'lucide-react';
import { parseCSVFile, inferForeignKeys, buildTableNodes, type ParsedFile } from '@/lib/csvParser';
import { useAppStore } from '@/store/useAppStore';

export default function UploadScreen() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loadDataset, loadDefaultDataset } = useAppStore();

  const handleFiles = useCallback(async (fileList: FileList) => {
    const csvFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) {
      setError('Please upload .csv files only.');
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const parsed = await Promise.all(csvFiles.map(parseCSVFile));
      setFiles(prev => {
        const existing = new Set(prev.map(p => p.tableName));
        const newFiles = parsed.filter(p => !existing.has(p.tableName));
        return [...prev, ...newFiles];
      });
    } catch {
      setError('Failed to parse one or more CSV files.');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (tableName: string) => {
    setFiles(prev => prev.filter(f => f.tableName !== tableName));
  };

  const handleVisualize = () => {
    if (files.length === 0) return;
    const nodes = buildTableNodes(files);
    const links = inferForeignKeys(files);
    loadDataset(nodes, links, files);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute inset-0 z-0" style={{
        background: 'radial-gradient(ellipse at 30% 20%, hsl(173 80% 50% / 0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(265 70% 60% / 0.04) 0%, transparent 50%)'
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Schema<span className="text-primary">Sense</span>
            <span className="text-xs font-mono font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-2">3D</span>
          </h1>
          <p className="text-muted-foreground text-sm">Upload your CSV dataset to generate an interactive 3D schema visualization</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`glass-panel cursor-pointer transition-all duration-300 p-10 text-center ${
            dragging ? 'glow-border border-primary/60 scale-[1.01]' : 'border-border/50 hover:border-primary/30'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            {parsing ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-7 h-7 text-primary" />
            )}
          </div>
          <p className="text-foreground font-medium mb-1">
            {dragging ? 'Drop your CSVs here' : 'Drag & drop CSV files here'}
          </p>
          <p className="text-xs text-muted-foreground">or click to browse · multiple files supported</p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 text-destructive text-sm px-3 py-2 rounded-lg bg-destructive/10"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* File list */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 space-y-2"
            >
              {files.map((f) => (
                <motion.div
                  key={f.tableName}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="glass-panel px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.fileName}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {f.rowCount.toLocaleString()} rows · {f.columns.length} columns
                      </p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(f.tableName); }} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={handleVisualize}
                className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
              >
                Visualize in 3D
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Demo link */}
        <div className="text-center mt-6">
          <button
            onClick={loadDefaultDataset}
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
          >
            or try the demo with Olist e-commerce dataset →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
