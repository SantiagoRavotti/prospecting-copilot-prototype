// Campaigns (desktop): create a campaign, hand a research directive to the
// REAL ChatGPT conversation (the app opens chatgpt.com with the directive and
// copies it to the clipboard), and review the fichas ChatGPT writes back through
// the in-app MCP connector: facts vs inferences, posts, editable message,
// approve / discard. Approval freezes the exact text; any edit invalidates it.

import { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ClipboardCopy,
  ExternalLink,
  Plus,
  Search,
  ThumbsDown,
  Undo2,
} from 'lucide-react';
import { desktopApi } from '../lib/desktop';
import { activeWorkspace, companyById, personById, useAppState } from '../lib/store';
import {
  approve,
  createCampaign,
  createResearchTask,
  discard,
  setPending,
} from '../lib/campaignStore';
import { channelLimitFor, checkApprovable, finalText } from '../lib/campaigns';
import type { Campaign, Prospect, ResearchTask } from '../lib/types';
import { cn, copyToClipboard, formatDateTime } from '../lib/utils';
import MessageEditor from '../components/MessageEditor';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

export function buildDirective(campaign: Campaign, task: ResearchTask, senderName: string): string {
  return [
    `Prospecting Copilot — tarea de investigación ${task.id.slice(0, 8)} (campaña "${campaign.name}").`,
    `Usá el conector "Prospecting Copilot CRM": primero get_research_task con task_id "${task.id}" para leer la directiva, los criterios y la identidad del remitente (${senderName}); después list_contacted_people para no repetir personas ya contactadas.`,
    `Directiva: ${task.directive}`,
    `Proponé hasta ${campaign.targetCount} candidatos y guardalos con save_proposals (task_id "${task.id}"). En cada candidato separá verified_facts (lo que realmente consultaste, con URL) de inferences; poné activity_checked=true solo si consultaste su actividad reciente; no inventes posts ni fotos. Escribí draft_message en ${campaign.language === 'es' ? 'español' : 'inglés'}, tono ${campaign.tone}, máximo 280 caracteres, listo para que yo lo revise en la app.`,
  ].join('\n');
}

