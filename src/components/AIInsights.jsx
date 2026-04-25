import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, AlertCircle, Info, Activity } from 'lucide-react';
import { buildDatasetDigest } from '../lib/datasetDigest';
import { buildLocalInsights, isMissingAiRouteError } from '../lib/localAiFallback';

const hasAiDevRoutes = import.meta.env.DEV;

const isNumeric = (value) => typeof value === 'number' && Number.isFinite(value);

const getPercentile = (sortedValues, percentile) => {
  if (sortedValues.length === 0) return 0;

  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
};

const toCorrelation = (pointsA, pointsB) => {
  const pairCount = Math.min(pointsA.length, pointsB.length);
  if (pairCount < 3) return null;

  const valuesA = pointsA.slice(0, pairCount);
  const valuesB = pointsB.slice(0, pairCount);
  const meanA = valuesA.reduce((sum, value) => sum + value, 0) / pairCount;
  const meanB = valuesB.reduce((sum, value) => sum + value, 0) / pairCount;

  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let i = 0; i < pairCount; i += 1) {
    const deltaA = valuesA[i] - meanA;
    const deltaB = valuesB[i] - meanB;
    numerator += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }

  const denominator = Math.sqrt(varianceA * varianceB);
  if (denominator === 0) return null;

  return numerator / denominator;
};

