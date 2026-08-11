import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  deadlineTone,
  isDuplicateOpportunity,
  levelForScore,
  scoreOpportunity,
} from './opportunityScoring';

const NOW = new Date('2026-08-06T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const HYDROGEN_INPUT = {
  title: 'Development of a National Green Hydrogen Roadmap',
  topics: ['Green hydrogen', 'Roadmap', 'Energy transition'],
  services: ['Strategy design', 'Roadmap'],
  organization: 'Ministry of Energy',
  country: 'Uruguay',
  region: 'Latin America',
  summary: 'Hydrogen strategy, roadmap and stakeholder consultation for the energy transition.',
  budgetMaxEur: 300_000,
  deadline: inDays(30),
  eligibility: { consortiumRequired: false, localPartnerRequired: false },
};

describe('scoreOpportunity', () => {
  it('scores a core hydrogen roadmap opportunity as high priority', () => {
    const r = scoreOpportunity(HYDROGEN_INPUT, NOW);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe('high');
    expect(r.factors.reduce((s, f) => s + f.points, 0)).toBe(r.score);
  });

  it('detects implied consulting relevance without the word "consultant"', () => {
    const r = scoreOpportunity(HYDROGEN_INPUT, NOW);
    const theme = r.factors.find((f) => f.key === 'theme')!;
    expect(theme.points).toBeGreaterThanOrEqual(19);
  });

  it('scores an unrelated opportunity low', () => {
    const r = scoreOpportunity(
      {
        title: 'Supply of office furniture',
        topics: ['Furniture'],
        services: [],
        organization: 'Local retailer',
        country: 'Japan',
        summary: 'Purchase of desks and chairs.',
        budgetMaxEur: 20_000,
        deadline: inDays(30),
        eligibility: { consortiumRequired: false, localPartnerRequired: false },
      },
      NOW,
    );
    expect(r.score).toBeLessThan(40);
    expect(r.level).toBe('low');
  });

  it('penalizes eligibility barriers with explanations', () => {
    const withBarriers = scoreOpportunity(
      {
        ...HYDROGEN_INPUT,
        eligibility: {
          consortiumRequired: true,
          localPartnerRequired: true,
          minAnnualTurnoverEur: 2_000_000,
        },
      },
      NOW,
    );
    const clean = scoreOpportunity(HYDROGEN_INPUT, NOW);
    expect(withBarriers.score).toBeLessThan(clean.score);
    const factor = withBarriers.factors.find((f) => f.key === 'eligibility')!;
    expect(factor.reason).toContain('consortium');
    expect(factor.reason).toContain('local partner');
  });

  it('penalizes passed and very short deadlines', () => {
    const closed = scoreOpportunity({ ...HYDROGEN_INPUT, deadline: inDays(-2) }, NOW);
    const rush = scoreOpportunity({ ...HYDROGEN_INPUT, deadline: inDays(3) }, NOW);
    const comfy = scoreOpportunity({ ...HYDROGEN_INPUT, deadline: inDays(40) }, NOW);
    const pts = (r: typeof closed) => r.factors.find((f) => f.key === 'deadline')!.points;
    expect(pts(closed)).toBe(0);
    expect(pts(rush)).toBeLessThan(pts(comfy));
  });

  it('flags oversized budgets as consortium territory', () => {
    const big = scoreOpportunity({ ...HYDROGEN_INPUT, budgetMaxEur: 5_000_000 }, NOW);
    const factor = big.factors.find((f) => f.key === 'budget')!;
    expect(factor.reason.toLowerCase()).toContain('consortium');
  });
});

describe('levelForScore', () => {
  it('maps bands correctly', () => {
    expect(levelForScore(85)).toBe('high');
    expect(levelForScore(65)).toBe('review');
    expect(levelForScore(45)).toBe('possible_with_partners');
    expect(levelForScore(20)).toBe('low');
  });
});

describe('deadline helpers', () => {
  // deadlineTone uses the real clock, so build dates relative to actual now.
  const fromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  it('daysUntil and deadlineTone bands', () => {
    expect(daysUntil(undefined)).toBeNull();
    expect(deadlineTone(undefined)).toBe('none');
    expect(deadlineTone(fromNow(-1.5))).toBe('closed');
    expect(deadlineTone(fromNow(3))).toBe('red');
    expect(deadlineTone(fromNow(10))).toBe('orange');
    expect(deadlineTone(fromNow(40))).toBe('green');
  });
});

describe('isDuplicateOpportunity', () => {
  const existing = [
    {
      title: 'Hydrogen Roadmap Study',
      organization: 'UNIDO',
      reference: 'UNIDO-2026-01',
      url: 'https://example.com/opp/1',
    },
  ];

  it('matches by reference, URL, and title+organization', () => {
    expect(
      isDuplicateOpportunity(
        { title: 'Other', organization: 'Other', reference: 'unido-2026-01', url: undefined },
        existing,
      ),
    ).toBe(true);
    expect(
      isDuplicateOpportunity(
        {
          title: 'Other',
          organization: 'Other',
          reference: undefined,
          url: 'https://example.com/opp/1/',
        },
        existing,
      ),
    ).toBe(true);
    expect(
      isDuplicateOpportunity(
        {
          title: 'hydrogen roadmap study',
          organization: 'unido',
          reference: undefined,
          url: undefined,
        },
        existing,
      ),
    ).toBe(true);
    expect(
      isDuplicateOpportunity(
        { title: 'Different Study', organization: 'GIZ', reference: undefined, url: undefined },
        existing,
      ),
    ).toBe(false);
  });
});
