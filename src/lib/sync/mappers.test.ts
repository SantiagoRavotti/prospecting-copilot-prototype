import { describe, expect, it } from 'vitest';
import {
  activityFromRow,
  activityToRow,
  camelToSnake,
  companyFromRow,
  companyToRow,
  followUpFromRow,
  followUpToRow,
  opportunityFromRow,
  opportunityToRow,
  personFromRow,
  personToRow,
  prospectFromRow,
  prospectToRow,
  snakeToCamel,
  workspaceFromRow,
  workspaceToRow,
} from './mappers';
import { buildDemoState } from '../../data/demoData';

const state = buildDemoState();

describe('key conversion', () => {
  it('round-trips camelCase keys', () => {
    for (const k of ['workspaceId', 'budgetMaxEur', 'linkedinUrl', 'isDemo', 'id']) {
      expect(snakeToCamel(camelToSnake(k))).toBe(k);
    }
  });
});

describe('entity ⇄ row round trips', () => {
  it('workspace survives a round trip (owner_id/created_at dropped)', () => {
    const w = state.workspaces[0]!;
    const row = workspaceToRow(w, 'user-123');
    expect(row.owner_id).toBe('user-123');
    expect(row.sender_name).toBe(w.senderName);
    // targeting_rules jsonb passes through verbatim (inner keys stay camelCase).
    expect((row.targeting_rules as { targetCountries: string[] }).targetCountries).toEqual(
      w.targetingRules.targetCountries,
    );
    const back = workspaceFromRow({ ...row, created_at: '2026-01-01T00:00:00Z' });
    expect(back).toEqual(w);
  });

  it('company/person/prospect round trip with workspace scoping', () => {
    const c = state.companies[0]!;
    const backC = companyFromRow({ ...companyToRow(c, 'ws-x'), created_at: 'x' });
    expect(backC).toEqual(c);

    const p = state.people[0]!;
    const rowP = personToRow(p, 'ws-x');
    expect(rowP.workspace_id).toBe('ws-x');
    expect(personFromRow({ ...rowP, created_at: 'x' })).toEqual(p);

    const pr = state.prospects[0]!;
    const backPr = prospectFromRow(prospectToRow(pr));
    expect(backPr).toEqual(pr);
    // Nullable fields keep explicit nulls.
    expect(backPr.editedMessage).toBe(pr.editedMessage);
  });

  it('activity and follow-up derive workspace_id and drop it on the way back', () => {
    const a = state.activities[0]!;
    const rowA = activityToRow(a, 'ws-y');
    expect(rowA.workspace_id).toBe('ws-y');
    expect(activityFromRow(rowA)).toEqual(a);

    const f = state.followUps[0]!;
    const rowF = followUpToRow(f, 'ws-y');
    expect(followUpFromRow(rowF)).toEqual(f);
  });

  it('opportunity round-trips jsonb payloads verbatim', () => {
    const o = state.opportunities[0]!;
    const row = opportunityToRow(o, 'ws-z');
    expect(row.workspace_id).toBe('ws-z');
    const back = opportunityFromRow(row);
    expect(back).toEqual(o);
    expect(back.matchFactors[0]?.reason).toBe(o.matchFactors[0]?.reason);
    expect(back.eligibility.consortiumRequired).toBe(o.eligibility.consortiumRequired);
  });

  it('every demo opportunity survives a round trip (nullable coverage)', () => {
    for (const o of state.opportunities) {
      expect(opportunityFromRow(opportunityToRow(o, 'ws'))).toEqual(o);
    }
  });
});
