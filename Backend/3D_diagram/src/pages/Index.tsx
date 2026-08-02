import { Suspense } from 'react';
import DBViz3D from '@/components/DBViz3D';
import Header from '@/components/Header';
import ControlPanel from '@/components/ControlPanel';
import NodeDetailOverlay from '@/components/NodeDetailOverlay';
import Legend from '@/components/Legend';
import UploadScreen from '@/components/UploadScreen';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { useAppStore } from '@/store/useAppStore';

const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 glow-border">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-sm text-muted-foreground font-mono">Initializing 3D engine...</p>
    </div>
  </div>
);

export default function Index() {
  const datasetLoaded = useAppStore((s) => s.datasetLoaded);
  const viewMode = useAppStore((s) => s.viewMode);

  if (!datasetLoaded) {
    return <UploadScreen />;
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 z-0" style={{
        background: 'radial-gradient(ellipse at 30% 20%, hsl(173 80% 50% / 0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(265 70% 60% / 0.04) 0%, transparent 50%)'
      }} />

      <Header />

      {viewMode === '3d' ? (
        <>
          <Suspense fallback={<LoadingFallback />}>
            <DBViz3D />
          </Suspense>
          <NodeDetailOverlay />
          <Legend />
        </>
      ) : (
        <AnalyticsDashboard />
      )}

      <ControlPanel />
    </div>
  );
}
