import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import {
  BarChart2,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  ScatterChart as ScatterChartIcon,
} from 'lucide-react';

const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#06b6d4'];

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const ChartsView = ({ data, fields }) => {
  const numericFields = useMemo(
    () => fields.filter((field) => data.some((row) => isNumber(row[field]))),
    [data, fields],
  );
  const categoricalFields = useMemo(
    () => fields.filter((field) => !numericFields.includes(field)),
    [fields, numericFields],
  );

  const [chartType, setChartType] = useState('bar');
  const [xAxisField, setXAxisField] = useState(categoricalFields[0] ?? fields[0]);
  const [metricField, setMetricField] = useState(numericFields[0] ?? fields[0]);
  const [scatterYField, setScatterYField] = useState(numericFields[1] ?? numericFields[0] ?? fields[0]);

  const xAxisOptions = categoricalFields.length > 0 ? categoricalFields : fields;

  const pieData = useMemo(() => {
    if (!metricField) return [];

    const grouped = new Map();
    data.forEach((row) => {
      const label = String(row[xAxisField] ?? 'Unknown');
      const value = Number(row[metricField]);
      if (!Number.isFinite(value)) return;
      grouped.set(label, (grouped.get(label) ?? 0) + value);
    });

    return [...grouped.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [data, metricField, xAxisField]);

  const metricStats = useMemo(() => {
    if (!metricField) return null;
    const values = data.map((row) => row[metricField]).filter(isNumber);
    if (!values.length) return null;

    const sum = values.reduce((total, value) => total + value, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      avg: sum / values.length,
      min,
      max,
    };
  }, [data, metricField]);

  const chartButtons = [
    { id: 'bar', label: 'Bar', icon: BarChart2 },
    { id: 'line', label: 'Line', icon: LineChartIcon },
    { id: 'area', label: 'Area', icon: AreaChartIcon },
    { id: 'pie', label: 'Pie', icon: PieChartIcon },
    { id: 'scatter', label: 'Scatter', icon: ScatterChartIcon },
  ];

  const renderChart = () => {
    if (!numericFields.length) {
      return (
        <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Add at least one numeric column to unlock charts.
        </div>
      );
    }

    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={125}
              label
            >
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)' }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'scatter' && numericFields.length > 1) {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis type="number" dataKey={metricField} name={metricField} stroke="var(--text-muted)" />
            <YAxis type="number" dataKey={scatterYField} name={scatterYField} stroke="var(--text-muted)" />
            <ZAxis range={[70, 250]} />
            <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} fill="var(--primary)" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xAxisField} stroke="var(--text-muted)" />
            <YAxis stroke="var(--text-muted)" />
            <RechartsTooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)' }}
            />
            <Legend />
            {numericFields.slice(0, 4).map((field, idx) => (
              <Line type="monotone" key={field} dataKey={field} stroke={colors[idx % colors.length]} strokeWidth={3} activeDot={{ r: 7 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'area') {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xAxisField} stroke="var(--text-muted)" />
            <YAxis stroke="var(--text-muted)" />
            <RechartsTooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)' }}
            />
            <Legend />
            {numericFields.slice(0, 3).map((field, idx) => (
              <Area type="monotone" key={field} dataKey={field} fill={colors[idx % colors.length]} stroke={colors[idx % colors.length]} fillOpacity={0.25} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis dataKey={xAxisField} stroke="var(--text-muted)" />
          <YAxis stroke="var(--text-muted)" />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)' }}
            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
          />
          <Legend />
          {numericFields.slice(0, 4).map((field, idx) => (
            <Bar key={field} dataKey={field} fill={colors[idx % colors.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '14px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Data Visualizations</h3>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', flexWrap: 'wrap' }}>
          {chartButtons.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setChartType(item.id)}
                title={item.label}
                style={{ background: chartType === item.id ? 'var(--bg-color)' : 'transparent', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', color: chartType === item.id ? 'var(--primary)' : 'var(--text-muted)' }}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          X Axis / Category
          <select value={xAxisField} onChange={(event) => setXAxisField(event.target.value)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', padding: '8px' }}>
            {xAxisOptions.map((field) => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Primary Metric
          <select value={metricField} onChange={(event) => setMetricField(event.target.value)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', padding: '8px' }}>
            {numericFields.map((field) => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </label>

        {chartType === 'scatter' && numericFields.length > 1 && (
          <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Scatter Y Metric
            <select value={scatterYField} onChange={(event) => setScatterYField(event.target.value)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', padding: '8px' }}>
              {numericFields.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '1rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Records</div>
          <div style={{ fontWeight: 700 }}>{data.length}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Avg ({metricField})</div>
          <div style={{ fontWeight: 700 }}>{metricStats ? metricStats.avg.toFixed(2) : '-'}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Min</div>
          <div style={{ fontWeight: 700 }}>{metricStats ? metricStats.min.toFixed(2) : '-'}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Max</div>
          <div style={{ fontWeight: 700 }}>{metricStats ? metricStats.max.toFixed(2) : '-'}</div>
        </div>
      </div>

      {renderChart()}
    </div>
  );
};

export default ChartsView;
