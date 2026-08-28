// ── Generic Delimited File Utilities ──────────────────────────────

// Detect delimiter from file content
export const detectDelimiter = (content) => {
  const firstLine = content.split('\n')[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount >= commaCount ? '\t' : ',';
};

// Parse any delimited file and return { headers, rows, delimiter }
export const parseDelimitedFile = (fileContent) => {
  const delimiter = detectDelimiter(fileContent);
  const lines = fileContent.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    throw new Error('File must have at least a header row and one data row.');
  }

  // Skip comment lines starting with '#'
  const headerLineIndex = lines.findIndex(l => !l.trim().startsWith('#'));
  if (headerLineIndex === -1) throw new Error('No header row found.');

  const headers = lines[headerLineIndex].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

  const rows = lines.slice(headerLineIndex + 1).map(line => {
    const parts = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = parts[i] || ''; });
    return row;
  });

  return { headers, rows, delimiter };
};

// Extract unique terms from a specific column
export const extractTermsFromColumn = (rows, termColumn, contextColumn = null) => {
  const terms = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const termValue = row[termColumn];
    if (!termValue || seen.has(termValue)) return;
    seen.add(termValue);

    terms.push({
      id: `row_${index}`,
      term: termValue,
      type: 'datasetField',
      context: contextColumn ? (row[contextColumn] || '') : '',
      field_name: termValue,
      field_type: '',
      original_data: row,
      row_index: index,
    });
  });

  return terms;
};

// Quote a value for safe inclusion in a delimited row if it contains the
// delimiter, a quote character, or a newline — standard CSV-style quoting.
// Needed in particular for the raw annotation JSON column: unlike most
// other fields, JSON is virtually guaranteed to contain the delimiter
// itself (e.g. every comma in a comma-delimited export), so without this
// it would silently corrupt row/column alignment.
const csvSafe = (value, delimiter) => {
  const str = String(value ?? '');
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Generate annotated export with controlled vocabulary support
export const generateAnnotatedContent = (
  rows,
  headers,
  selectedAnnotations,
  termColumn,
  delimiter = '\t',
  cvValues = {}
) => {
  const extraHeaders = ['termURI', 'termLabel', 'termOntology', 'controlledVocabulary', 'annotationRawJSON'];
  const allHeaders = [...headers, ...extraHeaders.filter(h => !headers.includes(h))];
  const lines = [allHeaders.join(delimiter)];

  rows.forEach((row, index) => {
    const termValue = row[termColumn];
    const annotation = termValue
      ? Object.values(selectedAnnotations).find(a => a.field_name === termValue)
      : null;
    const cvTerms = termValue ? cvValues[termValue] || [] : [];
    // Serialise only the information needed to reconstruct the term later
    const cvSerialized = JSON.stringify(
      cvTerms.map(cv => ({
        value: cv.Value || cv.term,
        identifier: cv.identifier || cv.short_form || '',
        iri: cv.iri || '',
        ontology: cv.ontology || ''
      }))
    );
    // Full, untouched JSON of the mapping the user actually selected — the
    // complete search-result record (all fields returned by the ontology
    // service, not just the handful surfaced as their own columns above),
    // so nothing about the chosen annotation is lost on export.
    const rawJsonSerialized = annotation
      ? JSON.stringify(annotation.raw_mapping ?? annotation)
      : '';
    const values = allHeaders.map(h => {
      if (h === 'termURI') return annotation?.short_form || annotation?.iri || '';
      if (h === 'termLabel') return annotation?.label || '';
      if (h === 'termOntology') return annotation?.ontology || '';
      if (h === 'controlledVocabulary') return csvSafe(cvSerialized, delimiter);
      if (h === 'annotationRawJSON') return csvSafe(rawJsonSerialized, delimiter);
      return row[h] || '';
    });
    lines.push(values.join(delimiter));
  });

  return lines.join('\n');
};