// In-browser CSV parsing, validation and serialization (RFC 4180 subset).
// CSV files are processed entirely in the browser — nothing is uploaded.

export const CSV_COLUMNS = [
  'full_name',
  'title',
  'company',
  'city',
  'country',
  'linkedin_url',
  'company_website',
  'industry',
  'relevant_project',
  'commercial_trigger',
  'notes',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvRow = Partial<Record<CsvColumn, string>>;

export interface CsvRowError {
  row: number; // 1-based data row number (excluding header)
  message: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: CsvRowError[];
  headerErrors: string[];
}

/** Parse CSV text into records. Handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const input = text.replace(/^\uFEFF/, ''); // strip BOM
  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ''));
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(value.trim());
}

/** Parse + validate a prospect CSV against the supported column set. */
export function parseProspectCsv(text: string): CsvParseResult {
  const raw = parseCsv(text);
  if (raw.length === 0) {
    return { rows: [], errors: [], headerErrors: ['The file is empty.'] };
  }
  const header = raw[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const headerErrors: string[] = [];
  if (!header.includes('full_name')) {
    headerErrors.push('Missing required column: full_name.');
  }
  const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length > 0) {
    headerErrors.push(`Ignored unknown column(s): ${unknown.join(', ')}.`);
  }
  const rows: CsvRow[] = [];
  const errors: CsvRowError[] = [];
  for (let r = 1; r < raw.length; r++) {
    const values = raw[r]!;
    const record: CsvRow = {};
    header.forEach((col, c) => {
      if ((CSV_COLUMNS as readonly string[]).includes(col)) {
        record[col as CsvColumn] = (values[c] ?? '').trim();
      }
    });
    const rowNumber = r; // 1-based data row
    const fullName = record.full_name ?? '';
    if (fullName.trim().length < 2) {
      errors.push({ row: rowNumber, message: 'full_name is required.' });
      continue;
    }
    if (record.linkedin_url && !looksLikeUrl(record.linkedin_url)) {
      errors.push({ row: rowNumber, message: `linkedin_url is not a valid URL.` });
      continue;
    }
    if (record.company_website && !looksLikeUrl(record.company_website)) {
      errors.push({ row: rowNumber, message: `company_website is not a valid URL.` });
      continue;
    }
    rows.push(record);
  }
  return { rows, errors, headerErrors };
}

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map((v) => escapeCsvField(v == null ? '' : String(v))).join(','));
  }
  return lines.join('\r\n');
}
