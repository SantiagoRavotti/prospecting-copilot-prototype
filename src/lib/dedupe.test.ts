import { describe, expect, it } from 'vitest';
import { isDuplicate, normalizeLinkedinUrl, normalizeName, removeDuplicates } from './dedupe';

describe('normalizeLinkedinUrl', () => {
  it('normalizes scheme, www, trailing slash and query', () => {
    expect(normalizeLinkedinUrl('https://www.linkedin.com/in/jane-doe/')).toBe(
      'linkedin.com/in/jane-doe',
    );
    expect(normalizeLinkedinUrl('http://linkedin.com/in/jane-doe?utm=x')).toBe(
      'linkedin.com/in/jane-doe',
    );
    expect(normalizeLinkedinUrl('LINKEDIN.com/in/Jane-Doe')).toBe('linkedin.com/in/jane-doe');
  });
});

describe('normalizeName', () => {
  it('strips accents, case and extra whitespace', () => {
    expect(normalizeName('  José   PÉREZ ')).toBe('jose perez');
  });
});

describe('isDuplicate', () => {
  const existing = [
    { fullName: 'Jane Doe', companyName: 'Acme', linkedinUrl: 'https://www.linkedin.com/in/jane' },
  ];

  it('detects duplicates by LinkedIn URL', () => {
    expect(
      isDuplicate(
        { fullName: 'J. Doe', companyName: 'Other', linkedinUrl: 'linkedin.com/in/jane/' },
        existing,
      ),
    ).toBe(true);
  });

  it('detects duplicates by name + company', () => {
    expect(isDuplicate({ fullName: 'jane doe', companyName: 'ACME' }, existing)).toBe(true);
  });

  it('does not flag different people', () => {
    expect(isDuplicate({ fullName: 'Jane Doe', companyName: 'Globex' }, existing)).toBe(false);
  });
});

describe('removeDuplicates', () => {
  it('removes duplicates within a batch and against existing records', () => {
    const existing = [{ fullName: 'A One', companyName: 'X', linkedinUrl: '' }];
    const batch = [
      { fullName: 'A One', companyName: 'X', linkedinUrl: '' }, // dup vs existing
      { fullName: 'B Two', companyName: 'Y', linkedinUrl: 'linkedin.com/in/b' },
      { fullName: 'B Two Alias', companyName: 'Z', linkedinUrl: 'https://linkedin.com/in/b' }, // dup URL
      { fullName: 'C Three', companyName: 'W', linkedinUrl: '' },
    ];
    const { unique, duplicates } = removeDuplicates(batch, existing);
    expect(unique.map((u) => u.fullName)).toEqual(['B Two', 'C Three']);
    expect(duplicates).toBe(2);
  });
});
