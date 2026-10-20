import { beforeEach, describe, expect, it } from 'vitest';
import { getState, replaceState, saveMessage } from './store';
import {
  approve,
  createBatch,
  createCampaign,
  createResearchTask,
  discard,
  finishBatch,
  recordBatchEvent,
  saveProposals,
  setObservedLimit,
  startBatch,
} from './campaignStore';
import {
  checkApprovable,
  DEFAULT_CHANNEL_LIMIT,
  dedupeVerdict,
  effectiveLimit,
  pendingRecipients,
  recipientState,
} from './campaigns';
import { buildDesktopInitialState, CAMPAIGN_BL_ID, CAMPAIGN_DATA_AI_ID } from '../data/campaigns';

const PROPOSALS = [
  { fullName: 'Ana Test Uno', title: 'CEO', company: 'Uno SA', linkedinUrl: 'https://www.linkedin.com/in/ana-uno/', whyFit: 'fit', draftMessage: 'Hola Ana, me gustaría conectar.' },
  { fullName: 'Bruno Test Dos', title: 'CTO', company: 'Dos SL', linkedinUrl: 'https://linkedin.com/in/bruno-dos', whyFit: 'fit', draftMessage: 'Hola Bruno, me gustaría conectar.' },
  { fullName: 'Carla Test Tres', title: 'Head of Data', company: 'Tres GmbH', linkedinUrl: 'https://www.linkedin.com/in/carla-tres', whyFit: 'fit', draftMessage: 'Hola Carla, me gustaría conectar.' },
];

function seedCampaignWithFichas() {
  replaceState(buildDesktopInitialState());
  const campaign = createCampaign(CAMPAIGN_BL_ID, { name: 'E-commerce España' });
  const task = createResearchTask(campaign.id, 'Buscar 3 perfiles de e-commerce', []);
  const outcome = saveProposals(task.id, PROPOSALS);
  return { campaign, task, outcome };
}

beforeEach(() => {
  replaceState(buildDesktopInitialState());
});

describe('dedupe: stable id hard, name+company soft', () => {
  it('normalized LinkedIn URL is a hard duplicate; name+company only warns', () => {
    const { outcome } = seedCampaignWithFichas();
    expect(outcome.created).toHaveLength(3);
    const s = getState();
    expect(dedupeVerdict(s, { fullName: 'Other Name', companyName: 'X', linkedinUrl: 'linkedin.com/in/ana-uno' }).hardDuplicate).toBe(true);
    const soft = dedupeVerdict(s, { fullName: 'ana test uno', companyName: 'UNO SA', linkedinUrl: '' });
    expect(soft.hardDuplicate).toBe(false);
    expect(soft.possibleDuplicate).toBe(true);
  });

  it('a second campaign on the same account skips hard duplicates and flags soft ones', () => {
    const { task } = seedCampaignWithFichas();
    const c2 = createCampaign(CAMPAIGN_DATA_AI_ID, { name: 'Datos & IA — ronda 1' });
    const t2 = createResearchTask(c2.id, 'otra ronda', []);
    const outcome = saveProposals(t2.id, [
      PROPOSALS[0]!, // same URL → skipped
      { ...PROPOSALS[1]!, linkedinUrl: '' }, // same name+company, no URL → created with warning
      { fullName: 'Nuevo Cuatro', title: 'CEO', company: 'Cuatro', whyFit: 'fit', draftMessage: 'Hola.' },
    ]);
    expect(outcome.skippedHardDuplicates).toEqual(['Ana Test Uno']);
    expect(outcome.possibleDuplicates).toEqual(['Bruno Test Dos']);
    expect(outcome.created).toHaveLength(2);
    expect(task).toBeTruthy();
  });
});

describe('approval versioning and configurable limits', () => {
  it('edit after approval invalidates it; re-approval freezes the new text', () => {
    const { outcome } = seedCampaignWithFichas();
    const id = outcome.created[0]!;
    approve(id);
    expect(getState().prospects.find((p) => p.id === id)!.approval?.status).toBe('approved');
    saveMessage(id, 'Texto modificado después de aprobar.');
    expect(getState().prospects.find((p) => p.id === id)!.approval?.status).toBe('pending');
    approve(id);
    expect(getState().prospects.find((p) => p.id === id)!.approval?.approvedText).toBe('Texto modificado después de aprobar.');
  });

  it('limit is provisional until observed, and observed wins', () => {
    expect(effectiveLimit(DEFAULT_CHANNEL_LIMIT)).toBe(280);
    const longText = 'x'.repeat(250);
    expect(checkApprovable(longText, DEFAULT_CHANNEL_LIMIT).ok).toBe(true);
    setObservedLimit(200); // the real form turned out to be shorter
    const cfg = getState().channelLimits!.linkedin_invite;
    expect(effectiveLimit(cfg)).toBe(180);
    const check = checkApprovable(longText, cfg);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('observed 200');
  });
});

