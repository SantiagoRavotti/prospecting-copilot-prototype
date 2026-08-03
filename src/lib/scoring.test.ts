import { describe, expect, it } from 'vitest';
import { computeScore, normalizeSeniority, priorityForScore } from './scoring';
import { DEMO_WORKSPACES } from '../data/demoData';

const workspace = DEMO_WORKSPACES[0]!;

describe('normalizeSeniority', () => {
  it('classifies common titles', () => {
    expect(normalizeSeniority('CEO')).toBe('c-level');
    expect(normalizeSeniority('Managing Director')).toBe('c-level');
    expect(normalizeSeniority('Business Development Director')).toBe('director');
    expect(normalizeSeniority('Head of Hydrogen')).toBe('head');
    expect(normalizeSeniority('Hydrogen Project Manager')).toBe('manager');
    expect(normalizeSeniority('Senior Analyst')).toBe('senior');
    expect(normalizeSeniority('Intern')).toBe('other');
  });
});

describe('computeScore', () => {
  const basePerson = {
    title: 'Head of Hydrogen',
    seniority: 'head',
    country: 'Spain',
    functionalArea: 'Strategy',
  };
  const baseCompany = {
    industry: 'Hydrogen',
    type: 'Project developer',
    commercialTrigger: 'announced an electrolyzer project',
    relevantInitiatives: ['Hydrogen Valley application'],
  };

  it('stays within 0–100 and matches breakdown sum', () => {
    const { score, breakdown } = computeScore(basePerson, baseCompany, workspace);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(
      breakdown.relevance + breakdown.seniority + breakdown.timing + breakdown.geography,
    );
  });

  it('scores a well-matched prospect highly', () => {
    const { score } = computeScore(basePerson, baseCompany, workspace);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('penalizes negative keywords', () => {
    const good = computeScore(basePerson, baseCompany, workspace).score;
    const bad = computeScore(
      basePerson,
      { ...baseCompany, commercialTrigger: 'launched a crypto gambling platform' },
      workspace,
    ).score;
    expect(bad).toBeLessThan(good);
  });

  it('gives lower geography points outside target countries', () => {
    const inTarget = computeScore(basePerson, baseCompany, workspace);
    const outside = computeScore({ ...basePerson, country: 'Japan' }, baseCompany, workspace);
    expect(outside.breakdown.geography).toBeLessThan(inTarget.breakdown.geography);
  });
});

describe('priorityForScore', () => {
  it('maps score bands to priorities', () => {
    expect(priorityForScore(85)).toBe('hot');
    expect(priorityForScore(65)).toBe('strong_fit');
    expect(priorityForScore(45)).toBe('networking');
    expect(priorityForScore(20)).toBe('low_confidence');
  });

  it('low research confidence forces low_confidence priority', () => {
    expect(priorityForScore(95, 'low')).toBe('low_confidence');
  });
});
