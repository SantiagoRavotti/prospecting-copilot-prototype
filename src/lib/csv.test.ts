import { describe, expect, it } from 'vitest';
import { escapeCsvField, parseCsv, parseProspectCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    const text = 'name,notes\n"Doe, Jane","She said ""hi""\nsecond line"';
    expect(parseCsv(text)).toEqual([
      ['name', 'notes'],
      ['Doe, Jane', 'She said "hi"\nsecond line'],
    ]);
  });

  it('handles CRLF and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseProspectCsv', () => {
  it('imports valid rows and normalizes headers', () => {
    const text = 'Full Name,Title,Company\nJane Doe,CEO,Acme';
    const result = parseProspectCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.full_name).toBe('Jane Doe');
    expect(result.errors).toHaveLength(0);
  });

  it('reports a header error when full_name is missing', () => {
    const result = parseProspectCsv('title,company\nCEO,Acme');
    expect(result.headerErrors.some((h) => h.includes('full_name'))).toBe(true);
  });

  it('rejects rows with missing name or invalid URLs, with row numbers', () => {
    const text = [
      'full_name,linkedin_url',
      ',https://linkedin.com/in/x', // row 1: no name
      'Jane Doe,not-a-url-at-all with spaces', // row 2: bad url
      'John Roe,https://www.linkedin.com/in/john', // row 3: ok
    ].join('\n');
    const result = parseProspectCsv(text);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]!.row).toBe(1);
    expect(result.errors[1]!.row).toBe(2);
  });

  it('flags unknown columns without failing', () => {
    const result = parseProspectCsv('full_name,favorite_color\nJane,blue');
    expect(result.rows).toHaveLength(1);
    expect(result.headerErrors.some((h) => h.includes('favorite_color'))).toBe(true);
  });
});

describe('toCsv / escapeCsvField', () => {
  it('escapes fields containing commas and quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('plain')).toBe('plain');
  });

  it('round-trips through parseCsv', () => {
    const csv = toCsv(['name', 'notes'], [['Doe, Jane', 'line1\nline2']]);
    const parsed = parseCsv(csv);
    expect(parsed[1]).toEqual(['Doe, Jane', 'line1\nline2']);
  });
});
