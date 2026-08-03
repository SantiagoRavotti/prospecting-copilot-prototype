// Duplicate detection for prospects/people.
// A candidate is a duplicate when its normalized LinkedIn URL matches, or when
// normalized full name + company name both match.

const COMBINING_MARKS = /[̀-ͯ]/g;

export interface DedupeCandidate {
  fullName: string;
  companyName: string;
  linkedinUrl?: string | null;
}

export function normalizeLinkedinUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split('?')[0]!;
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ');
}

export function dedupeKeyUrl(candidate: DedupeCandidate): string | null {
  const url = normalizeLinkedinUrl(candidate.linkedinUrl);
  return url.length > 0 ? `url:${url}` : null;
}

export function dedupeKeyNameCompany(candidate: DedupeCandidate): string {
  return `name:${normalizeName(candidate.fullName)}@${normalizeName(candidate.companyName)}`;
}

export function isDuplicate(candidate: DedupeCandidate, existing: DedupeCandidate[]): boolean {
  const urlKey = dedupeKeyUrl(candidate);
  const nameKey = dedupeKeyNameCompany(candidate);
  return existing.some((e) => {
    const eUrl = dedupeKeyUrl(e);
    if (urlKey && eUrl && urlKey === eUrl) return true;
    return dedupeKeyNameCompany(e) === nameKey;
  });
}

/** Returns unique candidates plus the number of duplicates removed. */
export function removeDuplicates<T extends DedupeCandidate>(
  candidates: T[],
  existing: DedupeCandidate[] = [],
): { unique: T[]; duplicates: number } {
  const seen = new Set<string>();
  for (const e of existing) {
    const urlKey = dedupeKeyUrl(e);
    if (urlKey) seen.add(urlKey);
    seen.add(dedupeKeyNameCompany(e));
  }
  const unique: T[] = [];
  let duplicates = 0;
  for (const c of candidates) {
    const urlKey = dedupeKeyUrl(c);
    const nameKey = dedupeKeyNameCompany(c);
    if ((urlKey && seen.has(urlKey)) || seen.has(nameKey)) {
      duplicates++;
      continue;
    }
    if (urlKey) seen.add(urlKey);
    seen.add(nameKey);
    unique.push(c);
  }
  return { unique, duplicates };
}
