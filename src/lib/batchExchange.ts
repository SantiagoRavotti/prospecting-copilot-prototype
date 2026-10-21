// Batch exchange with the user's ChatGPT (Plus, no API, no MCP required):
//
//   app builds a context package + directive  →  user sends them to their usual
//   ChatGPT conversation  →  ChatGPT returns ONE JSON result  →  user imports it
//   here  →  preview  →  confirm  →  fichas to review, edit and approve.
//
// Everything in this file is pure (no store, no I/O) so it is fully testable:
//   buildContextPackage / buildDirective / buildResultExample  — what goes out
//   extractJson / previewImport                                — what comes back
//   applyImport                                                — what is saved
//
// Honesty rules baked in: sources are kept but NEVER presented as verified by
// the app; example payloads are refused on import; photos need a source;
// an incomplete ficha can be reviewed but not approved.

import { z } from 'zod';
import type {
  Activity,
  AppState,
  Campaign,
  Company,
  CollectedPost,
  ImportRecord,
  Person,
  Prospect,
  ProspectResearch,
  ResearchTask,
} from './types';
import { APP_VERSION } from './appVersion';
import { normalizeLinkedinUrl, normalizeName } from './dedupe';
import { channelLimitFor, dedupeVerdict, effectiveLimit, finalText } from './campaigns';
import { computeScore, normalizeSeniority, priorityForScore } from './scoring';
import { charCount, nowIso, uid } from './utils';

export const CONTEXT_FORMAT = 'prospecting-copilot/research-context';
export const RESULT_FORMAT = 'prospecting-copilot/research-result';
export const FORMAT_VERSION = 1;
export const EXAMPLE_MARK = 'EJEMPLO';
export const MAX_CONTEXT_CONTACTS = 2000;

// ---------------------------------------------------------------------------
// Result schema (what ChatGPT must return)
// ---------------------------------------------------------------------------

const optText = z.string().nullish();

const FactSchema = z.object({ text: z.string().trim().min(1), source_url: optText });
const PostSchema = z.object({ url: z.string().trim().min(1), date: optText, summary: optText });

export const CandidateSchema = z.object({
  ref: optText,
  full_name: z.string().trim().min(1),
  linkedin_url: optText,
  title: optText,
  company: optText,
  location: optText,
  fit_reason: z.string().trim().min(1),
  facts: z.array(FactSchema).default([]),
  posts: z.array(PostSchema).default([]),
  inferences: z.array(z.string()).default([]),
  draft_message: z.string().trim().min(1),
  photo_url: optText,
  photo_source: optText,
});
export type ResultCandidate = z.infer<typeof CandidateSchema>;

const HeaderSchema = z.object({
  format: z.string(),
  format_version: z.number(),
  campaign_id: z.string().min(1),
  task_id: z.string().min(1),
  researched_at: optText,
  linkedin_posts_accessible: z.boolean().nullish(),
  limitations: z.array(z.string()).default([]),
  candidates: z.array(z.unknown()),
});

