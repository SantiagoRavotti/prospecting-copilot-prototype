// Tests of the ChatGPT batch exchange. Results below are SIMULATED payloads
// written by the test (never real research); they exercise the app's logic.

import { beforeEach, describe, expect, it } from 'vitest';
import { getState, replaceState, saveMessage } from './store';
import {
  applyMessageProposal,
  approve,
  confirmImport,
  createCampaign,
  createResearchTask,
  dismissMessageProposal,
  previewResult,
  setConfiguredLimit,
  setProspectLinkedinUrl,
} from './campaignStore';
import {
  buildContextPackage,
  buildDirective,
  buildResultExample,
  CandidateSchema,
  CONTEXT_FORMAT,
  extractJson,
  FORMAT_VERSION,
  RESULT_FORMAT,
  RESULT_JSON_SCHEMA,
} from './batchExchange';
import { essentialGaps, mergeExternalChanges } from './campaigns';
import { buildDesktopInitialState, CAMPAIGN_BL_ID, CAMPAIGN_DATA_AI_ID } from '../data/campaigns';
import type { AppState, Prospect } from './types';

function cand(n: number, extra: Record<string, unknown> = {}) {
  return {
    ref: `c${n}`,
    full_name: `Persona Simulada ${n}`,
    linkedin_url: `https://www.linkedin.com/in/simulada-${n}/`,
    title: 'Head of E-commerce',
    company: `Empresa Simulada ${n}`,
    location: 'Madrid, España',
    fit_reason: 'Encaja con la campaña (simulado).',
    facts: [{ text: `Hecho simulado ${n}`, source_url: `https://example.com/f${n}` }],
    posts: [],
    inferences: ['Probable interés (suposición simulada).'],
    draft_message: `Hola Persona ${n}, me gustaría conectar.`,
    ...extra,
  };
}

function result(campaignId: string, taskId: string, candidates: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: RESULT_FORMAT,
    format_version: FORMAT_VERSION,
    campaign_id: campaignId,
    task_id: taskId,
    linkedin_posts_accessible: false,
    limitations: ['No pude leer publicaciones de LinkedIn.'],
    candidates,
    ...extra,
  });
}

const ctx = (campaignId: string) => ({ campaignId, input: 'paste' as const });

let campaignId: string;
let taskId: string;

beforeEach(() => {
  replaceState(buildDesktopInitialState());
  const c = createCampaign(CAMPAIGN_BL_ID, {
    name: 'E-commerce España',
    objective: 'Networking con responsables de e-commerce',
    audience: 'Head of E-commerce / Digital',
    searchCriteria: 'España, retail online',
    exclusions: ['Competidores directos'],
    targetCount: 3,
    messageGuidelines: 'Cercano, sin vender.',
    styleExamples: ['Hola Ana, vi tu charla sobre marketplaces…'],
  });
  const t = createResearchTask(c.id, 'Priorizá gente que publique sobre marketplaces', []);
  campaignId = c.id;
  taskId = t.id;
});

const fichas = (cid = campaignId): Prospect[] => getState().prospects.filter((p) => p.campaignId === cid);
const person = (p: Prospect) => getState().people.find((x) => x.id === p.personId)!;

