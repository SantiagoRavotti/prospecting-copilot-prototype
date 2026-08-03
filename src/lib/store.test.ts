import { beforeEach, describe, expect, it } from 'vitest';
import {
  changeStatus,
  getState,
  markSent,
  replaceState,
  resetDemoData,
  saveMessage,
  skipProspect,
  updateWorkspace,
} from './store';
import { buildDemoState } from '../data/demoData';

beforeEach(() => {
  replaceState(buildDemoState());
});

function firstReadyProspect() {
  const p = getState().prospects.find((x) => x.status === 'ready_for_review');
  if (!p) throw new Error('demo state should contain ready_for_review prospects');
  return p;
}

describe('status transitions', () => {
  it('changeStatus updates status and logs an activity', () => {
    const p = firstReadyProspect();
    changeStatus(p.id, 'connection_sent', 'test');
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.status).toBe('connection_sent');
    const activity = getState().activities.filter(
      (a) => a.prospectId === p.id && a.type === 'status_change',
    );
    expect(activity.at(-1)?.previousStatus).toBe('ready_for_review');
    expect(activity.at(-1)?.newStatus).toBe('connection_sent');
  });

  it('markSent stamps sentAt and freezes the final message', () => {
    const p = firstReadyProspect();
    saveMessage(p.id, 'Custom edited message');
    markSent(p.id);
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.status).toBe('connection_sent');
    expect(after.finalMessage).toBe('Custom edited message');
    expect(after.sentAt).toBeTruthy();
  });

  it('skipProspect returns the prospect to the pool', () => {
    const p = firstReadyProspect();
    skipProspect(p.id);
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.status).toBe('new');
    expect(after.reviewedAt).toBeTruthy();
  });

  it('no-op when status is unchanged', () => {
    const p = firstReadyProspect();
    const before = getState().activities.length;
    changeStatus(p.id, p.status);
    expect(getState().activities.length).toBe(before);
  });
});

describe('message lifecycle', () => {
  it('stores edited message separately from the original draft', () => {
    const p = firstReadyProspect();
    saveMessage(p.id, 'Hello edited');
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.originalDraft).toBe(p.originalDraft);
    expect(after.editedMessage).toBe('Hello edited');
    expect(after.editedAt).toBeTruthy();
  });

  it('saving the original draft counts as a reset', () => {
    const p = firstReadyProspect();
    saveMessage(p.id, 'Hello edited');
    saveMessage(p.id, p.originalDraft);
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.editedMessage).toBeNull();
    expect(after.editedAt).toBeNull();
  });
});

describe('workspace configuration', () => {
  it('updates and persists workspace fields', () => {
    const ws = getState().workspaces[0]!;
    updateWorkspace(ws.id, { senderName: 'New Sender', dailyTarget: 33 });
    const after = getState().workspaces.find((w) => w.id === ws.id)!;
    expect(after.senderName).toBe('New Sender');
    expect(after.dailyTarget).toBe(33);
  });

  it('updates nested targeting rules', () => {
    const ws = getState().workspaces[0]!;
    updateWorkspace(ws.id, {
      targetingRules: { ...ws.targetingRules, keywords: ['solar', 'wind'] },
    });
    const after = getState().workspaces.find((w) => w.id === ws.id)!;
    expect(after.targetingRules.keywords).toEqual(['solar', 'wind']);
  });
});

describe('demo data', () => {
  it('seeds at least 40 demo prospects across both workspaces', () => {
    const s = getState();
    expect(s.prospects.length).toBeGreaterThanOrEqual(40);
    expect(new Set(s.prospects.map((p) => p.workspaceId)).size).toBe(2);
    expect(s.prospects.every((p) => p.isDemo)).toBe(true);
  });

  it('resetDemoData restores the seed', () => {
    const p = firstReadyProspect();
    changeStatus(p.id, 'archived');
    resetDemoData();
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.status).toBe(p.status);
  });
});
