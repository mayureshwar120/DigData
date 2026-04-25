const isNumeric = (value) => typeof value === 'number' && Number.isFinite(value);

const toRounded = (value) => Number.isFinite(value) ? Number(value.toFixed(4)) : null;

export const buildDatasetDigest = (data, fields) => {
  const activeFields = Array.isArray(fields) && fields.length ? fields : Object.keys(data[0] ?? {});
  const rowCount = data.length;
  const sampleRows = data.slice(0, 80);

  const missingByField = activeFields.reduce((accumulator, field) => {
    const missing = data.reduce((count, row) => {
      const value = row[field];
      return value === '' || value === null || value === undefined ? count + 1 : count;
    }, 0);

    accumulator[field] = missing;
    return accumulator;
  }, {});

  const numericSummary = activeFields
    .map((field) => {
      const values = data.map((row) => row[field]).filter(isNumeric);
      if (!values.length) {
        return null;
      }

      const sum = values.reduce((total, value) => total + value, 0);
      return {
        field,
        count: values.length,
        avg: toRounded(sum / values.length),
        min: toRounded(Math.min(...values)),
        max: toRounded(Math.max(...values)),
        first: toRounded(values[0]),
        last: toRounded(values[values.length - 1]),
      };
    })
    .filter(Boolean);

  return {
    rowCount,
    fields: activeFields,
    missingByField,
    numericSummary,
    sampleRows,
  };
};