/** JSON Schema handed to ChatGPT (kept next to the zod schema; a test keeps them aligned). */
export const RESULT_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Prospecting Copilot — research result v1',
  type: 'object',
  required: ['format', 'format_version', 'campaign_id', 'task_id', 'linkedin_posts_accessible', 'limitations', 'candidates'],
  properties: {
    format: { const: RESULT_FORMAT },
    format_version: { const: FORMAT_VERSION },
    campaign_id: { type: 'string', description: 'Copy it from the context package.' },
    task_id: { type: 'string', description: 'Copy it from the context package.' },
    researched_at: { type: 'string', description: 'ISO date-time when you researched.' },
    linkedin_posts_accessible: {
      type: ['boolean', 'null'],
      description: 'true only if you could actually read LinkedIn posts; false if you could not; null if you do not know.',
    },
    limitations: {
      type: 'array',
      items: { type: 'string' },
      description: 'What you could not do or check (posts unreadable, fewer valid candidates than requested, ...). [] if none.',
    },
    candidates: {
      type: 'array',
      description: 'Only real people you actually found. Return fewer than requested rather than inventing any.',
      items: {
        type: 'object',
        required: ['full_name', 'fit_reason', 'draft_message'],
        properties: {
          ref: { type: 'string', description: 'Stable id for this person inside this result (e.g. "c1"). Re-sending the same result must keep the same refs.' },
          full_name: { type: 'string' },
          linkedin_url: { type: ['string', 'null'], description: 'Profile URL only if you found it; otherwise null. Never guess.' },
          title: { type: ['string', 'null'] },
          company: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          fit_reason: { type: 'string', description: 'Why this person fits THIS campaign.' },
          facts: {
            type: 'array',
            description: 'Verifiable facts. Each with the URL where you read it.',
            items: {
              type: 'object',
              required: ['text'],
              properties: { text: { type: 'string' }, source_url: { type: ['string', 'null'] } },
            },
          },
          posts: {
            type: 'array',
            description: 'Posts you actually opened. Empty if you could not read any.',
            items: {
              type: 'object',
              required: ['url'],
              properties: { url: { type: 'string' }, date: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] } },
            },
          },
          inferences: { type: 'array', items: { type: 'string' }, description: 'Your guesses, written as guesses.' },
          draft_message: { type: 'string', description: 'Connection-request text, in the campaign language and style, within the character limit.' },
          photo_url: { type: ['string', 'null'], description: 'Only if a public source exists.' },
          photo_source: { type: ['string', 'null'], description: 'URL of the page where the photo was found. Required to keep the photo.' },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Outgoing: context package, directive, example
// ---------------------------------------------------------------------------

export interface ContextContact {
  name: string;
  company: string;
  title: string;
  linkedin_url: string;
  campaign: string | null;
  status: string;
}

export interface ContextPackage {
  format: typeof CONTEXT_FORMAT;
  format_version: number;
  generated_at: string;
  app_version: string;
  campaign_id: string;
  task_id: string;
  workspace: { id: string; name: string };
  sender: Record<string, unknown>;
  campaign: Record<string, unknown>;
  request: { instruction_from_user: string; requested_count: number };
  style: Record<string, unknown>;
  existing_contacts: ContextContact[];
  existing_contacts_truncated: boolean;
  previous_campaigns: Record<string, unknown>[];
  rules: string[];
  result_format: { name: string; version: number; json_schema: unknown; example: unknown };
}

export function researchRules(campaign: Campaign, charLimit: number): string[] {
  return [
    'Investigá de verdad con tus propias herramientas de búsqueda. No completes registros ficticios para llegar a la cantidad pedida: devolvé menos candidatos si no encontrás más.',
    'No inventes publicaciones, fotos, cargos, empresas, URLs ni intereses personales. Lo desconocido se deja vacío o null.',
    'Poné la URL de LinkedIn solo si la encontraste. Si no podés leer publicaciones de LinkedIn, ponelo en linkedin_posts_accessible=false y explicalo en limitations.',
    'Cada hecho lleva la URL donde lo leíste. Lo que dedujiste va en inferences, escrito como suposición.',
    'No propongas a nadie de existing_contacts (ya están en el CRM, sea cual sea su estado). Respetá las exclusiones de la campaña.',
    `Redactá draft_message en ${campaign.language === 'es' ? 'español' : 'inglés'}, con el estilo y las instrucciones de "style", de hasta ${charLimit} caracteres, como solicitud de conexión (sin vender de inmediato).`,
    'Respondé con UN solo bloque JSON que cumpla result_format.json_schema, copiando campaign_id y task_id tal cual. No agregues texto fuera del bloque.',
  ];
}

export function buildResultExample(campaignId: string, taskId: string): Record<string, unknown> {
  return {
    format: RESULT_FORMAT,
    format_version: FORMAT_VERSION,
    campaign_id: campaignId,
    task_id: taskId,
    researched_at: '2026-01-01T00:00:00Z',
    linkedin_posts_accessible: false,
    limitations: ['Ejemplo de formato: reemplazar por lo que realmente no pudiste hacer.'],
    candidates: [
      {
        ref: 'ejemplo-1',
        full_name: `${EXAMPLE_MARK} (no copiar): Nombre Apellido`,
        linkedin_url: 'https://www.linkedin.com/in/ejemplo-no-real/',
        title: 'Cargo de ejemplo',
        company: 'Empresa de ejemplo',
        location: 'Ciudad, País',
        fit_reason: 'Motivo de encaje con ESTA campaña.',
        facts: [{ text: 'Hecho verificable de ejemplo.', source_url: 'https://example.com/fuente' }],
        posts: [],
        inferences: ['Suposición identificada como tal.'],
        draft_message: 'Hola Nombre, texto de la solicitud de conexión.',
        photo_url: null,
        photo_source: null,
      },
    ],
  };
}

function contactStatus(p: Prospect): string {
  if (p.approval?.status === 'discarded') return 'discarded';
  if (p.approval?.status === 'approved') return 'approved';
  return p.status;
}

export function buildContextPackage(
  state: AppState,
  campaignId: string,
  taskId: string,
  now: string = nowIso(),
): ContextPackage {
  const campaign = (state.campaigns ?? []).find((c) => c.id === campaignId);
  const task = (state.researchTasks ?? []).find((t) => t.id === taskId && t.campaignId === campaignId);
  if (!campaign) throw new Error('Campaña no encontrada.');
  if (!task) throw new Error('Tarea de investigación no encontrada para esta campaña.');
  const ws = state.workspaces.find((w) => w.id === campaign.workspaceId);
  if (!ws) throw new Error('Espacio de trabajo no encontrado.');
  const limit = effectiveLimit(channelLimitFor(state));

  // The same LinkedIn account serves every workspace, so dedupe context is global.
  const campaignName = (id?: string) => (state.campaigns ?? []).find((c) => c.id === id)?.name ?? null;
  const inProspect = new Set(state.prospects.map((p) => p.personId));
  const contacts: ContextContact[] = [
    ...state.prospects.map((p) => {
      const person = state.people.find((x) => x.id === p.personId);
      return {
        name: person?.fullName ?? '',
        company: state.companies.find((c) => c.id === p.companyId)?.name ?? '',
        title: person?.title ?? '',
        linkedin_url: person?.linkedinUrl ?? '',
        campaign: campaignName(p.campaignId),
        status: contactStatus(p),
      };
    }),
    ...state.people
      .filter((x) => !inProspect.has(x.id))
      .map((x) => ({
        name: x.fullName,
        company: state.companies.find((c) => c.id === x.companyId)?.name ?? '',
        title: x.title,
        linkedin_url: x.linkedinUrl,
        campaign: null,
        status: 'known',
      })),
  ];

  const previous = (state.campaigns ?? [])
    .filter((c) => c.workspaceId === campaign.workspaceId && c.id !== campaign.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((c) => {
      const fichas = state.prospects.filter((p) => p.campaignId === c.id);
      return {
        name: c.name,
        objective: c.objective,
        audience: c.audience,
        search_criteria: c.searchCriteria,
        language: c.language,
        counts: {
          candidates: fichas.length,
          approved: fichas.filter((p) => p.approval?.status === 'approved').length,
          discarded: fichas.filter((p) => p.approval?.status === 'discarded').length,
        },
        approved_message_examples: fichas
          .filter((p) => p.approval?.status === 'approved' && p.approval.approvedText)
          .slice(0, 3)
          .map((p) => p.approval!.approvedText as string),
      };
    });

  const approvedExamples = state.prospects
    .filter((p) => p.approval?.status === 'approved' && p.approval.approvedText)
    .filter((p) => state.campaigns?.find((c) => c.id === p.campaignId)?.workspaceId === campaign.workspaceId)
    .sort((a, b) => (b.approval!.approvedAt ?? '').localeCompare(a.approval!.approvedAt ?? ''))
    .slice(0, 5)
    .map((p) => p.approval!.approvedText as string);

  const example = buildResultExample(campaign.id, task.id);
  return {
    format: CONTEXT_FORMAT,
    format_version: FORMAT_VERSION,
    generated_at: now,
    app_version: APP_VERSION,
    campaign_id: campaign.id,
    task_id: task.id,
    workspace: { id: ws.id, name: ws.name },
    sender: {
      name: ws.senderName,
      title: ws.senderTitle,
      company: ws.senderCompany,
      bio: ws.senderBio,
      value_proposition: ws.valueProposition,
      services: ws.services,
    },
    campaign: {
      name: campaign.name,
      objective: campaign.objective,
      audience: campaign.audience,
      search_criteria: campaign.searchCriteria,
      exclusions: campaign.exclusions,
      language: campaign.language,
      tone: campaign.tone,
      target_count: campaign.targetCount,
    },
    request: { instruction_from_user: task.directive, requested_count: campaign.targetCount },
    style: {
      language: campaign.language,
      tone: campaign.tone,
      guidelines: campaign.messageGuidelines,
      saved_examples: campaign.styleExamples ?? [],
      approved_message_examples: approvedExamples,
      character_limit: limit,
    },
    existing_contacts: contacts.slice(0, MAX_CONTEXT_CONTACTS),
    existing_contacts_truncated: contacts.length > MAX_CONTEXT_CONTACTS,
    previous_campaigns: previous,
    rules: researchRules(campaign, limit),
    result_format: {
      name: RESULT_FORMAT,
      version: FORMAT_VERSION,
      json_schema: RESULT_JSON_SCHEMA,
      example,
    },
  };
}

export function contextFileName(campaign: Campaign, task: ResearchTask): string {
  const slug = normalizeName(campaign.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'campana';
  return `contexto-${slug}-${task.id.slice(0, 8)}.json`;
}

/** The complete directive the user copies into their ChatGPT conversation. */
export function buildDirective(ctx: ContextPackage, fileName: string): string {
  const c = ctx.campaign as { name: string; objective: string; audience: string; search_criteria: string; exclusions: string[]; target_count: number };
  const instruction = ctx.request.instruction_from_user.trim();
  return [
    `# Prospecting Copilot — investigación de campaña "${c.name}"`,
    '',
    `Tarea ${ctx.task_id} · campaña ${ctx.campaign_id} · formato ${RESULT_FORMAT} v${ctx.format_version}`,
    '',
    `Adjunto el archivo "${fileName}" con todo el contexto (remitente, campaña, estilo, contactos existentes, campañas anteriores, reglas y esquema). Leelo completo antes de empezar. Si no podés abrir adjuntos, avisame en vez de inventar el contexto.`,
    '',
    '## Qué necesito',
    `Investigá hasta ${c.target_count} personas reales para esta campaña.`,
    c.objective && `- Objetivo: ${c.objective}`,
    c.audience && `- Audiencia: ${c.audience}`,
    c.search_criteria && `- Criterios: ${c.search_criteria}`,
    c.exclusions.length > 0 && `- Exclusiones: ${c.exclusions.join('; ')}`,
    instruction && `- Indicación para este lote: ${instruction}`,
    '',
    '## Reglas (obligatorias)',
    ...ctx.rules.map((r) => `- ${r}`),
    '',
    '## Formato de respuesta',
    `Un único bloque JSON con format="${RESULT_FORMAT}", format_version=${ctx.format_version}, campaign_id="${ctx.campaign_id}" y task_id="${ctx.task_id}". Esquema exacto (JSON Schema):`,
    '```json',
    JSON.stringify(RESULT_JSON_SCHEMA, null, 2),
    '```',
    'Ejemplo del formato (los datos son inventados a propósito; NO los copies):',
    '```json',
    JSON.stringify(ctx.result_format.example, null, 2),
    '```',
  ]
    .filter((l): l is string => typeof l === 'string')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Incoming: JSON extraction and friendly validation
// ---------------------------------------------------------------------------

export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = text.replace(new RegExp('^' + String.fromCharCode(0xfeff)), '').trim();
  if (!raw) return { ok: false, error: 'No hay texto para importar. Pegá la respuesta de ChatGPT o elegí el archivo JSON.' };
  const attempts: string[] = [raw];
  if (!raw.startsWith('{')) {
    const blocks = [...raw.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map((m) => m[1]!.trim());
    attempts.push(...blocks.sort((a, b) => b.length - a.length));
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) attempts.push(raw.slice(first, last + 1));
  }
  let firstError = '';
  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (e) {
      if (!firstError) firstError = describeJsonError(candidate, e);
    }
  }
  return { ok: false, error: firstError };
}

function describeJsonError(text: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /position (\d+)/.exec(msg);
  if (!m) return `No es JSON válido: ${msg}`;
  const pos = Number(m[1]);
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  const snippet = text.slice(Math.max(0, pos - 25), pos + 25).replace(/\s+/g, ' ');
  return `No es JSON válido: ${msg} (línea ${line}, columna ${col}, cerca de «${snippet}»).`;
}

function issueText(issue: z.ZodIssue, root: string): string {
  const path = [root, ...issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`))].join('').replace(/^\./, '');
  const label = path.replace(/^\[/, '[');
  if (issue.code === 'invalid_type') {
    return issue.received === 'undefined'
      ? `falta el campo ${label}`
      : `${label} debe ser ${issue.expected} (recibido ${issue.received})`;
  }
  if (issue.code === 'too_small') return `${label} está vacío`;
  return `${label}: ${issue.message}`;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type CandidateAction = 'create' | 'update' | 'unchanged' | 'duplicate' | 'invalid';

export interface CandidatePreview {
  index: number;
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
  action: CandidateAction;
  /** What happens to the message of an already imported ficha. */
  messageAction?: 'proposal' | 'same';
  existingProspectId?: string;
  importKey?: string;
  warnings: string[];
  errors: string[];
  note?: string;
  data?: ResultCandidate;
}

export interface ImportPreview {
  /** True when there is something to confirm. */
  canConfirm: boolean;
  /** Errors that block the whole result (format, version, campaign, task, JSON). */
  fatal: string[];
  globalWarnings: string[];
  campaignId: string | null;
  taskId: string | null;
  fingerprint: string;
  previouslyImported: ImportRecord | null;
  postsAccessible: boolean | null;
  limitations: string[];
  candidates: CandidatePreview[];
  counts: { create: number; update: number; unchanged: number; duplicate: number; invalid: number };
  input: 'file' | 'paste';
  fileName?: string;
}

/** Small non-cryptographic hash (cyrb53): identifies "the same result", not a secret. */
export function fingerprintOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function importKeyOf(taskId: string, c: Pick<ResultCandidate, 'ref' | 'linkedin_url' | 'full_name' | 'company'>): string {
  const ref = (c.ref ?? '').trim();
  const url = normalizeLinkedinUrl(c.linkedin_url);
  const body = ref ? `ref:${ref}` : url ? `url:${url}` : `name:${normalizeName(c.full_name)}|${normalizeName(c.company ?? '')}`;
  return `${taskId}#${body}`;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function knownTexts(p: Prospect): Set<string> {
  const known = new Set<string>([squash(finalText(p)), squash(p.originalDraft)]);
  if (p.editedMessage) known.add(squash(p.editedMessage));
  for (const x of p.messageProposals ?? []) known.add(squash(x.text));
  for (const h of p.messageHistory ?? []) known.add(squash(h.text));
  return known;
}

function isLinkedinProfile(url: string): boolean {
  return /^linkedin\.com\/(in|pub)\//.test(normalizeLinkedinUrl(url));
}

export function buildResearch(
  c: ResultCandidate,
  meta: { importId?: string; importKey: string; postsAccessible: boolean | null; limitations: string[] },
): ProspectResearch {
  const facts = c.facts.map((f) => ({ text: f.text.trim(), ...(f.source_url?.trim() ? { sourceUrl: f.source_url.trim() } : {}) }));
  const posts: CollectedPost[] = c.posts.map((p) => ({
    url: p.url.trim(),
    ...(p.date?.trim() ? { date: p.date.trim() } : {}),
    ...(p.summary?.trim() ? { title: p.summary.trim().slice(0, 140), excerpt: p.summary.trim() } : {}),
    source: /linkedin\.com/i.test(p.url) ? ('linkedin' as const) : ('web' as const),
  }));
  const photoKept = Boolean(c.photo_url?.trim() && c.photo_source?.trim());
  return {
    origin: 'chatgpt_import',
    importId: meta.importId,
    importKey: meta.importKey,
    location: c.location?.trim() || undefined,
    facts,
    verifiedFacts: facts.map((f) => f.text),
    inferences: c.inferences.map((x) => x.trim()).filter(Boolean),
    posts,
    activityChecked: posts.length > 0,
    suggestedOpener: '',
    photoUrl: photoKept ? c.photo_url!.trim() : undefined,
    photoSource: photoKept ? c.photo_source!.trim() : undefined,
    postsAccessible: meta.postsAccessible,
    limitations: meta.limitations,
    sources: [
      ...new Set([c.linkedin_url?.trim(), ...facts.map((f) => f.sourceUrl), ...posts.map((p) => p.url)].filter((x): x is string => Boolean(x))),
    ],
  };
}

function sameResearch(a: ProspectResearch | undefined, b: ProspectResearch): boolean {
  if (!a) return false;
  const pick = (r: ProspectResearch) =>
    JSON.stringify({ f: r.facts ?? [], i: r.inferences, p: r.posts, l: r.location ?? '', ph: r.photoUrl ?? '', pa: r.postsAccessible ?? null });
  return pick(a) === pick(b);
}

export interface PreviewContext {
  campaignId: string;
  input: 'file' | 'paste';
  fileName?: string;
}

export function previewImport(state: AppState, rawText: string, ctx: PreviewContext): ImportPreview {
  const empty = (fatal: string[]): ImportPreview => ({
    canConfirm: false,
    fatal,
    globalWarnings: [],
    campaignId: null,
    taskId: null,
    fingerprint: '',
    previouslyImported: null,
    postsAccessible: null,
    limitations: [],
    candidates: [],
    counts: { create: 0, update: 0, unchanged: 0, duplicate: 0, invalid: 0 },
    input: ctx.input,
    fileName: ctx.fileName,
  });

  const parsed = extractJson(rawText);
  if (!parsed.ok) return empty([parsed.error]);
  if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return empty(['El JSON debe ser un objeto con format, campaign_id, task_id y candidates (no una lista suelta).']);
  }
  const header = HeaderSchema.safeParse(parsed.value);
  if (!header.success) return empty(header.error.issues.map((i) => issueText(i, '')));
  const h = header.data;

  const fatal: string[] = [];
  if (h.format !== RESULT_FORMAT) {
    fatal.push(`format debe ser "${RESULT_FORMAT}" (recibido "${h.format}"). Parece otro tipo de archivo.`);
  }
  if (h.format_version !== FORMAT_VERSION) {
    fatal.push(
      h.format_version > FORMAT_VERSION
        ? `format_version ${h.format_version} es más nuevo de lo que esta app entiende (soporta ${FORMAT_VERSION}). Actualizá la app.`
        : `format_version ${h.format_version} ya no es compatible (esta app usa ${FORMAT_VERSION}).`,
    );
  }

  const campaign = (state.campaigns ?? []).find((c) => c.id === h.campaign_id);
  const selected = (state.campaigns ?? []).find((c) => c.id === ctx.campaignId);
  if (!campaign) {
    fatal.push(`campaign_id "${h.campaign_id}" no existe en esta app. No se puede asignar a ninguna campaña.`);
  } else if (campaign.id !== ctx.campaignId) {
    fatal.push(
      `Este resultado es de la campaña "${campaign.name}", pero tenés seleccionada "${selected?.name ?? '—'}". No lo reasigno: seleccioná "${campaign.name}" para importarlo.`,
    );
  }
  const task = (state.researchTasks ?? []).find((t) => t.id === h.task_id);
  if (!task) {
    fatal.push(`task_id "${h.task_id}" no existe en esta app. Importá solo resultados de una investigación preparada aquí.`);
  } else if (campaign && task.campaignId !== campaign.id) {
    fatal.push(`task_id "${h.task_id}" pertenece a otra campaña, no a "${campaign.name}".`);
  }
  if (h.candidates.length === 0) fatal.push('El resultado no contiene candidatos (candidates está vacío). Revisá "limitations" en la respuesta de ChatGPT.');

  const fingerprint = fingerprintOf(`${h.task_id}\n${JSON.stringify(h.candidates)}`);
  const previouslyImported =
    (state.importHistory ?? []).find((r) => r.taskId === h.task_id && r.fingerprint === fingerprint) ?? null;
  const postsAccessible = h.linkedin_posts_accessible ?? null;

  const base = empty(fatal);
  base.campaignId = campaign?.id ?? null;
  base.taskId = h.task_id;
  base.fingerprint = fingerprint;
  base.previouslyImported = previouslyImported;
  base.postsAccessible = postsAccessible;
  base.limitations = h.limitations;
  if (fatal.length > 0 || !campaign || !task) return base;

  const limit = effectiveLimit(channelLimitFor(state));
  const globalWarnings: string[] = [];
  if (previouslyImported) {
    globalWarnings.push(
      `Este mismo resultado ya se importó el ${previouslyImported.at.slice(0, 16).replace('T', ' ')} (${previouslyImported.created} fichas nuevas). Volver a importarlo no duplica nada.`,
    );
  }
  if (postsAccessible === null) globalWarnings.push('ChatGPT no indicó si pudo leer publicaciones de LinkedIn (linkedin_posts_accessible).');
  if (postsAccessible === false) globalWarnings.push('ChatGPT indicó que NO pudo leer publicaciones de LinkedIn: las fichas no tendrán publicaciones consultadas.');
  for (const l of h.limitations) globalWarnings.push(`Limitación informada por ChatGPT: ${l}`);
  if (h.candidates.length < campaign.targetCount) {
    globalWarnings.push(`Se pidieron ${campaign.targetCount} candidatos y llegaron ${h.candidates.length}.`);
  } else if (h.candidates.length > campaign.targetCount) {
    globalWarnings.push(`Se pidieron ${campaign.targetCount} candidatos y llegaron ${h.candidates.length}.`);
  }

  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const seenNameCompany = new Map<string, string>();
  const candidates: CandidatePreview[] = h.candidates.map((raw, index) => {
    const shown = (raw as { full_name?: unknown })?.full_name;
    const item: CandidatePreview = {
      index,
      name: typeof shown === 'string' ? shown : `(candidato ${index + 1})`,
      company: '',
      title: '',
      linkedinUrl: '',
      action: 'invalid',
      warnings: [],
      errors: [],
    };
    const r = CandidateSchema.safeParse(raw);
    if (!r.success) {
      item.errors = r.error.issues.map((i) => issueText(i, `candidates[${index}]`));
      return item;
    }
    const c = r.data;
    item.name = c.full_name.trim();
    item.company = c.company?.trim() ?? '';
    item.title = c.title?.trim() ?? '';
    item.linkedinUrl = c.linkedin_url?.trim() ?? '';
    item.data = c;

    if (c.full_name.includes(EXAMPLE_MARK) || (c.ref ?? '').startsWith('ejemplo-')) {
      item.errors.push('Es el candidato de EJEMPLO del esquema, no una investigación. ChatGPT debe reemplazarlo por personas reales.');
      item.action = 'invalid';
      return item;
    }

    const key = importKeyOf(task.id, c);
    item.importKey = key;
    const url = normalizeLinkedinUrl(c.linkedin_url);
    if (seenKeys.has(key) || (url && seenUrls.has(url))) {
      item.action = 'duplicate';
      item.note = 'Repetido dentro del mismo resultado; se usa la primera aparición.';
      return item;
    }
    seenKeys.add(key);
    if (url) seenUrls.add(url);

    // Warnings that apply to any non-empty candidate.
    if (!url) item.warnings.push('Sin URL de LinkedIn: se puede revisar, pero no aprobar hasta completarla.');
    else if (!isLinkedinProfile(c.linkedin_url!)) item.warnings.push('La URL no parece un perfil de LinkedIn (linkedin.com/in/…).');
    if (c.facts.length === 0) item.warnings.push('Sin hechos con fuente.');
    else if (c.facts.some((f) => !f.source_url?.trim())) item.warnings.push(`${c.facts.filter((f) => !f.source_url?.trim()).length} hecho(s) sin fuente.`);
    if (!item.title || !item.company) item.warnings.push('Falta cargo o empresa.');
    if (c.photo_url?.trim() && !c.photo_source?.trim()) item.warnings.push('Foto sin fuente accesible: no se guardará.');
    if (postsAccessible === false && c.posts.length > 0) item.warnings.push('ChatGPT dijo que no podía leer publicaciones, pero incluye publicaciones: revisalas con cuidado.');
    const chars = charCount(c.draft_message);
    if (chars > limit) item.warnings.push(`El mensaje tiene ${chars} caracteres y el límite actual es ${limit}: habrá que acortarlo para aprobarlo.`);

    // Identity: same task + same candidate → a re-import of an existing ficha.
    const match = state.prospects.find((p) => p.campaignId === campaign.id && p.research?.importKey === key);
    if (match) {
      item.existingProspectId = match.id;
      const research = buildResearch(c, { importKey: key, postsAccessible, limitations: h.limitations });
      const sameMsg = knownTexts(match).has(squash(c.draft_message));
      const sameRes = sameResearch(match.research, research);
      item.messageAction = sameMsg ? 'same' : 'proposal';
      item.action = sameMsg && sameRes ? 'unchanged' : 'update';
      item.note = [
        !sameMsg && 'mensaje nuevo: entra como propuesta, no reemplaza el actual',
        !sameRes && 'investigación actualizada',
        sameMsg && sameRes && 'ya estaba importada, sin cambios',
      ]
        .filter(Boolean)
        .join('; ');
      return item;
    }

    const verdict = dedupeVerdict(state, { fullName: c.full_name, companyName: c.company ?? '', linkedinUrl: c.linkedin_url });
    if (verdict.hardDuplicate) {
      const person = state.people.find((x) => x.id === verdict.matchedPersonId);
      const prospect = state.prospects.find((p) => p.personId === person?.id);
      const where = prospect?.campaignId
        ? `en la campaña "${state.campaigns?.find((x) => x.id === prospect.campaignId)?.name ?? '—'}"`
        : 'en el CRM';
      item.action = 'duplicate';
      item.note = `Misma URL de LinkedIn que ${person?.fullName ?? 'una persona existente'} ${where}. No se importa.`;
      return item;
    }
    const nc = `${normalizeName(c.full_name)}|${normalizeName(c.company ?? '')}`;
    if (verdict.possibleDuplicate) {
      const person = state.people.find((x) => x.id === verdict.matchedPersonId);
      item.warnings.push(`Posible coincidencia por nombre + empresa con ${person?.fullName ?? 'una persona existente'}. No se fusiona ni se excluye: decidí al revisar.`);
    } else if (seenNameCompany.has(nc)) {
      item.warnings.push(`Mismo nombre y empresa que "${seenNameCompany.get(nc)}" en este mismo resultado. Se importan ambos.`);
    }
    seenNameCompany.set(nc, item.name);
    item.action = 'create';
    return item;
  });

  const counts = { create: 0, update: 0, unchanged: 0, duplicate: 0, invalid: 0 };
  for (const c of candidates) counts[c.action] += 1;
  return {
    ...base,
    fatal: [],
    globalWarnings,
    candidates,
    counts,
    canConfirm: counts.create + counts.update > 0,
  };
}

// ---------------------------------------------------------------------------
// Apply (pure): preview + state → new state + import record
// ---------------------------------------------------------------------------

export function applyImport(
  prev: AppState,
  preview: ImportPreview,
  now: string = nowIso(),
): { state: AppState; record: ImportRecord } {
  if (preview.fatal.length > 0 || !preview.campaignId || !preview.taskId) throw new Error('El resultado tiene errores que bloquean la importación.');
  const campaign = (prev.campaigns ?? []).find((c) => c.id === preview.campaignId);
  const workspace = prev.workspaces.find((w) => w.id === campaign?.workspaceId);
  if (!campaign || !workspace) throw new Error('Campaña no encontrada.');

  const importId = uid();
  const companies: Company[] = [];
  const people: Person[] = [];
  const created: Prospect[] = [];
  const activities: Activity[] = [];
  const updates = new Map<string, (p: Prospect) => Prospect>();
  const prospectIds: string[] = [];

  for (const it of preview.candidates) {
    const c = it.data;
    if (!c || !it.importKey) continue;
    const research = buildResearch(c, {
      importId,
      importKey: it.importKey,
      postsAccessible: preview.postsAccessible,
      limitations: preview.limitations,
    });

    if (it.action === 'update' && it.existingProspectId) {
      prospectIds.push(it.existingProspectId);
      updates.set(it.existingProspectId, (p) => {
        const proposals = [...(p.messageProposals ?? [])];
        if (it.messageAction === 'proposal') {
          proposals.push({ id: uid(), text: c.draft_message.trim(), createdAt: now, source: 'chatgpt_import', importId, status: 'pending' });
        }
        return {
          ...p,
          research: { ...research, importId: p.research?.importId ?? importId },
          messageProposals: proposals,
          lastActivityAt: now,
        };
      });
      continue;
    }
    if (it.action !== 'create') continue;

    const companyName = it.company || 'Empresa no indicada';
    let company = [...prev.companies, ...companies].find((x) => normalizeName(x.name) === normalizeName(companyName));
    const loc = (c.location ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!company) {
      company = {
        id: uid(), name: companyName, website: '', industry: '', city: loc.length > 1 ? loc[0]! : (loc[0] ?? ''),
        country: loc.length > 1 ? loc[loc.length - 1]! : '', size: '', type: '', description: '',
        relevantInitiatives: [], commercialTrigger: '', score: 0, notes: '', isDemo: false,
      };
      companies.push(company);
    }
    const parts = c.full_name.trim().split(/\s+/);
    const person: Person = {
      id: uid(), fullName: c.full_name.trim(), firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '),
      title: it.title, companyId: company.id, city: loc.length > 1 ? loc[0]! : (loc[0] ?? ''),
      country: loc.length > 1 ? loc[loc.length - 1]! : '', linkedinUrl: it.linkedinUrl,
      seniority: normalizeSeniority(it.title), functionalArea: '', professionalSummary: c.fit_reason.trim(),
      careerSummary: '', researchConfidence: research.posts.length > 0 ? 'high' : research.facts?.some((f) => f.sourceUrl) ? 'medium' : 'low',
      sourceReferences: research.sources, isDemo: false,
    };
    people.push(person);
    const { score, breakdown } = computeScore(person, company, workspace);
    const soft = it.warnings.find((w) => w.startsWith('Posible coincidencia'));
    const prospect: Prospect = {
      id: uid(), workspaceId: campaign.workspaceId, personId: person.id, companyId: company.id,
      status: 'ready_for_review', priority: priorityForScore(score), score, scoreBreakdown: breakdown,
      fitReason: c.fit_reason.trim(), timingReason: '', outreachAngle: '', recommendedService: '',
      patternId: 'chatgpt_import', originalDraft: c.draft_message.trim(), editedMessage: null, finalMessage: null,
      notes: soft ? `⚠ ${soft}` : '', createdAt: now, reviewedAt: null, editedAt: null, sentAt: null,
      lastActivityAt: now, outcome: null, isDemo: false, campaignId: campaign.id,
      approval: { status: 'pending', approvedText: null, approvedAt: null },
      research, messageProposals: [], messageHistory: [],
    };
    created.push(prospect);
    prospectIds.push(prospect.id);
    activities.push({
      id: uid(), prospectId: prospect.id, type: 'imported', previousStatus: null, newStatus: 'ready_for_review',
      notes: 'Investigación importada de ChatGPT (fuentes aportadas por ChatGPT; la app no las verificó).', createdAt: now,
    });
  }

  const counts = preview.counts;
  const record: ImportRecord = {
    id: importId, at: now, taskId: preview.taskId, campaignId: preview.campaignId,
    fingerprint: preview.fingerprint, input: preview.input, fileName: preview.fileName,
    created: counts.create, updated: counts.update, unchanged: counts.unchanged,
    skippedDuplicates: counts.duplicate, invalid: counts.invalid,
    warnings: preview.candidates.reduce((n, x) => n + x.warnings.length, 0) + preview.globalWarnings.length,
    prospectIds,
  };

  const summary = `Importado de ChatGPT: ${counts.create} nuevas, ${counts.update} actualizadas, ${counts.unchanged} sin cambios, ${counts.duplicate} duplicadas, ${counts.invalid} con errores.`;
  const state: AppState = {
    ...prev,
    companies: [...prev.companies, ...companies],
    people: [...prev.people, ...people],
    prospects: [...prev.prospects.map((p) => (updates.has(p.id) ? updates.get(p.id)!(p) : p)), ...created],
    activities: [...prev.activities, ...activities],
    researchTasks: (prev.researchTasks ?? []).map((t) =>
      t.id === preview.taskId
        ? { ...t, status: 'proposals_received', updatedAt: now, log: [...t.log, { at: now, event: summary }] }
        : t,
    ),
    importHistory: [...(prev.importHistory ?? []), record],
  };
  return { state, record };
}
