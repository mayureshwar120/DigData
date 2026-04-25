const toPercent = (value) => `${(value * 100).toFixed(1)}%`;
const includesAny = (text, terms) => terms.some((term) => text.includes(term));

const describeMetric = (field, metric) => {
  if (metric === 'avg') {
    return `${field.field} has an average of ${field.avg}.`;
  }
  if (metric === 'min') {
    return `${field.field} has a minimum value of ${field.min}.`;
  }
  if (metric === 'max') {
    return `${field.field} has a maximum value of ${field.max}.`;
  }
  if (metric === 'count') {
    return `${field.field} has ${field.count} numeric values in the uploaded dataset.`;
  }

  const delta = Number(field.last) - Number(field.first);
  const deltaText = Number.isFinite(delta) ? `${delta.toFixed(2)}` : 'unknown';
  return `${field.field} has an average of ${field.avg}, a minimum of ${field.min}, a maximum of ${field.max}, and changed by ${deltaText} from the first to the last observed value in the digest.`;
};

export const buildLocalInsights = (dataset, fileName = 'dataset') => {
  const numericFields = Array.isArray(dataset?.numericSummary) ? dataset.numericSummary : [];
  const missingEntries = Object.entries(dataset?.missingByField ?? {});
  const rowCount = dataset?.rowCount ?? 0;

  const missingSummary = missingEntries
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1]);

  const topMissing = missingSummary[0];
  const topGrowth = [...numericFields]
    .map((field) => ({
      ...field,
      delta: Number(field.last) - Number(field.first),
    }))
    .sort((a, b) => b.delta - a.delta)[0];

  const widestRange = [...numericFields]
    .map((field) => ({
      ...field,
      range: Number(field.max) - Number(field.min),
    }))
    .sort((a, b) => b.range - a.range)[0];

  const findings = [];
  if (topGrowth && Number.isFinite(topGrowth.delta)) {
    findings.push(`${topGrowth.field} increased by ${topGrowth.delta.toFixed(2)} from first to last observed value.`);
  }
  if (widestRange && Number.isFinite(widestRange.range)) {
    findings.push(`${widestRange.field} has the widest spread, ranging from ${widestRange.min} to ${widestRange.max}.`);
  }
  if (topMissing) {
    findings.push(`${topMissing[0]} has the most missing values with ${topMissing[1]} missing entries.`);
  }
  if (!findings.length) {
    findings.push('The uploaded dataset is structurally valid, but it does not include enough numeric detail for deeper trend analysis.');
  }

  const risks = [];
  if (topMissing) {
    risks.push(`Missing data may bias analysis for ${topMissing[0]}, especially if those gaps are not random.`);
  }
  if (numericFields.length === 0) {
    risks.push('There are no numeric columns, so quantitative trend analysis is limited.');
  }
  if (rowCount < 10) {
    risks.push('The dataset is small, so any apparent pattern may be unstable.');
  }
  if (!risks.length) {
    risks.push('This summary is based on aggregate digest data rather than full statistical modeling.');
  }

  const actions = [];
  if (topGrowth) {
    actions.push(`Review the records behind ${topGrowth.field} to confirm whether the observed change matches a real business event.`);
  }
  if (topMissing) {
    actions.push(`Clean or backfill missing values in ${topMissing[0]} before using it in downstream decisions.`);
  }
  if (numericFields.length > 1) {
    actions.push('Compare related numeric columns in the charts to validate whether the visible patterns move together.');
  }
  if (!actions.length) {
    actions.push('Upload a dataset with more numeric fields or more rows for richer automated insights.');
  }

  return [
    `TITLE: Local analysis for ${fileName}`,
    `SUMMARY: This fallback summary was generated in the browser from the uploaded dataset digest because the AI backend was unavailable. The dataset has ${rowCount} rows and ${dataset?.fields?.length ?? 0} fields, with ${numericFields.length} numeric fields available for quick analysis.`,
    'FINDINGS:',
    ...findings.slice(0, 3).map((item) => `- ${item}`),
    'RISKS:',
    ...risks.slice(0, 2).map((item) => `- ${item}`),
    'RECOMMENDED_ACTIONS:',
    ...actions.slice(0, 2).map((item) => `- ${item}`),
  ].join('\n');
};

