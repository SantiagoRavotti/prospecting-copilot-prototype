import { beforeEach, describe, expect, it } from 'vitest';
import { changeStatus, getState, logConversation, markSent, replaceState } from './store';
import { buildDemoState } from '../data/demoData';

beforeEach(() => {
  replaceState(buildDemoState());
});

function readyProspect() {
  return getState().prospects.find((p) => p.status === 'ready_for_review')!;
}

describe('conversation thread', () => {
  it('markSent auto-logs the final message as a sent entry', () => {
    const p = readyProspect();
    markSent(p.id);
    const thread = (getState().conversations ?? []).filter((c) => c.prospectId === p.id);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.direction).toBe('sent');
    expect(thread[0]!.text).toBe(p.editedMessage ?? p.originalDraft);
  });

  it('a received reply is logged and advances connection_sent → replied', () => {
    const p = readyProspect();
    markSent(p.id);
    logConversation(p.id, 'received', 'Gracias Santiago, hablemos la semana próxima.');
    const after = getState().prospects.find((x) => x.id === p.id)!;
    expect(after.status).toBe('replied');
    const thread = (getState().conversations ?? []).filter((c) => c.prospectId === p.id);
    expect(thread.map((c) => c.direction)).toEqual(['sent', 'received']);
  });

  it('a reply on an already-replied prospect does not change status again', () => {
    const p = readyProspect();
    changeStatus(p.id, 'meeting_booked');
    logConversation(p.id, 'received', 'Confirmo la reunión.');
    expect(getState().prospects.find((x) => x.id === p.id)!.status).toBe('meeting_booked');
  });

  it('empty replies are ignored', () => {
    const p = readyProspect();
    logConversation(p.id, 'received', '   ');
    expect((getState().conversations ?? []).filter((c) => c.prospectId === p.id)).toHaveLength(0);
  });
});
