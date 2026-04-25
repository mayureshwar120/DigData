import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const GROQ_RESPONSES_API_URL = 'https://api.groq.com/openai/v1/responses';
const GROQ_CHAT_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });

    req.on('error', reject);
  });

const getChatOutputText = (payload) => {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim();
  }

  return '';
};

const getResponsesOutputText = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];

  return outputs
    .flatMap((item) => item?.content ?? [])
    .filter((item) =>
      (item?.type === 'output_text' || item?.type === 'text') &&
      typeof (item?.text ?? item?.content?.[0]?.text) === 'string'
    )
    .map((item) => item.text ?? item.content?.[0]?.text)
    .join('\n')
    .trim();
};

const toApiError = (status, payload, fallbackMessage) => {
  const message =
    payload?.error?.message ||
    payload?.message ||
    fallbackMessage;

  const error = new Error(message);
  error.status = status;
  return error;
};

const buildInsightsPrompt = (dataset, fileName = 'dataset') => `
You are a senior data analyst.
Use only the provided dataset digest. If information is missing, say that explicitly.

Dataset name: ${fileName}
Rows: ${dataset.rowCount}
Fields: ${dataset.fields.join(', ')}
Missing values by field: ${JSON.stringify(dataset.missingByField)}
Numeric summary: ${JSON.stringify(dataset.numericSummary)}
Sample rows (first ${dataset.sampleRows.length}): ${JSON.stringify(dataset.sampleRows)}

Return exactly in this format:
TITLE: <short title>
SUMMARY: <2-3 sentences grounded in the data>
FINDINGS:
- <finding 1>
- <finding 2>
- <finding 3>
RISKS:
- <risk or caveat 1>
- <risk or caveat 2>
RECOMMENDED_ACTIONS:
- <action 1>
- <action 2>
`.trim();

const buildQaPrompt = ({ question, dataset, history, fileName = 'dataset' }) => `
You are answering questions about uploaded tabular data.
Be accurate and explicit. If the answer cannot be derived from the digest, say "I can't verify that from this uploaded data."
Keep answers concise (max 6 sentences).

Dataset name: ${fileName}
Rows: ${dataset.rowCount}
Fields: ${dataset.fields.join(', ')}
Missing values by field: ${JSON.stringify(dataset.missingByField)}
Numeric summary: ${JSON.stringify(dataset.numericSummary)}
Sample rows (first ${dataset.sampleRows.length}): ${JSON.stringify(dataset.sampleRows)}
Recent conversation: ${JSON.stringify(history ?? [])}
User question: ${question}
`.trim();

const toPercent = (value) => `${(value * 100).toFixed(1)}%`;

const buildLocalInsights = (dataset, fileName = 'dataset') => {
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
    `SUMMARY: This fallback summary was generated from the uploaded dataset digest because the external AI provider was unavailable. The dataset has ${rowCount} rows and ${dataset?.fields?.length ?? 0} fields, with ${numericFields.length} numeric fields available for quick analysis.`,
    'FINDINGS:',
    ...findings.slice(0, 3).map((item) => `- ${item}`),
    'RISKS:',
    ...risks.slice(0, 2).map((item) => `- ${item}`),
    'RECOMMENDED_ACTIONS:',
    ...actions.slice(0, 2).map((item) => `- ${item}`),
  ].join('\n');
};

const buildLocalQaAnswer = ({ question, dataset, fileName = 'dataset' }) => {
  const normalizedQuestion = String(question ?? '').toLowerCase();
  const numericFields = Array.isArray(dataset?.numericSummary) ? dataset.numericSummary : [];
  const missingEntries = Object.entries(dataset?.missingByField ?? {});
  const rowCount = dataset?.rowCount ?? 0;

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
    const delta = Number(matchedField.last) - Number(matchedField.first);
    const deltaText = Number.isFinite(delta) ? `${delta.toFixed(2)}` : 'unknown';
    return `${matchedField.field} has an average of ${matchedField.avg}, a minimum of ${matchedField.min}, a maximum of ${matchedField.max}, and changed by ${deltaText} from the first to the last observed value in the digest.`;
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
    `I could not use the external AI provider, so this answer is based on the uploaded dataset digest for ${fileName}.`,
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

const resolveGroqConfig = (env) => {
  const apiKey =
    env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY;

  const model =
    env.GROQ_MODEL ||
    process.env.GROQ_MODEL ||
    'llama-3.3-70b-versatile';

  return { apiKey, model };
};

const callAI = async ({ prompt, maxOutputTokens = 500, env }) => {
  const { apiKey, model } = resolveGroqConfig(env);

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const responsesResponse = await fetch(GROQ_RESPONSES_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOutputTokens,
    }),
  });

  const responsesPayload = await responsesResponse.json().catch(() => ({}));

  if (responsesResponse.ok) {
    const output = getResponsesOutputText(responsesPayload);
    if (output) {
      return output;
    }
  } else if (responsesResponse.status !== 404) {
    throw toApiError(responsesResponse.status, responsesPayload, 'Groq request failed.');
  }

  const chatResponse = await fetch(GROQ_CHAT_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxOutputTokens,
      temperature: 0.2,
    }),
  });

  const chatPayload = await chatResponse.json().catch(() => ({}));

  if (!chatResponse.ok) {
    throw toApiError(chatResponse.status, chatPayload, 'Groq request failed.');
  }

  const output = getChatOutputText(chatPayload);
  if (!output) {
    throw new Error('No text returned from Groq.');
  }

  return output;
};

const aiMiddleware = (env) => ({
  name: 'ai-dev-routes',
  configureServer(server) {
    server.middlewares.use('/api/ai/insights', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      let body = {};

      try {
        body = await readJsonBody(req);
        const { dataset, fileName } = body;

        if (!dataset?.rowCount || !Array.isArray(dataset?.fields)) {
          sendJson(res, 400, { error: 'Invalid dataset payload.' });
          return;
        }

        const prompt = buildInsightsPrompt(dataset, fileName);
        const text = await callAI({ prompt, maxOutputTokens: 700, env });
        sendJson(res, 200, { text });
      } catch (error) {
        const { dataset, fileName } = body;
        if (dataset?.rowCount && Array.isArray(dataset?.fields)) {
          sendJson(res, 200, {
            text: buildLocalInsights(dataset, fileName),
            fallback: true,
            providerError: error.message || 'Insights generation failed.',
          });
          return;
        }

        sendJson(res, error.status || 500, { error: error.message || 'Insights generation failed.' });
      }
    });

    server.middlewares.use('/api/ai/qa', async (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      let body = {};

      try {
        body = await readJsonBody(req);
        const { question, dataset, history, fileName } = body;

        if (!question || !dataset?.rowCount || !Array.isArray(dataset?.fields)) {
          sendJson(res, 400, { error: 'Invalid Q&A payload.' });
          return;
        }

        const prompt = buildQaPrompt({ question, dataset, history, fileName });
        const text = await callAI({ prompt, maxOutputTokens: 500, env });
        sendJson(res, 200, { text });
      } catch (error) {
        const { question, dataset, fileName } = body;
        if (question && dataset?.rowCount && Array.isArray(dataset?.fields)) {
          sendJson(res, 200, {
            text: buildLocalQaAnswer({ question, dataset, fileName }),
            fallback: true,
            providerError: error.message || 'Q&A generation failed.',
          });
          return;
        }

        sendJson(res, error.status || 500, { error: error.message || 'Q&A generation failed.' });
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), aiMiddleware(env)],
  };
})