describe('frozen batch, event history and idempotency', () => {
  it('freezes exact recipients + messages and only approved/unchanged fichas', () => {
    const { campaign, outcome } = seedCampaignWithFichas();
    approve(outcome.created[0]!);
    approve(outcome.created[1]!);
    discard(outcome.created[2]!);
    const batch = createBatch(campaign.id, 'dry_run');
    expect(batch.recipients).toHaveLength(2);
    expect(batch.recipients[0]!.frozenMessage).toBe('Hola Ana, me gustaría conectar.');
    // Editing after the freeze does not alter the frozen copy.
    saveMessage(outcome.created[0]!, 'cambio tardío');
    expect(getState().batches![0]!.recipients[0]!.frozenMessage).toBe('Hola Ana, me gustaría conectar.');
  });

  it('same event id is processed once; confirmed send is final; uncertain can be resolved', () => {
    const { campaign, outcome } = seedCampaignWithFichas();
    outcome.created.forEach(approve);
    const batch = createBatch(campaign.id, 'dry_run');
    startBatch(batch.id);
    const base = { batchId: batch.id, senderAccountId: batch.senderAccountId, mode: 'dry_run' as const, source: 'mock' as const };
    const [a, b] = batch.recipients;

    const r1 = recordBatchEvent({ ...base, id: 'ev-1', prospectId: a!.prospectId, kind: 'result', status: 'sent', detail: 'confirmed' });
    const r1again = recordBatchEvent({ ...base, id: 'ev-1', prospectId: a!.prospectId, kind: 'result', status: 'sent', detail: 'dup' });
    expect(r1.applied).toBe(true);
    expect(r1again).toEqual({ applied: false, reason: 'duplicate event id' });
    expect(recordBatchEvent({ ...base, id: 'ev-2', prospectId: a!.prospectId, kind: 'action', status: 'sent', detail: 're-run' }).reason).toContain('never re-executed');

    recordBatchEvent({ ...base, id: 'ev-3', prospectId: b!.prospectId, kind: 'result', status: 'uncertain', detail: 'timeout' });
    let st = recipientState(getState().batchEvents!, batch.id, b!.prospectId);
    expect(st.status).toBe('uncertain');
    expect(st.resolved).toBe(false);
    expect(pendingRecipients(getState().batches![0]!).map((r) => r.prospectId)).toContain(b!.prospectId);

    recordBatchEvent({ ...base, id: 'ev-4', prospectId: b!.prospectId, kind: 'verification', status: 'pending_invitation', detail: 'invitation visible on profile', verifiedBeforeAction: true });
    st = recipientState(getState().batchEvents!, batch.id, b!.prospectId);
    expect(st.status).toBe('pending_invitation');
    expect(st.resolved).toBe(true);
  });

  it('single queue per sender account across campaigns; finishing releases the lock', () => {
    const { campaign, outcome } = seedCampaignWithFichas();
    outcome.created.forEach(approve);
    const batch = createBatch(campaign.id, 'dry_run');
    startBatch(batch.id);
    const c2 = createCampaign(CAMPAIGN_DATA_AI_ID, { name: 'otra' });
    const t2 = createResearchTask(c2.id, 'x', []);
    const o2 = saveProposals(t2.id, [{ fullName: 'Dora Cinco', title: 'CEO', company: 'Cinco', linkedinUrl: 'https://linkedin.com/in/dora', whyFit: 'f', draftMessage: 'Hola Dora.' }]);
    o2.created.forEach(approve);
    const batch2 = createBatch(c2.id, 'dry_run');
    expect(batch2.senderAccountId).toBe(batch.senderAccountId); // same LinkedIn account
    expect(() => startBatch(batch2.id)).toThrow(/Another batch/);
    finishBatch(batch.id, 'completed');
    expect(() => startBatch(batch2.id)).not.toThrow();
  });

  it('dry-run never moves pipeline status; state survives serialization (restart)', () => {
    const { campaign, outcome } = seedCampaignWithFichas();
    outcome.created.forEach(approve);
    const batch = createBatch(campaign.id, 'dry_run');
    startBatch(batch.id);
    recordBatchEvent({ id: 'ev-dry', batchId: batch.id, prospectId: batch.recipients[0]!.prospectId, senderAccountId: batch.senderAccountId, mode: 'dry_run', kind: 'result', status: 'skipped', detail: 'dry-run: no send', source: 'mock' });
    expect(getState().prospects.find((p) => p.id === batch.recipients[0]!.prospectId)!.status).toBe('ready_for_review');
    const restored = JSON.parse(JSON.stringify(getState()));
    replaceState(restored);
    expect(pendingRecipients(getState().batches![0]!)).toHaveLength(2);
    expect(getState().executionLocks![batch.senderAccountId]!.batchId).toBe(batch.id);
  });
});
