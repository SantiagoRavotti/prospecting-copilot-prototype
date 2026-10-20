// CRM tool handlers shared by the MCP server (ChatGPT) and local harnesses.
// They operate on the persisted state file (the CRM source of truth on this
// machine) and notify the renderer so fichas appear immediately in the app.

const crypto = require('node:crypto');
const storeFile = require('./storeFile.cjs');

let onChange = () => {};
function setChangeListener(fn) {
  onChange = fn;
}

function readState(dir) {
  const raw = storeFile.readStateSync(dir);
  if (!raw) throw new Error('CRM state not initialized yet (open the app once).');
  return JSON.parse(raw);
}
function writeState(dir, state) {
  storeFile.writeState(dir, JSON.stringify(state));
  onChange();
}
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const normUrl = (u) =>
  String(u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split('?')[0];
const normName = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

const str = { type: 'string' };
const strArr = { type: 'array', items: { type: 'string' } };

const TOOLS = [
  {
    name: 'list_campaigns',
    description:
      'List campaigns with objective, audience, search criteria, language, tone, target count, exclusions and message guidelines.',
    schema: { type: 'object', properties: { workspace_id: str }, additionalProperties: false },
    handler: (dir, input) => {
      const s = readState(dir);
      return (s.campaigns || [])
        .filter((c) => !input.workspace_id || c.workspaceId === input.workspace_id)
        .map((c) => ({ ...c, workspace: s.workspaces.find((w) => w.id === c.workspaceId)?.name }));
    },
  },
  {
    name: 'get_research_task',
    description:
      'Get a research task: directive, campaign criteria, sender identity, and profile data already collected from the authenticated browser (with post URLs and dates). Use the task id the app gave you.',
    schema: { type: 'object', properties: { task_id: str }, required: ['task_id'], additionalProperties: false },
    handler: (dir, input) => {
      const s = readState(dir);
      const t = (s.researchTasks || []).find((x) => x.id === input.task_id || x.id.startsWith(input.task_id));
      if (!t) throw new Error('Research task not found');
      const c = (s.campaigns || []).find((x) => x.id === t.campaignId);
      const ws = c && s.workspaces.find((w) => w.id === c.workspaceId);
      return {
        task: t,
        campaign: c,
        sender: ws && {
          name: ws.senderName,
          title: ws.senderTitle,
          company: ws.senderCompany,
          bio: ws.senderBio,
          valueProposition: ws.valueProposition,
          services: ws.services,
        },
      };
    },
  },
  {
    name: 'list_pending_research_tasks',
    description: 'Research tasks created in the app that still need candidates or analysis.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (dir) =>
      (readState(dir).researchTasks || []).filter((t) =>
        ['pending', 'collecting', 'ready_for_analysis'].includes(t.status),
      ),
  },
  {
    name: 'list_contacted_people',
    description:
      'People already researched or contacted on this LinkedIn account (all campaigns), for dedupe and context: name, company, profile url, pipeline status, approval, campaign, final message.',
    schema: {
      type: 'object',
      properties: { campaign_id: str, status: str, limit: { type: 'number' } },
      additionalProperties: false,
    },
    handler: (dir, input) => {
      const s = readState(dir);
      return s.prospects
        .filter(
          (p) =>
            (!input.campaign_id || p.campaignId === input.campaign_id) &&
            (!input.status || p.status === input.status),
        )
        .slice(0, Math.min(input.limit || 100, 300))
        .map((p) => {
          const person = s.people.find((x) => x.id === p.personId);
          return {
            prospect_id: p.id,
            name: person?.fullName,
            title: person?.title,
            company: s.companies.find((c) => c.id === p.companyId)?.name,
            linkedin_url: person?.linkedinUrl,
            status: p.status,
            approval: p.approval?.status,
            campaign_id: p.campaignId,
            final_message: p.editedMessage ?? p.originalDraft,
          };
        });
    },
  },
  {
    name: 'get_conversations',
    description: 'Messages sent and replies received for a prospect (or all recent), plus follow-ups.',
    schema: {
      type: 'object',
      properties: { prospect_id: str, limit: { type: 'number' } },
      additionalProperties: false,
    },
    handler: (dir, input) => {
      const s = readState(dir);
      const conversations = (s.conversations || [])
        .filter((c) => !input.prospect_id || c.prospectId === input.prospect_id)
        .slice(-(input.limit || 50));
      const follow_ups = s.followUps.filter((f) => !input.prospect_id || f.prospectId === input.prospect_id);
      return { conversations, follow_ups };
    },
  },
  {
    name: 'save_proposals',
    description:
      'Save candidate fichas for a research task. Each candidate: full_name, title, company, linkedin_url, why_fit, verified_facts[], inferences[], posts[{url,date,title,source}], activity_checked (true ONLY if you actually consulted recent activity), suggested_opener, draft_message. Never invent posts, photos or facts you could not access. Hard duplicates (same LinkedIn URL) are skipped; name+company matches are kept with a warning.',
    schema: {
      type: 'object',
      properties: {
        task_id: str,
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              full_name: str,
              title: str,
              company: str,
              country: str,
              linkedin_url: str,
              why_fit: str,
              verified_facts: strArr,
              inferences: strArr,
              posts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { url: str, date: str, title: str, source: str },
                  required: ['url'],
                },
              },
              activity_checked: { type: 'boolean' },
              suggested_opener: str,
              draft_message: str,
              photo_url: str,
            },
            required: ['full_name', 'title', 'company', 'why_fit', 'draft_message'],
          },
        },
      },
      required: ['task_id', 'candidates'],
      additionalProperties: false,
    },
    handler: (dir, input) => saveProposals(dir, input),
  },
  {
    name: 'save_draft',
    description:
      'Save a new draft message for an existing prospect (previous versions are kept; any prior approval is invalidated).',
    schema: {
      type: 'object',
      properties: { prospect_id: str, draft_message: str, reason: str },
      required: ['prospect_id', 'draft_message'],
      additionalProperties: false,
    },
    handler: (dir, input) => {
      const s = readState(dir);
      const p = s.prospects.find((x) => x.id === input.prospect_id || x.id.startsWith(input.prospect_id));
      if (!p) throw new Error('Prospect not found');
      p.editedMessage = input.draft_message;
      p.editedAt = now();
      p.lastActivityAt = now();
      if (p.approval && p.approval.status === 'approved') {
        p.approval = { status: 'pending', approvedText: null, approvedAt: null };
      }
      s.activities.push({
        id: uid(),
        prospectId: p.id,
        type: 'message_edited',
        previousStatus: null,
        newStatus: null,
        notes: 'Draft from ChatGPT' + (input.reason ? `: ${input.reason}` : ''),
        createdAt: now(),
      });
      writeState(dir, s);
      return { ok: true, prospect_id: p.id };
    },
  },
  {
    name: 'update_prospect_notes',
    description: 'Append research notes to a prospect.',
    schema: {
      type: 'object',
      properties: { prospect_id: str, notes: str },
      required: ['prospect_id', 'notes'],
      additionalProperties: false,
    },
    handler: (dir, input) => {
      const s = readState(dir);
      const p = s.prospects.find((x) => x.id === input.prospect_id || x.id.startsWith(input.prospect_id));
      if (!p) throw new Error('Prospect not found');
      p.notes = [p.notes, input.notes].filter(Boolean).join('\n');
      p.lastActivityAt = now();
      writeState(dir, s);
      return { ok: true };
    },
  },
];

