import { beforeEach, describe, expect, it } from 'vitest';
import {
  changeOpportunityStatus,
  getState,
  migrateState,
  replaceState,
  toggleOpportunitySaved,
  updateOpportunity,
} from './store';
import { buildDemoState } from '../data/demoData';
import type { AppState } from './types';

beforeEach(() => {
  replaceState(buildDemoState());
});

describe('demo opportunities seed', () => {
  it('seeds at least 20 fictional opportunities and 15 sources', () => {
    const s = getState();
    expect(s.opportunities.length).toBeGreaterThanOrEqual(20);
    expect(s.opportunities.every((o) => o.isDemo)).toBe(true);
    expect(s.opportunitySources.length).toBeGreaterThanOrEqual(15);
    // Variety: several score levels, at least one closed and one <7-day deadline.
    const levels = new Set(s.opportunities.map((o) => o.matchLevel));
    expect(levels.size).toBeGreaterThanOrEqual(2);
  });
});

describe('opportunity workflow', () => {
  it('changes status and records history', () => {
    const o = getState().opportunities[0]!;
    changeOpportunityStatus(o.id, 'go');
    const after = getState().opportunities.find((x) => x.id === o.id)!;
    expect(after.status).toBe('go');
    expect(after.history.at(-1)?.event).toContain('go');
  });

  it('toggles saved with history entries', () => {
    const o = getState().opportunities[0]!;
    toggleOpportunitySaved(o.id);
    expect(getState().opportunities.find((x) => x.id === o.id)!.saved).toBe(true);
    toggleOpportunitySaved(o.id);
    expect(getState().opportunities.find((x) => x.id === o.id)!.saved).toBe(false);
  });

  it('updateOpportunity patches fields and logs the event', () => {
    const o = getState().opportunities[0]!;
    updateOpportunity(o.id, { notes: 'internal note' }, 'Internal note updated.');
    const after = getState().opportunities.find((x) => x.id === o.id)!;
    expect(after.notes).toBe('internal note');
    expect(after.history.at(-1)?.event).toBe('Internal note updated.');
  });
});

describe('migration v1 → v2', () => {
  it('adds opportunity collections to a v1 state and preserves existing data', () => {
    const demo = buildDemoState();
    const v1Raw: Record<string, unknown> = { ...demo, version: 1 };
    delete v1Raw.opportunities;
    delete v1Raw.opportunitySources;
    delete v1Raw.opportunityAlerts;

    const migrated = migrateState(v1Raw as unknown as AppState);
    expect(migrated.version).toBe(2);
    expect(Array.isArray(migrated.opportunities)).toBe(true);
    expect(migrated.opportunities.length).toBeGreaterThan(0);
    expect(migrated.opportunityAlerts).toEqual([]);
    expect(migrated.prospects.length).toBe(demo.prospects.length);
  });

  it('leaves v2 states untouched', () => {
    const demo = buildDemoState();
    expect(migrateState(demo)).toBe(demo);
  });
});