export const buildLocalQaAnswer = ({ question, dataset, fileName = 'dataset' }) => {
  const normalizedQuestion = String(question ?? '').toLowerCase();
  const numericFields = Array.isArray(dataset?.numericSummary) ? dataset.numericSummary : [];
  const missingEntries = Object.entries(dataset?.missingByField ?? {});
  const rowCount = dataset?.rowCount ?? 0;
  const metric =
    includesAny(normalizedQuestion, ['average', 'avg', 'mean']) ? 'avg'
      : includesAny(normalizedQuestion, ['minimum', 'lowest', 'smallest', 'min']) ? 'min'
      : includesAny(normalizedQuestion, ['maximum', 'highest', 'largest', 'max']) ? 'max'
      : includesAny(normalizedQuestion, ['count', 'how many values']) ? 'count'
      : null;

  if (normalizedQuestion.includes('how many row')) {
    return `${fileName} contains ${rowCount} rows.`;
  }

  if (normalizedQuestion.includes('how many column') || normalizedQuestion.includes('how many field')) {
    return `${fileName} contains ${dataset?.fields?.length ?? 0} fields: ${(dataset?.fields ?? []).join(', ')}.`;
  }

  if (normalizedQuestion.includes('missing')) {
    const details = missingEntries
      .filter(([, count]) => Number(count) > 0)
      .map(([field, count]) => `${field}: ${count}`)
      .join(', ');

    return details
      ? `Missing values by field are ${details}.`
      : 'I do not see any missing values in the uploaded dataset digest.';
  }

  const matchedField = numericFields.find((field) => normalizedQuestion.includes(String(field.field).toLowerCase()));
  if (matchedField) {
    return describeMetric(matchedField, metric);
  }

  if (metric && numericFields.length === 1) {
    return describeMetric(numericFields[0], metric);
  }

  if (metric && numericFields.length > 1) {
    const label =
      metric === 'avg' ? 'averages'
        : metric === 'min' ? 'minimums'
        : metric === 'max' ? 'maximums'
        : 'numeric counts';
    const details = numericFields
      .slice(0, 4)
      .map((field) => {
        const value =
          metric === 'avg' ? field.avg
            : metric === 'min' ? field.min
            : metric === 'max' ? field.max
            : field.count;
        return `${field.field}: ${value}`;
      })
      .join(', ');
    return `I found multiple numeric fields in ${fileName}. Here are their ${label}: ${details}. Ask for a specific field if you want one value only.`;
  }

  const topMissing = missingEntries
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])[0];

  const strongestTrend = [...numericFields]
    .map((field) => ({
      ...field,
      delta: Number(field.last) - Number(field.first),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  const summaryParts = [
    `I could not use the AI backend, so this answer is based on the uploaded dataset digest for ${fileName}.`,
    `The dataset has ${rowCount} rows and ${dataset?.fields?.length ?? 0} fields.`,
  ];

  if (strongestTrend && Number.isFinite(strongestTrend.delta)) {
    summaryParts.push(`${strongestTrend.field} shows the largest first-to-last change at ${strongestTrend.delta.toFixed(2)}.`);
  }

  if (topMissing) {
    summaryParts.push(`${topMissing[0]} has the most missing values at ${topMissing[1]} (${toPercent(topMissing[1] / Math.max(rowCount, 1))}).`);
  }

  summaryParts.push('Ask about a specific field name, missing values, rows, or columns and I can answer more directly from the digest.');
  return summaryParts.join(' ');
};

export const isMissingAiRouteError = (message) => {
  const raw = String(message ?? '').toLowerCase();
  return raw.includes('http 404') || raw.includes('404') || raw.includes('failed to fetch');
};