describe('context package and directive (what goes out)', () => {
  it('is built from the app data and carries everything the brief lists', () => {
    const other = createCampaign(CAMPAIGN_BL_ID, { name: 'Campaña anterior', objective: 'Eventos' });
    const t0 = createResearchTask(other.id, 'x', []);
    confirmImport(result(other.id, t0.id, [cand(1), cand(2)]), ctx(other.id));
    approve(fichas(other.id)[0]!.id);

    const pkg = buildContextPackage(getState(), campaignId, taskId, '2026-10-21T10:00:00Z');
    expect(pkg.format).toBe(CONTEXT_FORMAT);
    expect(pkg.format_version).toBe(FORMAT_VERSION);
    expect(pkg.campaign_id).toBe(campaignId);
    expect(pkg.task_id).toBe(taskId);
    expect(pkg.app_version).toBeTruthy();
    expect(pkg.campaign).toMatchObject({
      objective: 'Networking con responsables de e-commerce',
      exclusions: ['Competidores directos'],
      target_count: 3,
      language: 'es',
    });
    expect(pkg.style).toMatchObject({
      guidelines: 'Cercano, sin vender.',
      saved_examples: ['Hola Ana, vi tu charla sobre marketplaces…'],
    });
    expect((pkg.style as { approved_message_examples: string[] }).approved_message_examples).toHaveLength(1);
    expect(pkg.request.instruction_from_user).toContain('marketplaces');
    expect(pkg.existing_contacts.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Persona Simulada 1', 'Persona Simulada 2']),
    );
    expect(pkg.existing_contacts.find((c) => c.name === 'Persona Simulada 1')).toMatchObject({
      linkedin_url: expect.stringContaining('simulada-1'),
      campaign: 'Campaña anterior',
      status: 'approved',
    });
    expect(pkg.previous_campaigns[0]).toMatchObject({
      name: 'Campaña anterior',
      counts: { candidates: 2, approved: 1, discarded: 0 },
    });
    expect(pkg.result_format.json_schema).toEqual(RESULT_JSON_SCHEMA);
    expect(pkg.rules.join(' ')).toMatch(/No inventes/);
  });

  it('existing contacts include people from OTHER workspaces (same LinkedIn account)', () => {
    const other = createCampaign(CAMPAIGN_DATA_AI_ID, { name: 'Datos e IA' });
    const t0 = createResearchTask(other.id, 'x', []);
    confirmImport(result(other.id, t0.id, [cand(9)]), ctx(other.id));
    const pkg = buildContextPackage(getState(), campaignId, taskId);
    expect(pkg.existing_contacts.map((c) => c.name)).toContain('Persona Simulada 9');
  });

  it('the directive is complete and honest, and the example is consistent with the importer', () => {
    const pkg = buildContextPackage(getState(), campaignId, taskId);
    const text = buildDirective(pkg, 'contexto-x.json');
    for (const needle of [
      campaignId,
      taskId,
      RESULT_FORMAT,
      'contexto-x.json',
      'No completes registros ficticios',
      'No inventes',
      'existing_contacts',
      'JSON Schema',
    ]) {
      expect(text).toContain(needle);
    }
    // The generated example is structurally valid for the importer...
    const example = buildResultExample(campaignId, taskId) as { candidates: unknown[] };
    expect(CandidateSchema.safeParse(example.candidates[0]).success).toBe(true);
    // ...but is refused as data, so it can never become a real ficha.
    const preview = previewResult(JSON.stringify(example), ctx(campaignId));
    expect(preview.canConfirm).toBe(false);
    expect(preview.candidates[0]!.errors.join(' ')).toMatch(/EJEMPLO/);
  });

  it('the JSON Schema and the importer agree on the required fields', () => {
    const schemaRequired = RESULT_JSON_SCHEMA.properties.candidates.items.required;
    expect([...schemaRequired].sort()).toEqual(['draft_message', 'fit_reason', 'full_name']);
    for (const k of schemaRequired) {
      const c = cand(1) as Record<string, unknown>;
      delete c[k];
      expect(CandidateSchema.safeParse(c).success).toBe(false);
    }
  });
});

