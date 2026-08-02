import { useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useAppStore } from '@/store/useAppStore';

const HEARTBEAT_SPEED = 4;
const HEARTBEAT_MIN = 1.0;
const HEARTBEAT_MAX = 1.25;

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

const FALLBACK_COLORS = ['#00e5cc', '#7c5cfc', '#ff6b9d', '#fbbf24', '#38bdf8', '#a78bfa', '#f472b6', '#34d399'];

const getQualityColor = (score: number) => {
  if (score >= 85) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
};

export default function DBViz3D() {
  const fgRef = useRef<any>();
  const { visualMode, setSelectedNode, queriedTables, tables, foreignKeys } = useAppStore();
  const selectedNode = useAppStore((s) => s.selectedNode);
  const selectedGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);

  // Heartbeat animation loop for selected node
  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      const g = selectedGroupRef.current;
      if (g) {
        const t = performance.now() / 1000;
        // Double-bump heartbeat: two peaks per cycle
        const beat = Math.abs(Math.sin(t * HEARTBEAT_SPEED));
        const scale = HEARTBEAT_MIN + (HEARTBEAT_MAX - HEARTBEAT_MIN) * beat;
        g.scale.set(scale, scale, scale);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [selectedNode]);

  const graphData = useMemo(() => {
    const nodes = tables.map((t, idx) => ({
      id: t.id,
      name: t.name,
      val: Math.max(Math.log10(Math.max(t.rows, 1)) * 3, 4),
      rows: t.rows,
      columns: t.columns,
      qualityScore: t.qualityScore,
      group: t.group,
      groupIndex: idx,
    }));
    const links = foreignKeys.map((fk) => ({
      source: fk.source,
      target: fk.target,
      sourceCol: fk.sourceCol,
      targetCol: fk.targetCol,
    }));
    return { nodes, links };
  }, [tables, foreignKeys]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-200);
      fgRef.current.d3Force('link')?.distance(100);
    }
  }, [graphData]);

  const getNodeColor = useCallback(
    (node: any) => {
      if (visualMode === 'quality') return getQualityColor(node.qualityScore);
      if (visualMode === 'ai-query' && queriedTables.includes(node.id)) return '#f59e0b';
      return GROUP_COLORS[node.group] || FALLBACK_COLORS[node.groupIndex % FALLBACK_COLORS.length];
    },
    [visualMode, queriedTables]
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const tableData = tables.find((t) => t.id === node.id);
      if (tableData) setSelectedNode(tableData);
      const distance = 120;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      fgRef.current?.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        1000
      );
    },
    [setSelectedNode, tables]
  );

  const nodeThreeObject = useCallback(
    (node: any) => {
      const isQueried = visualMode === 'ai-query' && queriedTables.includes(node.id);
      const isSelected = selectedNode?.id === node.id;
      const color = getNodeColor(node);
      const size = node.val * 1.5;
      const group = new THREE.Group();

      const geometry = new THREE.SphereGeometry(size, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        shininess: 100,
        emissive: new THREE.Color(color),
        emissiveIntensity: isQueried ? 0.8 : isSelected ? 0.5 : 0.2,
      });
      group.add(new THREE.Mesh(geometry, material));

      const ringGeo = new THREE.RingGeometry(size * 1.3, size * 1.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isQueried ? 0.6 : isSelected ? 0.4 : 0.15,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Outer glow ring for selected node
      if (isSelected) {
        const glowGeo = new THREE.RingGeometry(size * 1.6, size * 1.8, 48);
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        group.add(glow);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 64;
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, 256, 64);
      ctx.font = '600 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      const label = node.name.replace(/^olist_/, '').replace(/_/g, ' ');
      ctx.fillText(label.length > 20 ? label.slice(0, 18) + '…' : label, 128, 36);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.9 });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(size * 4, size * 1, 1);
      sprite.position.y = size + 6;
      group.add(sprite);

      // Track selected node's group for heartbeat animation
      if (isSelected) {
        selectedGroupRef.current = group;
      } else if (selectedGroupRef.current === group) {
        selectedGroupRef.current = null;
      }

      return group;
    },
    [getNodeColor, visualMode, queriedTables, selectedNode]
  );

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={graphData}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={() => 'rgba(100,180,255,0.2)'}
      linkWidth={1.5}
      linkDirectionalParticles={4}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={() => '#00e5cc'}
      backgroundColor="rgba(0,0,0,0)"
      onNodeClick={handleNodeClick}
      enableNodeDrag={true}
      warmupTicks={50}
      cooldownTicks={100}
    />
  );
}