function saveProposals(dir, input) {
  const s = readState(dir);
  const task = (s.researchTasks || []).find((t) => t.id === input.task_id || t.id.startsWith(input.task_id));
  if (!task) throw new Error('Research task not found');
  const campaign = (s.campaigns || []).find((c) => c.id === task.campaignId);
  if (!campaign) throw new Error('Campaign not found for task');
  const outcome = { created: [], skipped_hard_duplicates: [], possible_duplicates: [] };
  for (const c of input.candidates) {
    const url = normUrl(c.linkedin_url);
    if (url && s.people.some((p) => normUrl(p.linkedinUrl) === url)) {
      outcome.skipped_hard_duplicates.push(c.full_name);
      continue;
    }
    let company = s.companies.find((x) => x.name.toLowerCase() === String(c.company).toLowerCase());
    if (!company) {
      company = {
        id: uid(), name: c.company, website: '', industry: '', city: '', country: c.country || '',
        size: '', type: '', description: '', relevantInitiatives: [], commercialTrigger: '', score: 0,
        notes: '', isDemo: false,
      };
      s.companies.push(company);
    }
    const soft = s.people.some(
      (p) =>
        normName(p.fullName) === normName(c.full_name) &&
        normName(s.companies.find((x) => x.id === p.companyId)?.name) === normName(c.company),
    );
    const parts = String(c.full_name).trim().split(/\s+/);
    const person = {
      id: uid(), fullName: c.full_name, firstName: parts[0] || '', lastName: parts.slice(1).join(' '),
      title: c.title, companyId: company.id, city: '', country: c.country || '', linkedinUrl: c.linkedin_url || '',
      seniority: '', functionalArea: '', professionalSummary: c.why_fit, careerSummary: '',
      researchConfidence: c.activity_checked ? 'high' : 'medium', sourceReferences: ['ChatGPT proposal via MCP'],
      isDemo: false,
    };
    s.people.push(person);
    const t = now();
    const prospect = {
      id: uid(), workspaceId: campaign.workspaceId, personId: person.id, companyId: company.id,
      status: 'ready_for_review', priority: 'networking', score: 50,
      scoreBreakdown: { relevance: 20, seniority: 10, timing: 10, geography: 10 },
      fitReason: c.why_fit, timingReason: '', outreachAngle: c.suggested_opener || '', recommendedService: '',
      patternId: 'chatgpt', originalDraft: c.draft_message, editedMessage: null, finalMessage: null,
      notes: soft ? '⚠ Possible duplicate (same name + company). Review before contacting.' : '',
      createdAt: t, reviewedAt: null, editedAt: null, sentAt: null, lastActivityAt: t, outcome: null,
      isDemo: false, campaignId: campaign.id,
      approval: { status: 'pending', approvedText: null, approvedAt: null },
      research: {
        verifiedFacts: c.verified_facts || [], inferences: c.inferences || [],
        posts: (c.posts || []).map((p) => ({ url: p.url, date: p.date, title: p.title, source: p.source === 'linkedin' ? 'linkedin' : 'web' })),
        activityChecked: Boolean(c.activity_checked), suggestedOpener: c.suggested_opener || '',
        photoUrl: c.photo_url, sources: [c.linkedin_url, ...(c.posts || []).map((p) => p.url)].filter(Boolean),
      },
    };
    s.prospects.push(prospect);
    s.activities.push({ id: uid(), prospectId: prospect.id, type: 'created', previousStatus: null, newStatus: 'ready_for_review', notes: 'Ficha created from ChatGPT proposal (MCP).', createdAt: t });
    outcome.created.push(prospect.id);
    if (soft) outcome.possible_duplicates.push(c.full_name);
  }
  task.status = 'proposals_received';
  task.updatedAt = now();
  task.log.push({ at: now(), event: `${outcome.created.length} proposal(s) saved via MCP.` });
  writeState(dir, s);
  return outcome;
}

module.exports = { TOOLS, setChangeListener, readState, writeState };