describe('valid import', () => {
  it('shows a preview, then saves fichas marked as imported ChatGPT research, pending approval', () => {
    const text = result(campaignId, taskId, [cand(1), cand(2), cand(3)]);
    const pv = previewResult(text, ctx(campaignId));
    expect(pv.canConfirm).toBe(true);
    expect(pv.counts).toMatchObject({ create: 3, update: 0, duplicate: 0, invalid: 0 });
    expect(fichas()).toHaveLength(0); // previewing saves nothing

    const { record } = confirmImport(text, ctx(campaignId));
    expect(record).toMatchObject({ created: 3, taskId, campaignId });
    expect(fichas()).toHaveLength(3);
    const f = fichas()[0]!;
    expect(f.research).toMatchObject({ origin: 'chatgpt_import', postsAccessible: false });
    expect(f.research!.facts![0]).toEqual({ text: 'Hecho simulado 1', sourceUrl: 'https://example.com/f1' });
    expect(f.approval!.status).toBe('pending');
    expect(person(f)).toMatchObject({ city: 'Madrid', country: 'España' });
    expect(getState().researchTasks!.find((t) => t.id === taskId)!.status).toBe('proposals_received');
    expect(getState().importHistory).toHaveLength(1);
  });

  it('accepts the answer wrapped in prose and a code fence, and reports limitations', () => {
    const fence = '```';
    const wrapped = `Aquí tienes el resultado:\n\n${fence}json\n${result(campaignId, taskId, [cand(1)])}\n${fence}\n\nAvisame si querés más.`;
    const pv = previewResult(wrapped, ctx(campaignId));
    expect(pv.fatal).toEqual([]);
    expect(pv.counts.create).toBe(1);
    expect(pv.globalWarnings.join(' ')).toMatch(/NO pudo leer publicaciones/);
    expect(pv.globalWarnings.join(' ')).toMatch(/Se pidieron 3 candidatos y llegaron 1/);
  });

  it('a photo is kept only with an accessible source', () => {
    const text = result(campaignId, taskId, [
      cand(1, { photo_url: 'https://img.example/a.jpg', photo_source: 'https://example.com/team' }),
      cand(2, { photo_url: 'https://img.example/b.jpg' }),
    ]);
    const pv = previewResult(text, ctx(campaignId));
    expect(pv.candidates[1]!.warnings.join(' ')).toMatch(/Foto sin fuente/);
    confirmImport(text, ctx(campaignId));
    expect(fichas()[0]!.research!.photoUrl).toBe('https://img.example/a.jpg');
    expect(fichas()[1]!.research!.photoUrl).toBeUndefined();
  });
});

