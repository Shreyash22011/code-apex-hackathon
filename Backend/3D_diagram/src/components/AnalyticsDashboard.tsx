import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import { Database, Rows3, Columns3, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const CHART_COLORS = [
  'hsl(173, 80%, 50%)', 'hsl(265, 70%, 60%)', 'hsl(340, 80%, 65%)',
  'hsl(45, 90%, 55%)', 'hsl(200, 80%, 60%)', 'hsl(280, 60%, 65%)',
  'hsl(330, 70%, 60%)', 'hsl(160, 70%, 50%)', 'hsl(25, 85%, 55%)',
  'hsl(230, 70%, 65%)',
];

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' as const },
  }),
};

function StatCard({ icon: Icon, label, value, sub, index }: {
  icon: typeof Database; label: string; value: string | number; sub?: string; index: number;
}) {
  return (
    <motion.div custom={index} variants={cardVariants} initial="hidden" animate="visible"
      className="glass-panel p-4 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 font-mono">{sub}</p>}
      </div>
    </motion.div>
  );
}

function ChartCard({ title, children, index, className = '' }: {
  title: string; children: React.ReactNode; index: number; className?: string;
}) {
  return (
    <motion.div custom={index} variants={cardVariants} initial="hidden" animate="visible"
      className={`glass-panel p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        {title}
      </h3>
      {children}
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel px-3 py-2 text-xs border border-border/50">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-mono">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsDashboard() {
  const { tables, foreignKeys, parsedFiles } = useAppStore();

  const stats = useMemo(() => {
    const totalRows = tables.reduce((s, t) => s + t.rows, 0);
    const totalCols = tables.reduce((s, t) => s + t.columns.length, 0);
    const avgQuality = tables.length > 0
      ? Math.round(tables.reduce((s, t) => s + t.qualityScore, 0) / tables.length) : 0;
    const lowQuality = tables.filter(t => t.qualityScore < 60).length;
    return { totalRows, totalCols, avgQuality, lowQuality };
  }, [tables]);

  const rowDistribution = useMemo(() =>
    tables.map(t => ({
      name: t.name.replace(/^olist_/, '').replace(/_/g, ' '),
      rows: t.rows,
    })).sort((a, b) => b.rows - a.rows),
  [tables]);

  const qualityData = useMemo(() =>
    tables.map(t => ({
      name: t.name.replace(/^olist_/, '').replace(/_/g, ' '),
      score: t.qualityScore,
      fullMark: 100,
    })),
  [tables]);

  const columnDistribution = useMemo(() =>
    tables.map(t => ({
      name: t.name.replace(/^olist_/, '').replace(/_/g, ' '),
      columns: t.columns.length,
    })),
  [tables]);

  const completenessData = useMemo(() => {
    if (parsedFiles.length === 0) {
      return tables.map(t => ({
        name: t.name.replace(/^olist_/, '').replace(/_/g, ' '),
        filled: t.qualityScore,
        missing: 100 - t.qualityScore,
      }));
    }
    return parsedFiles.map(pf => {
      const sample = pf.data.slice(0, 500);
      const total = sample.length * pf.columns.length;
      let filled = 0;
      sample.forEach(row => {
        pf.columns.forEach(col => {
          const v = row[col];
          if (v !== null && v !== undefined && String(v).trim() !== '') filled++;
        });
      });
      const pct = total > 0 ? Math.round((filled / total) * 100) : 100;
      return {
        name: pf.tableName.replace(/^olist_/, '').replace(/_/g, ' '),
        filled: pct,
        missing: 100 - pct,
      };
    });
  }, [parsedFiles, tables]);

  const relationshipData = useMemo(() => {
    const counts: Record<string, number> = {};
    tables.forEach(t => { counts[t.id] = 0; });
    foreignKeys.forEach(fk => {
      counts[fk.source] = (counts[fk.source] || 0) + 1;
      counts[fk.target] = (counts[fk.target] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({
        name: id.replace(/^olist_/, '').replace(/_/g, ' '),
        relationships: count,
      }))
      .sort((a, b) => b.relationships - a.relationships);
  }, [tables, foreignKeys]);

  return (
    <div className="absolute inset-0 z-10 overflow-auto pt-16 pb-24 px-4 md:px-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Database} label="Total Tables" value={tables.length} index={0} />
          <StatCard icon={Rows3} label="Total Rows" value={stats.totalRows} index={1} />
          <StatCard icon={Columns3} label="Total Columns" value={stats.totalCols} index={2} />
          <StatCard icon={Activity} label="Avg Quality" value={`${stats.avgQuality}%`}
            sub={stats.lowQuality > 0 ? `${stats.lowQuality} table(s) below 60%` : 'All tables healthy'}
            index={3}
          />
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Row Distribution */}
          <ChartCard title="Row Distribution by Table" index={4}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rowDistribution} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <YAxis type="category" dataKey="name" width={90}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="rows" radius={[0, 6, 6, 0]}>
                    {rowDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Quality Radar */}
          <ChartCard title="Data Quality Radar" index={5}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={qualityData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border) / 0.3)" />
                  <PolarAngleAxis dataKey="name"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                  <Radar name="Quality" dataKey="score" stroke="hsl(173, 80%, 50%)"
                    fill="hsl(173, 80%, 50%)" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Column Count */}
          <ChartCard title="Columns per Table" index={6}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={columnDistribution} margin={{ left: 0, right: 16, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="columns" radius={[6, 6, 0, 0]}>
                    {columnDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Data Completeness */}
          <ChartCard title="Data Completeness %" index={7}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={completenessData} margin={{ left: 0, right: 16, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} height={60} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="filled" stackId="1"
                    stroke="hsl(173, 80%, 50%)" fill="hsl(173, 80%, 50%)" fillOpacity={0.3} name="Filled %" />
                  <Area type="monotone" dataKey="missing" stackId="1"
                    stroke="hsl(0, 80%, 55%)" fill="hsl(0, 80%, 55%)" fillOpacity={0.2} name="Missing %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Relationships + Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Relationships per Table" index={8}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={relationshipData} margin={{ left: 0, right: 16, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} height={60} />
                  <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="relationships" radius={[6, 6, 0, 0]} fill="hsl(265, 70%, 60%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Row Share by Table" index={9}>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rowDistribution} dataKey="rows" nameKey="name"
                    cx="50%" cy="50%" innerRadius="35%" outerRadius="70%"
                    strokeWidth={2} stroke="hsl(var(--background))">
                    {rowDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Low quality warnings */}
        {stats.lowQuality > 0 && (
          <motion.div custom={10} variants={cardVariants} initial="hidden" animate="visible"
            className="glass-panel p-4 border-destructive/30"
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Data Quality Alerts
            </h3>
            <div className="space-y-2">
              {tables.filter(t => t.qualityScore < 60).map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-destructive/5">
                  <span className="text-foreground font-medium font-mono">
                    {t.name.replace(/_/g, ' ')}
                  </span>
                  <span className="text-destructive font-bold">{t.qualityScore}% quality</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