const AIInsights = ({ data, fields, fileName }) => {
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  const toFriendlyError = (message) => {
    const raw = String(message || '');

    if (raw.includes('GROQ_API_KEY is not configured')) {
      return 'API key missing. Add GROQ_API_KEY to .env.local and restart `npm run dev`.';
    }
    if (raw.includes('404')) {
      return 'AI API route not found. Run the app with `npm run dev`.';
    }
    if (raw.includes('401') || raw.toLowerCase().includes('incorrect api key')) {
      return 'Invalid Groq API key. Update GROQ_API_KEY in .env.local and restart the dev server.';
    }
    if (raw.includes('403')) {
      return 'The AI provider rejected this request with 403 Forbidden. Check the API key, provider permissions, and billing or credits.';
    }
    if (raw.includes('429') || raw.toLowerCase().includes('rate limit') || raw.toLowerCase().includes('quota')) {
      return 'AI provider rate limit reached. Check your account usage and try again.';
    }
    if (raw.toLowerCase().includes('failed to fetch')) {
      return 'Cannot reach AI backend. Ensure `npm run dev` is running and internet is available.';
    }

    return raw || 'Could not generate AI insights.';
  };

  const analysis = useMemo(() => {
    const rowCount = data.length;
    const allFields = fields?.length ? fields : Object.keys(data[0] ?? {});
    const columnCount = allFields.length;

    let missingValues = 0;
    data.forEach((row) => {
      allFields.forEach((field) => {
        const value = row[field];
        if (value === '' || value === null || value === undefined) {
          missingValues += 1;
        }
      });
    });

    const numericFields = allFields.filter((field) => data.some((row) => isNumeric(row[field])));

    const columnStats = numericFields
      .map((field) => {
        const values = data.map((row) => row[field]).filter(isNumeric);

        if (values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const first = values[0];
        const last = values[values.length - 1];
        const delta = last - first;
        const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : null;

        const q1 = getPercentile(sorted, 0.25);
        const q3 = getPercentile(sorted, 0.75);
        const iqr = q3 - q1;
        const lowFence = q1 - 1.5 * iqr;
        const highFence = q3 + 1.5 * iqr;
        const outlierCount = values.filter((value) => value < lowFence || value > highFence).length;

        return {
          field,
          min,
          max,
          mean,
          stdDev,
          delta,
          deltaPct,
          outlierCount,
          values,
        };
      })
      .filter(Boolean);

    const topGrowth = [...columnStats].sort((a, b) => b.delta - a.delta)[0] ?? null;
    const mostVolatile = [...columnStats].sort((a, b) => b.stdDev - a.stdDev)[0] ?? null;
    const totalOutliers = columnStats.reduce((sum, stat) => sum + stat.outlierCount, 0);

    const correlations = [];
    for (let i = 0; i < columnStats.length; i += 1) {
      for (let j = i + 1; j < columnStats.length; j += 1) {
        const firstStat = columnStats[i];
        const secondStat = columnStats[j];
        const coefficient = toCorrelation(firstStat.values, secondStat.values);

        if (coefficient !== null) {
          correlations.push({
            pair: `${firstStat.field} vs ${secondStat.field}`,
            value: coefficient,
          });
        }
      }
    }

    correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    return {
      rowCount,
      columnCount,
      missingValues,
      numericFieldCount: columnStats.length,
      totalOutliers,
      topGrowth,
      mostVolatile,
      correlations: correlations.slice(0, 3),
      columnStats,
    };
  }, [data, fields]);

  const datasetDigest = useMemo(() => buildDatasetDigest(data, fields), [data, fields]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setAiLoading(true);
      setAiError('');
      setAiSummary('');
      setUsingFallback(false);

      if (!hasAiDevRoutes) {
        if (!cancelled) {
          setAiSummary(buildLocalInsights(datasetDigest, fileName));
          setUsingFallback(true);
          setAiLoading(false);
        }
        return;
      }

      try {
        const response = await fetch('/api/ai/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName,
            dataset: datasetDigest,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error ? `${payload.error} (HTTP ${response.status})` : `AI insights failed (HTTP ${response.status})`);
        }

        if (!cancelled) {
          setAiSummary(payload.text || '');
          setUsingFallback(Boolean(payload.fallback));
        }
      } catch (error) {
        if (!cancelled) {
          if (isMissingAiRouteError(error.message)) {
            setAiSummary(buildLocalInsights(datasetDigest, fileName));
            setUsingFallback(true);
          } else {
            setAiError(toFriendlyError(error.message));
          }
        }
      } finally {
        if (!cancelled) {
          setAiLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [datasetDigest, fileName]);

  if (!analysis.numericFieldCount) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <Sparkles color="var(--accent)" />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>AI Insights</h3>
        </div>
        <p style={{ color: 'var(--text-muted)' }}>
          Upload data with numeric columns to unlock trend, anomaly, and correlation insights.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Sparkles color="var(--accent)" />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>AI Insights</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Rows</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{analysis.rowCount}</div>
        </div>
        <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Columns</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{analysis.columnCount}</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Numeric Fields</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{analysis.numericFieldCount}</div>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Missing Values</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{analysis.missingValues}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {analysis.topGrowth && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.8rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)', display: 'flex', gap: '10px' }}>
            <TrendingUp color="var(--primary)" size={20} style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: '2px', fontSize: '0.95rem' }}>Strongest Growth</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {analysis.topGrowth.field} changed by {analysis.topGrowth.delta.toFixed(2)}
                {analysis.topGrowth.deltaPct !== null ? ` (${analysis.topGrowth.deltaPct.toFixed(1)}%)` : ''} from first to last record.
              </p>
            </div>
          </div>
        )}

        {analysis.mostVolatile && (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.8rem', borderRadius: '8px', borderLeft: '4px solid var(--success)', display: 'flex', gap: '10px' }}>
            <Activity color="var(--success)" size={20} style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: '2px', fontSize: '0.95rem' }}>Highest Volatility</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {analysis.mostVolatile.field} has the highest variance (std dev {analysis.mostVolatile.stdDev.toFixed(2)}).
              </p>
            </div>
          </div>
        )}

        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.8rem', borderRadius: '8px', borderLeft: '4px solid var(--danger)', display: 'flex', gap: '10px' }}>
          <AlertCircle color="var(--danger)" size={20} style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ fontWeight: 600, marginBottom: '2px', fontSize: '0.95rem' }}>Anomaly Watch</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Detected {analysis.totalOutliers} possible outlier values across numeric fields using IQR bounds.
            </p>
          </div>
        </div>
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Info size={16} color="var(--text-muted)" />
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Column Summary</h4>
        </div>
        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {analysis.columnStats.map((stat) => (
            <div key={stat.field} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', fontSize: '0.82rem', padding: '6px 8px', background: 'rgba(30, 41, 59, 0.45)', borderRadius: '6px' }}>
              <span style={{ fontWeight: 600 }}>{stat.field}</span>
              <span style={{ color: 'var(--text-muted)' }}>Avg {stat.mean.toFixed(2)}</span>
              <span style={{ color: 'var(--text-muted)' }}>Min {stat.min.toFixed(2)}</span>
              <span style={{ color: 'var(--text-muted)' }}>Max {stat.max.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {analysis.correlations.length > 0 && (
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '10px' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>Top Correlations</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {analysis.correlations.map((item) => (
              <div key={item.pair} style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {item.pair}: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{item.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '10px' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>Model Narrative</h4>
        {aiLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Generating grounded insights from your data...</p>}
        {aiError && <p style={{ color: '#fca5a5', fontSize: '0.86rem' }}>{aiError}</p>}
        {!aiLoading && !aiError && aiSummary && (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.55, fontFamily: 'inherit' }}>
            {aiSummary}
          </pre>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