describe('format errors (concrete, nothing saved)', () => {
  it('invalid JSON reports line and column', () => {
    const bad = '{\n  "format": "x",\n  "candidates": [ {"full_name": "A" "fit_reason": "B"} ]\n}';
    const pv = previewResult(bad, ctx(campaignId));
    expect(pv.canConfirm).toBe(false);
    expect(pv.fatal[0]).toMatch(/No es JSON válido/);
    expect(pv.fatal[0]).toMatch(/línea 3/);
    expect(extractJson('').ok).toBe(false);
    // files saved by some Windows tools start with a byte-order mark
    expect(extractJson('﻿{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('wrong format, unsupported version, unknown campaign and task are fatal', () => {
    const base = JSON.parse(result(campaignId, taskId, [cand(1)]));
    expect(previewResult(JSON.stringify({ ...base, format: 'otra-cosa' }), ctx(campaignId)).fatal[0]).toMatch(
      /format debe ser/,
    );
    expect(previewResult(JSON.stringify({ ...base, format_version: 2 }), ctx(campaignId)).fatal[0]).toMatch(/más nuevo/);
    expect(previewResult(JSON.stringify({ ...base, campaign_id: 'nope' }), ctx(campaignId)).fatal.join(' ')).toMatch(
      /campaign_id "nope" no existe/,
    );
    expect(previewResult(JSON.stringify({ ...base, task_id: 'nope' }), ctx(campaignId)).fatal.join(' ')).toMatch(
      /task_id "nope" no existe/,
    );
    expect(previewResult(JSON.stringify([1, 2]), ctx(campaignId)).fatal[0]).toMatch(/objeto/);
    expect(fichas()).toHaveLength(0);
  });

  it('never reassigns a result to another campaign', () => {
    const other = createCampaign(CAMPAIGN_BL_ID, { name: 'Universidades' });
    const t2 = createResearchTask(other.id, 'x', []);
    const text = result(other.id, t2.id, [cand(1)]);
    const pv = previewResult(text, ctx(campaignId)); // wrong campaign selected
    expect(pv.canConfirm).toBe(false);
    expect(pv.fatal.join(' ')).toMatch(/es de la campaña "Universidades".*No lo reasigno/);
    expect(() => confirmImport(text, ctx(campaignId))).toThrow(/No lo reasigno/);
    expect(getState().prospects).toHaveLength(0);
    const mixed = result(campaignId, t2.id, [cand(1)]); // task of another campaign
    expect(previewResult(mixed, ctx(campaignId)).fatal.join(' ')).toMatch(/pertenece a otra campaña/);
  });

  it('a bad candidate is reported with its path and skipped; the valid ones can still be imported', () => {
    const text = result(campaignId, taskId, [
      cand(1),
      { full_name: 'Sin mensaje', fit_reason: 'x' },
      cand(3, { facts: [{ source_url: 'u' }] }),
    ]);
    const pv = previewResult(text, ctx(campaignId));
    expect(pv.counts).toMatchObject({ create: 1, invalid: 2 });
    expect(pv.candidates[1]!.errors).toEqual(['falta el campo candidates[1].draft_message']);
    expect(pv.candidates[2]!.errors.join(' ')).toMatch(/candidates\[2\]\.facts\[0\]\.text/);
    expect(pv.canConfirm).toBe(true);
    confirmImport(text, ctx(campaignId));
    expect(fichas()).toHaveLength(1);
  });
});

describe('re-import and duplicates', () => {
  it('importing the same result twice creates nothing the second time', () => {
    const text = result(campaignId, taskId, [cand(1), cand(2)]);
    confirmImport(text, ctx(campaignId));
    const pv = previewResult(text, ctx(campaignId));
    expect(pv.previouslyImported).not.toBeNull();
    expect(pv.counts).toMatchObject({ create: 0, unchanged: 2 });
    expect(pv.canConfirm).toBe(false);
    expect(() => confirmImport(text, ctx(campaignId))).toThrow(/nada nuevo/);
    expect(fichas()).toHaveLength(2);
    expect(getState().people).toHaveLength(2);
  });

  it('candidates without URL are not duplicated on re-import (stable ref); without ref it only warns', () => {
    const noUrl = [cand(1, { linkedin_url: null }), cand(2, { linkedin_url: '' })];
    const text = result(campaignId, taskId, noUrl);
    confirmImport(text, ctx(campaignId));
    expect(previewResult(text, ctx(campaignId)).counts.create).toBe(0);
    expect(fichas()).toHaveLength(2);

    // The same people again, but this time ChatGPT dropped the refs: no stable identity,
    // so they are NOT merged silently; they are flagged as possible matches instead.
    const noRef = noUrl.map((c) => {
      const copy: Record<string, unknown> = { ...c };
      delete copy.ref;
      return copy;
    });
    const pv = previewResult(result(campaignId, taskId, noRef), ctx(campaignId));
    expect(pv.counts.create).toBe(2);
    expect(pv.candidates.every((c) => c.warnings.some((w) => /Posible coincidencia/.test(w)))).toBe(true);
  });

  it('same LinkedIn URL in another campaign is skipped; name+company only warns', () => {
    confirmImport(result(campaignId, taskId, [cand(1)]), ctx(campaignId));
    const other = createCampaign(CAMPAIGN_DATA_AI_ID, { name: 'Datos e IA' });
    const t2 = createResearchTask(other.id, 'x', []);
    const text = result(other.id, t2.id, [
      cand(1, { ref: 'x1', linkedin_url: 'linkedin.com/in/simulada-1' }), // same person, other URL spelling
      cand(7, { ref: 'x2', full_name: 'Persona Simulada 1', company: 'Empresa Simulada 1', linkedin_url: null }),
    ]);
    const pv = previewResult(text, ctx(other.id));
    expect(pv.candidates[0]).toMatchObject({ action: 'duplicate' });
    expect(pv.candidates[0]!.note).toMatch(/Misma URL.*E-commerce España/);
    expect(pv.candidates[1]).toMatchObject({ action: 'create' });
    expect(pv.candidates[1]!.warnings.join(' ')).toMatch(/Posible coincidencia por nombre \+ empresa/);
    confirmImport(text, ctx(other.id));
    expect(fichas(other.id)).toHaveLength(1); // created: not merged, not excluded
  });

  it('repeats inside one result are collapsed', () => {
    const pv = previewResult(result(campaignId, taskId, [cand(1), cand(1)]), ctx(campaignId));
    expect(pv.counts).toMatchObject({ create: 1, duplicate: 1 });
  });
});

describe('edit and approval protection', () => {
  it('a new ChatGPT version enters as a proposal; edited and approved text is untouched', () => {
    confirmImport(result(campaignId, taskId, [cand(1)]), ctx(campaignId));
    const id = fichas()[0]!.id;
    saveMessage(id, 'Mi versión editada.');
    approve(id);
    expect(fichas()[0]!.approval).toMatchObject({ status: 'approved', approvedText: 'Mi versión editada.' });

    const v2 = result(campaignId, taskId, [cand(1, { draft_message: 'Otra versión de ChatGPT.' })]);
    const pv = previewResult(v2, ctx(campaignId));
    expect(pv.candidates[0]).toMatchObject({ action: 'update', messageAction: 'proposal' });
    confirmImport(v2, ctx(campaignId));

    const f = fichas()[0]!;
    expect(f.editedMessage).toBe('Mi versión editada.'); // not overwritten
    expect(f.approval).toMatchObject({ status: 'approved', approvedText: 'Mi versión editada.' }); // kept
    expect(f.messageProposals).toHaveLength(1);
    expect(f.messageProposals![0]).toMatchObject({
      text: 'Otra versión de ChatGPT.',
      status: 'pending',
      source: 'chatgpt_import',
    });
    expect(fichas()).toHaveLength(1);
    // importing that same new version again proposes nothing more
    expect(previewResult(v2, ctx(campaignId)).counts).toMatchObject({ unchanged: 1, update: 0 });
  });

  it('applying a proposal is an explicit choice: replaces the text, invalidates approval, keeps history', () => {
    confirmImport(result(campaignId, taskId, [cand(1)]), ctx(campaignId));
    const id = fichas()[0]!.id;
    approve(id);
    confirmImport(result(campaignId, taskId, [cand(1, { draft_message: 'Nueva propuesta.' })]), ctx(campaignId));
    const proposalId = fichas()[0]!.messageProposals![0]!.id;

    applyMessageProposal(id, proposalId);
    const f = fichas()[0]!;
    expect(f.editedMessage).toBe('Nueva propuesta.');
    expect(f.approval!.status).toBe('pending'); // the approved copy no longer matches
    expect(f.messageProposals![0]!.status).toBe('applied');
    expect(f.messageHistory!.at(-1)).toMatchObject({
      text: 'Hola Persona 1, me gustaría conectar.',
      reason: 'proposal_applied',
      wasApproved: true,
    });
  });

  it('dismissing a proposal changes nothing else; editing invalidates approval and keeps history', () => {
    confirmImport(result(campaignId, taskId, [cand(1)]), ctx(campaignId));
    const id = fichas()[0]!.id;
    confirmImport(result(campaignId, taskId, [cand(1, { draft_message: 'Propuesta B.' })]), ctx(campaignId));
    dismissMessageProposal(id, fichas()[0]!.messageProposals![0]!.id);
    expect(fichas()[0]!.messageProposals![0]!.status).toBe('dismissed');
    expect(fichas()[0]!.editedMessage).toBeNull();

    approve(id);
    saveMessage(id, 'Texto cambiado después de aprobar.');
    expect(fichas()[0]!.approval!.status).toBe('pending');
    expect(fichas()[0]!.messageHistory!.some((h) => h.reason === 'edit' && h.wasApproved)).toBe(true);
    // a dismissed text is not brought back as a new proposal by a re-import
    const again = result(campaignId, taskId, [cand(1, { draft_message: 'Propuesta B.' })]);
    expect(previewResult(again, ctx(campaignId)).counts.update).toBe(0);
  });

  it('approval is refused until the ficha is complete, and a taken URL is refused', () => {
    confirmImport(result(campaignId, taskId, [cand(1), cand(2, { linkedin_url: null })]), ctx(campaignId));
    const [a, b] = fichas();
    expect(essentialGaps(b!, person(b!))).toEqual(['URL de LinkedIn']);
    expect(() => approve(b!.id)).toThrow(/falta URL de LinkedIn/);
    expect(() => setProspectLinkedinUrl(b!.id, 'https://example.com/x')).toThrow(/perfil de LinkedIn/);
    expect(() => setProspectLinkedinUrl(b!.id, person(a!).linkedinUrl)).toThrow(/ya pertenece/);
    setProspectLinkedinUrl(b!.id, 'https://www.linkedin.com/in/completada-2/');
    approve(b!.id);
    expect(fichas()[1]!.approval!.status).toBe('approved');
  });

  it('the character limit is configurable and blocks approval over it', () => {
    confirmImport(result(campaignId, taskId, [cand(1, { draft_message: 'x'.repeat(150) })]), ctx(campaignId));
    setConfiguredLimit(120);
    expect(() => approve(fichas()[0]!.id)).toThrow(/max 100/);
    const warn = previewResult(
      result(campaignId, taskId, [cand(5, { draft_message: 'y'.repeat(130) })]),
      ctx(campaignId),
    ).candidates[0]!.warnings.join(' ');
    expect(warn).toMatch(/límite actual es 100/);
  });
});

describe('persistence and sync', () => {
  it('everything survives a restart (serialized state), approvals included', () => {
    confirmImport(result(campaignId, taskId, [cand(1), cand(2)]), ctx(campaignId));
    const [a] = fichas();
    saveMessage(a!.id, 'Editado.');
    approve(a!.id);
    const snapshot: AppState = JSON.parse(JSON.stringify(getState()));
    replaceState(buildDesktopInitialState()); // "closing" the app
    replaceState(snapshot); // "reopening" it
    const restored = fichas()[0]!;
    expect(restored.approval).toMatchObject({ status: 'approved', approvedText: 'Editado.' });
    expect(restored.messageHistory).toHaveLength(1);
    expect(getState().importHistory).toHaveLength(1);
    expect(getState().researchTasks![0]!.log.at(-1)!.event).toMatch(/Importado de ChatGPT: 2 nuevas/);
    // and the restored state still recognizes the same result as already imported
    const again = result(campaignId, taskId, [cand(1), cand(2)]);
    expect(previewResult(again, ctx(campaignId)).previouslyImported).not.toBeNull();
  });

  it('merging external (connector) changes never resurrects or overwrites local decisions', () => {
    confirmImport(result(campaignId, taskId, [cand(1)]), ctx(campaignId));
    const id = fichas()[0]!.id;
    const stale: AppState = JSON.parse(JSON.stringify(getState())); // the file as it was before
    approve(id);
    saveMessage(id, 'Editado luego.'); // approval invalidated locally
    // the stale copy still says "approved" with the old text, and brings a proposal
    stale.prospects[0]!.approval = { status: 'approved', approvedText: 'Hola Persona 1, me gustaría conectar.', approvedAt: 'old' };
    stale.prospects[0]!.messageProposals = [
      { id: 'ext-1', text: 'Desde el conector', createdAt: 'x', source: 'chatgpt_mcp', status: 'applied' },
    ];
    const merged = mergeExternalChanges(getState(), stale);
    const f = merged.prospects.find((p) => p.id === id)!;
    expect(f.approval!.status).toBe('pending'); // not resurrected
    expect(f.editedMessage).toBe('Editado luego.'); // not overwritten
    expect(f.messageProposals).toEqual([expect.objectContaining({ id: 'ext-1', status: 'pending' })]);
    expect(mergeExternalChanges(merged, stale).prospects).toHaveLength(merged.prospects.length); // idempotent
  });
});
