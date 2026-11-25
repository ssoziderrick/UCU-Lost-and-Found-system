// Minimal RFC 4180 CSV parser for registry imports: quoted fields, "" escapes, commas and newlines
// inside quotes, CRLF or LF line endings, and a UTF-8 byte-order mark (as Excel writes it).

/** Returns rows as arrays of strings, each with the 1-based line number where it starts. */
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* handled with \n */ }
    else if (ch === '\n') {
      row.push(field); rows.push({ line: rowLine, cells: row });
      row = []; field = ''; line += 1; rowLine = line;
    } else field += ch;
  }
  if (inQuotes) throw new Error(`A quoted field starting on line ${rowLine} is never closed.`);
  if (field !== '' || row.length) { row.push(field); rows.push({ line: rowLine, cells: row }); }
  // Skip completely empty lines (e.g. a trailing newline in the middle of the file).
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

/** Parses CSV with a header row into objects keyed by lower-cased header names. */
function parseCsvObjects(text, { required = [] } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The file is empty.');
  const headers = rows[0].cells.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) throw new Error(`The header row is missing: ${missing.join(', ')}. Expected: ${required.join(', ')}.`);
  return rows.slice(1).map(({ line, cells }) => ({
    line,
    extraCells: cells.length > headers.length,
    values: Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  }));
}

module.exports = { parseCsv, parseCsvObjects };
