// Deterministic demo lead scoring. Labeled "Demo score" in the UI — this is a
// heuristic for the prototype, not AI output.

import type { Company, Person, Priority, ScoreBreakdown, Workspace } from './types';
import { clamp } from './utils';

const SENIORITY_POINTS: Record<string, number> = {
  'c-level': 25,
  director: 21,
  head: 19,
  manager: 13,
  senior: 10,
  other: 6,
};

export function normalizeSeniority(titleOrSeniority: string): string {
  const t = titleOrSeniority.toLowerCase();
  if (/\b(ceo|cfo|coo|cto|chief|president|founder)\b|managing director|general manager/.test(t))
    return 'c-level';
  if (/director/.test(t)) return 'director';
  if (/(head of|head,|vp|vice president)/.test(t)) return 'head';
  if (/manager/.test(t)) return 'manager';
  if (/(senior|lead|principal)/.test(t)) return 'senior';
  return 'other';
}

function matchesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => n.trim().length > 0 && h.includes(n.toLowerCase()));
}

export function computeScore(
  person: Pick<Person, 'title' | 'seniority' | 'country' | 'functionalArea'>,
  company: Pick<Company, 'industry' | 'type' | 'commercialTrigger' | 'relevantInitiatives'>,
  workspace: Pick<Workspace, 'targetingRules'>,
): { score: number; breakdown: ScoreBreakdown; priority: Priority } {
  const rules = workspace.targetingRules;

  // Relevance (0–40): industry / company-type / keyword alignment.
  let relevance = 8;
  if (matchesAny(company.industry, rules.targetIndustries)) relevance += 14;
  if (matchesAny(company.type, rules.targetCompanyTypes)) relevance += 8;
  const keywordText = `${company.industry} ${company.relevantInitiatives.join(' ')} ${company.commercialTrigger} ${person.title} ${person.functionalArea}`;
  if (matchesAny(keywordText, rules.keywords)) relevance += 10;
  if (matchesAny(keywordText, rules.negativeKeywords)) relevance -= 20;
  relevance = clamp(relevance, 0, 40);

  // Seniority (0–25).
  const seniorityKey = normalizeSeniority(person.seniority || person.title);
  let seniority = SENIORITY_POINTS[seniorityKey] ?? 6;
  if (matchesAny(person.title, rules.targetRoles)) seniority = clamp(seniority + 4, 0, 25);

  // Timing (0–20): commercial trigger and initiatives signal "why now".
  let timing = 4;
  if (company.commercialTrigger.trim().length > 0) timing += 10;
  if (company.relevantInitiatives.length > 0) timing += 6;
  timing = clamp(timing, 0, 20);

  // Geography (0–15).
  let geography = 5;
  if (rules.targetCountries.length === 0 || matchesAny(person.country, rules.targetCountries))
    geography = 15;
  geography = clamp(geography, 0, 15);

  const breakdown: ScoreBreakdown = { relevance, seniority, timing, geography };
  const score = clamp(relevance + seniority + timing + geography, 0, 100);
  return { score, breakdown, priority: priorityForScore(score) };
}

export function priorityForScore(score: number, confidence?: 'high' | 'medium' | 'low'): Priority {
  if (confidence === 'low') return 'low_confidence';
  if (score >= 80) return 'hot';
  if (score >= 60) return 'strong_fit';
  if (score >= 40) return 'networking';
  return 'low_confidence';
}