export default function Campaigns() {
  const desktop = desktopApi();
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const { toast } = useToast();
  const campaigns = useMemo(
    () => (state.campaigns ?? []).filter((c) => c.workspaceId === workspace.id),
    [state.campaigns, workspace.id],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = campaigns.find((c) => c.id === selectedId) ?? campaigns[0] ?? null;
  const [creating, setCreating] = useState(campaigns.length === 0);
  const [form, setForm] = useState({ name: '', objective: '', audience: '', searchCriteria: '', targetCount: 3 });
  const [directive, setDirective] = useState('');
  const [lastDirective, setLastDirective] = useState<string | null>(null);

  const tasks = (state.researchTasks ?? []).filter((t) => t.campaignId === selected?.id);
  const fichas = state.prospects.filter((p) => p.campaignId === selected?.id);
  const limit = channelLimitFor(state);
  const approvedCount = fichas.filter((p) => p.approval?.status === 'approved').length;

  const submitCampaign = () => {
    if (!form.name.trim()) return;
    const c = createCampaign(workspace.id, { ...form, name: form.name.trim(), language: workspace.defaultLanguage, tone: workspace.defaultTone });
    setSelectedId(c.id);
    setCreating(false);
    setForm({ name: '', objective: '', audience: '', searchCriteria: '', targetCount: 3 });
    toast('Campaña creada.', 'success');
  };

  const investigate = async () => {
    if (!selected || !directive.trim()) return;
    const task = createResearchTask(selected.id, directive.trim(), []);
    const text = buildDirective(selected, task, workspace.senderName);
    setLastDirective(text);
    setDirective('');
    if (desktop) {
      await desktop.chatgpt.open(text);
      toast('Directiva enviada a la ventana de ChatGPT (y copiada al portapapeles).', 'success');
    } else {
      await copyToClipboard(text);
      toast('Directiva copiada al portapapeles.', 'info');
    }
  };

  return (
    <div className="space-y-5" data-testid="campaigns-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Campañas</h1>
          <p className="text-sm text-slate-500">
            Workspace <b>{workspace.name}</b>. ChatGPT investiga y escribe fichas vía el conector; vos aprobás.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setCreating((v) => !v)} data-testid="campaign-new">
          <Plus className="h-4 w-4" /> Nueva campaña
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader title="Nueva campaña" subtitle="Objetivo, audiencia y criterios que ChatGPT leerá con get_research_task." />
          <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
            <Field label="Nombre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="campaign-name" />
            </Field>
            <Field label="Candidatos objetivo">
              <Input type="number" min={1} max={50} value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Objetivo">
              <Textarea rows={2} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
            </Field>
            <Field label="Audiencia">
              <Textarea rows={2} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Criterios de búsqueda">
                <Textarea rows={2} value={form.searchCriteria} onChange={(e) => setForm({ ...form, searchCriteria: e.target.value })} />
              </Field>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button onClick={submitCampaign} disabled={!form.name.trim()} data-testid="campaign-save">Crear</Button>
            </div>
          </div>
        </Card>
      )}

      {campaigns.length === 0 && !creating ? (
        <EmptyState title="Sin campañas" body="Creá la primera campaña para empezar a investigar." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left text-sm',
                  selected?.id === c.id ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {state.prospects.filter((p) => p.campaignId === c.id).length} fichas · objetivo {c.targetCount}
                </p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Investigar con ChatGPT"
                  subtitle="La app crea la tarea, abre tu conversación real de ChatGPT con la directiva y ChatGPT guarda las fichas por el conector."
                />
                <div className="space-y-3 px-5 py-4">
                  <Textarea
                    rows={3}
                    placeholder="Ej.: buscá 3 responsables de e-commerce en España con actividad reciente sobre marketplaces…"
                    value={directive}
                    onChange={(e) => setDirective(e.target.value)}
                    data-testid="directive-input"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => void investigate()} disabled={!directive.trim()} data-testid="directive-send">
                      <Search className="h-4 w-4" /> Investigar
                    </Button>
                    {desktop && (
                      <Button variant="ghost" onClick={() => void desktop.chatgpt.open()}>
                        <Bot className="h-4 w-4" /> Abrir ChatGPT
                      </Button>
                    )}
                    {lastDirective && (
                      <Button variant="ghost" onClick={() => void copyToClipboard(lastDirective).then(() => toast('Copiado.', 'info'))}>
                        <ClipboardCopy className="h-4 w-4" /> Copiar última directiva
                      </Button>
                    )}
                  </div>
                  {tasks.length > 0 && (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                      {tasks.slice().reverse().map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="research-task">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-slate-800">{t.directive}</p>
                            <p className="text-xs text-slate-500">
                              tarea {t.id.slice(0, 8)} · {formatDateTime(t.createdAt)}
                              {t.log.length > 0 && ` · ${t.log[t.log.length - 1]!.event}`}
                            </p>
                          </div>
                          <Badge className={t.status === 'proposals_received' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                            {t.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={`Fichas (${fichas.length})`}
                  subtitle={`${approvedCount} aprobadas. Límite efectivo ${limit.observedLimit ?? limit.configuredLimit} − ${limit.margin} caracteres${limit.observedLimit ? ' (observado)' : ' (provisional)'}.`}
                />
                <div className="divide-y divide-slate-100">
                  {fichas.length === 0 && (
                    <p className="px-5 py-6 text-sm text-slate-500">Todavía no hay fichas. Cuando ChatGPT llame a save_proposals aparecen acá sin recargar.</p>
                  )}
                  {fichas.map((p) => (
                    <Ficha key={p.id} prospect={p} limitCheck={checkApprovable(finalText(p), limit)} />
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Ficha({ prospect, limitCheck }: { prospect: Prospect; limitCheck: ReturnType<typeof checkApprovable> }) {
  const state = useAppState();
  const { toast } = useToast();
  const person = personById(state, prospect.personId);
  const company = companyById(state, prospect.companyId);
  const r = prospect.research;
  const status = prospect.approval?.status ?? 'pending';
  const [open, setOpen] = useState(false);

  return (
    <div className="px-5 py-4" data-testid="ficha" data-approval={status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {person?.fullName} <span className="font-normal text-slate-500">— {person?.title} · {company?.name}</span>
          </p>
          <p className="text-xs text-slate-500">{prospect.fitReason}</p>
          {person?.linkedinUrl && (
            <a className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline" href={person.linkedinUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" /> {person.linkedinUrl}
            </a>
          )}
          {prospect.notes.startsWith('⚠') && <p className="mt-1 text-xs text-amber-700">{prospect.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              status === 'approved'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : status === 'discarded'
                  ? 'border-slate-200 bg-slate-100 text-slate-500'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
            }
          >
            {status === 'approved' ? 'Aprobada' : status === 'discarded' ? 'Descartada' : 'Pendiente'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cerrar' : 'Revisar'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hechos verificados {r?.activityChecked ? '(actividad consultada)' : '(actividad NO consultada)'}</p>
              {r?.verifiedFacts.length ? <ul className="list-disc pl-5 text-slate-700">{r.verifiedFacts.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-slate-400">—</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inferencias</p>
              {r?.inferences.length ? <ul className="list-disc pl-5 text-slate-600">{r.inferences.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-slate-400">—</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Posts</p>
              {r?.posts.length ? (
                <ul className="space-y-1">
                  {r.posts.map((post, i) => (
                    <li key={i} className="truncate">
                      <a className="text-brand-700 hover:underline" href={post.url} target="_blank" rel="noreferrer">{post.title || post.url}</a>
                      <span className="text-xs text-slate-400"> {post.date ?? ''} · {post.source}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">—</p>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <MessageEditor prospect={prospect} />
            <div className="flex flex-wrap items-center gap-2">
              {status !== 'approved' ? (
                <Button
                  size="sm"
                  disabled={!limitCheck.ok}
                  title={limitCheck.ok ? undefined : limitCheck.reason}
                  onClick={() => {
                    approve(prospect.id);
                    toast('Ficha aprobada: el texto quedó congelado.', 'success');
                  }}
                  data-testid="ficha-approve"
                >
                  <Check className="h-4 w-4" /> Aprobar
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setPending(prospect.id)}>
                  <Undo2 className="h-4 w-4" /> Volver a pendiente
                </Button>
              )}
              {status !== 'discarded' && (
                <Button size="sm" variant="ghost" onClick={() => discard(prospect.id)} data-testid="ficha-discard">
                  <ThumbsDown className="h-4 w-4" /> Descartar
                </Button>
              )}
              <span className="text-xs text-slate-500">
                {limitCheck.chars}/{limitCheck.limit} caracteres{!limitCheck.ok && ` · ${limitCheck.reason}`}
              </span>
            </div>
            {prospect.approval?.approvedAt && status === 'approved' && (
              <p className="text-xs text-slate-500">Aprobada {formatDateTime(prospect.approval.approvedAt)}. Editar el mensaje invalida la aprobación.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
