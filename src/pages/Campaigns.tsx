// Campañas — the batch workflow with the user's own ChatGPT (Plus):
//
//   1. Preparar investigación   → the app builds a context package + directive
//   2. (manual) send them to the saved ChatGPT conversation, in the user's browser
//   3. Importar resultado       → validated preview, then confirm
//   4. Review, edit, approve    → approval = exact text; edits invalidate it
//
// Nothing here researches or sends anything: preparing a package is NOT a
// research run, and approving a ficha sends nothing to LinkedIn.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  History,
  Link2,
  Pencil,
  Plus,
  ThumbsDown,
  Undo2,
} from 'lucide-react';
import { desktopApi } from '../lib/desktop';
import {
  clearConversationLink,
  conversationIdFromUrl,
  currentScope,
  linkFor,
  saveConversationLink,
  setActiveCampaign,
} from '../lib/chatgptLinks';
import { activeWorkspace, companyById, getState, personById, saveMessage, useAppState } from '../lib/store';
import {
  applyMessageProposal,
  approve,
  createCampaign,
  createResearchTask,
  discard,
  dismissMessageProposal,
  duplicateCampaign,
  logTaskPrepared,
  setConfiguredLimit,
  setPending,
  setProspectLinkedinUrl,
  updateCampaign,
} from '../lib/campaignStore';
import {
  buildContextPackage,
  buildDirective,
  buildResultExample,
  contextFileName,
} from '../lib/batchExchange';
import { channelLimitFor, checkApprovable, effectiveLimit, essentialGaps, finalText } from '../lib/campaigns';
import { saveTextFile } from '../lib/files';
import type { ChannelLimitConfig, Prospect } from '../lib/types';
import { cn, copyToClipboard, formatDateTime } from '../lib/utils';
import MessageEditor from '../components/MessageEditor';
import ImportDialog, { type ImportDraft } from '../components/ImportDialog';
import CampaignForm, { campaignPatchFromDraft, draftFromCampaign } from '../components/CampaignForm';
import { Badge, Button, Card, CardHeader, EmptyState, Input } from '../components/ui';
import { useToast } from '../components/toast';
import { APP_VERSION } from '../lib/appVersion';

const TASK_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Preparada · esperando el resultado de ChatGPT', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  proposals_received: { label: 'Resultado importado', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

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
  const [form, setForm] = useState<'none' | 'create' | 'edit'>('none');
  const [instruction, setInstruction] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Kept here (not in the dialog) so a closed dialog or an error never loses the pasted text.
  const [importDraft, setImportDraftState] = useState<ImportDraft>({ text: '', input: 'paste' });
  const draftKey = (id: string) => `pc-import-draft:${id}`;
  const setImportDraft = (d: ImportDraft) => {
    setImportDraftState(d);
    if (!selected) return;
    try {
      if (d.text) localStorage.setItem(draftKey(selected.id), JSON.stringify(d));
      else localStorage.removeItem(draftKey(selected.id));
    } catch {
      /* private mode: the text still survives while the app stays open */
    }
  };
  const [chatUrl, setChatUrl] = useState('');

  const tasks = (state.researchTasks ?? []).filter((t) => t.campaignId === selected?.id);
  const fichas = state.prospects.filter((p) => p.campaignId === selected?.id);
  const limit = channelLimitFor(state);
  const approvedCount = fichas.filter((p) => p.approval?.status === 'approved').length;
  const imports = (state.importHistory ?? []).filter((r) => r.campaignId === selected?.id);
  const scope = currentScope(state);
  const link = linkFor(state, scope);
  const ownLink = (state.chatgptConversations ?? {})[scope.key] ?? null;

  useEffect(() => {
    setActiveCampaign(selected?.id ?? null);
    setActiveTaskId(null);
    setChatUrl('');
    // A result pasted but not imported (e.g. with errors) survives closing the app.
    let saved: ImportDraft = { text: '', input: 'paste' };
    try {
      const raw = selected ? localStorage.getItem(draftKey(selected.id)) : null;
      if (raw) saved = JSON.parse(raw) as ImportDraft;
    } catch {
      /* ignore */
    }
    setImportDraftState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const activeTask =
    tasks.find((t) => t.id === activeTaskId) ?? [...tasks].reverse().find((t) => t.status === 'pending') ?? null;

  const prepare = () => {
    if (!selected) return;
    const directive = instruction.trim() || selected.objective || 'Investigar según los criterios de la campaña.';
    const task = createResearchTask(selected.id, directive, []);
    logTaskPrepared(task.id, 'Contexto y directiva preparados. La app no envió nada: el envío a ChatGPT lo hace el usuario.');
    setActiveTaskId(task.id);
    setInstruction('');
    toast('Investigación preparada. Todavía no se investigó nada: enviá el paquete a tu ChatGPT.', 'info');
  };

  const buildFor = (taskId: string) => {
    const pkg = buildContextPackage(getState(), selected!.id, taskId);
    const task = tasks.find((t) => t.id === taskId)!;
    const file = contextFileName(selected!, task);
    return { pkg, file, directive: buildDirective(pkg, file) };
  };

  const downloadPackage = async () => {
    if (!activeTask || !selected) return;
    const { pkg, file } = buildFor(activeTask.id);
    const saved = await saveTextFile(file, JSON.stringify(pkg, null, 2));
    if (saved) toast(`Paquete guardado: ${saved.where}. Adjuntalo en tu conversación de ChatGPT.`, 'success');
  };
  const copyDirective = async () => {
    if (!activeTask) return;
    await copyToClipboard(buildFor(activeTask.id).directive);
    toast('Directiva copiada. Pegala en tu conversación de ChatGPT (el envío es manual).', 'info');
  };
  const downloadExample = async () => {
    if (!activeTask || !selected) return;
    const saved = await saveTextFile(
      `ejemplo-resultado-${activeTask.id.slice(0, 8)}.json`,
      JSON.stringify(buildResultExample(selected.id, activeTask.id), null, 2),
    );
    if (saved) toast(`Ejemplo guardado: ${saved.where}`, 'info');
  };

  const openChat = async (url: string) => {
    try {
      if (desktop) await desktop.external.openChatGpt(url);
      else window.open(url, '_blank', 'noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir.', 'error');
    }
  };
  const saveLink = (key: string) => {
    if (!saveConversationLink(key, chatUrl.trim(), 'user_choice')) {
      toast('Pegá la URL de una conversación (chatgpt.com/c/…), no la página principal.', 'error');
      return;
    }
    setChatUrl('');
    toast('Conversación guardada.', 'success');
  };

  return (
    <div className="space-y-5" data-testid="campaigns-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Campañas</h1>
          <p className="text-sm text-slate-500">
            Espacio <b>{workspace.name}</b>. Flujo por lotes con tu ChatGPT: la app prepara el contexto, ChatGPT investiga en tu
            conversación y vos importás, revisás y aprobás.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setForm(form === 'create' ? 'none' : 'create')} data-testid="campaign-new">
          <Plus className="h-4 w-4" /> Nueva campaña
        </Button>
      </div>

      {form === 'create' && (
        <CampaignForm
          title="Nueva campaña"
          subtitle="Todo esto viaja en el paquete que recibe ChatGPT."
          initial={draftFromCampaign(null, { language: workspace.defaultLanguage, tone: workspace.defaultTone })}
          submitLabel="Crear"
          onCancel={() => setForm('none')}
          onSubmit={(d) => {
            const c = createCampaign(workspace.id, campaignPatchFromDraft(d));
            setSelectedId(c.id);
            setForm('none');
            toast('Campaña creada.', 'success');
          }}
        />
      )}
      {form === 'edit' && selected && (
        <CampaignForm
          title={`Editar "${selected.name}"`}
          initial={draftFromCampaign(selected, { language: workspace.defaultLanguage, tone: workspace.defaultTone })}
          submitLabel="Guardar cambios"
          onCancel={() => setForm('none')}
          onSubmit={(d) => {
            updateCampaign(selected.id, campaignPatchFromDraft(d));
            setForm('none');
            toast('Campaña actualizada.', 'success');
          }}
        />
      )}

      {campaigns.length === 0 && form !== 'create' ? (
        <EmptyState title="Sin campañas en este espacio" body="Creá la primera para preparar una investigación." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                data-testid="campaign-item"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left text-sm',
                  selected?.id === c.id ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {state.prospects.filter((p) => p.campaignId === c.id).length} fichas · pedidos {c.targetCount}
                </p>
              </button>
            ))}
            {selected && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setForm('edit')} data-testid="campaign-edit">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="campaign-duplicate"
                  onClick={() => {
                    const c = duplicateCampaign(selected.id);
                    if (c) {
                      setSelectedId(c.id);
                      toast('Copia creada con la misma configuración (sin fichas).', 'success');
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicar
                </Button>
              </div>
            )}
          </div>

          {selected && (
            <div className="space-y-5">
              <Card data-testid="prepare-card">
                <CardHeader
                  title="1 · Preparar investigación"
                  subtitle="La app arma el contexto con tus datos (campaña, estilo, contactos existentes, campañas anteriores). No investiga ni envía nada."
                />
                <div className="space-y-3 px-5 py-4">
                  <Input
                    placeholder="Indicación para este lote (opcional). Ej.: priorizá gente que publique sobre marketplaces"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    data-testid="prepare-instruction"
                  />
                  <Button onClick={prepare} data-testid="prepare-btn">
                    Preparar investigación
                  </Button>

                  {activeTask && (
                    <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-sm" data-testid="prepared-panel">
                      <p className="text-slate-700">
                        Tarea <code>{activeTask.id.slice(0, 8)}</code> preparada. <b>Todavía no se investigó nada:</b> ahora hacé esto en tu
                        navegador.
                      </p>
                      <ol className="list-decimal space-y-2 pl-5 text-slate-700">
                        <li>
                          <Button size="sm" variant="secondary" onClick={() => void downloadPackage()} data-testid="package-download">
                            <Download className="h-3.5 w-3.5" /> Descargar paquete de contexto
                          </Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => void downloadExample()} data-testid="example-download">
                            Ejemplo de resultado
                          </Button>
                        </li>
                        <li>
                          <Button size="sm" variant="secondary" onClick={() => void copyDirective()} data-testid="directive-copy">
                            <ClipboardCopy className="h-3.5 w-3.5" /> Copiar directiva
                          </Button>
                        </li>
                        <li>
                          Abrí tu conversación de ChatGPT (abajo), adjuntá el archivo, pegá la directiva y enviala. ChatGPT responde con un bloque
                          JSON.
                        </li>
                        <li>
                          Copiá esa respuesta (o guardala como .json) y usá{' '}
                          <button className="font-medium text-brand-700 underline" onClick={() => setImportOpen(true)}>
                            Importar resultado de ChatGPT
                          </button>
                          .
                        </li>
                      </ol>
                      <details className="text-xs text-slate-500">
                        <summary className="cursor-pointer">Ver la directiva completa</summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2" data-testid="directive-text">
                          {buildFor(activeTask.id).directive}
                        </pre>
                      </details>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => setImportOpen(true)} data-testid="import-open">
                      <FileUp className="h-4 w-4" /> Importar resultado de ChatGPT
                    </Button>
                    {importDraft.text && <span className="text-xs text-amber-700">Hay un texto pendiente de importar: no se perdió.</span>}
                  </div>

                  {tasks.length > 0 && (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                      {[...tasks].reverse().map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="research-task">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-slate-800">{t.directive}</p>
                            <p className="text-xs text-slate-500">
                              tarea {t.id.slice(0, 8)} · {formatDateTime(t.createdAt)}
                              {t.log.length > 0 && ` · ${t.log[t.log.length - 1]!.event}`}
                            </p>
                          </div>
                          <Badge className={(TASK_LABEL[t.status] ?? TASK_LABEL.pending!).cls}>
                            {(TASK_LABEL[t.status] ?? TASK_LABEL.pending!).label}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => setActiveTaskId(t.id)}>
                            Ver paquete
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {imports.length > 0 && (
                    <div className="text-xs text-slate-500" data-testid="import-history">
                      <p className="font-medium uppercase tracking-wide text-slate-400">Historial de importaciones</p>
                      <ul className="mt-1 space-y-0.5">
                        {[...imports].reverse().map((r) => (
                          <li key={r.id}>
                            {formatDateTime(r.at)} · {r.created} nuevas, {r.updated} actualizadas, {r.unchanged} sin cambios,{' '}
                            {r.skippedDuplicates} duplicadas, {r.invalid} con errores
                            {r.input === 'file' && r.fileName ? ` · ${r.fileName}` : ' · pegado'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>

              <Card data-testid="chat-link-card">
                <CardHeader
                  title="Tu conversación de ChatGPT"
                  subtitle={`${scope.label}. Retomarla es una elección tuya: la app nunca abre una conversación nueva por su cuenta.`}
                />
                <div className="space-y-2 px-5 py-4 text-sm">
                  {link ? (
                    <div className="flex flex-wrap items-center gap-2" data-testid="chat-link-saved">
                      <Link2 className="h-4 w-4 text-slate-400" />
                      <code className="text-xs">{link.conversationId.slice(0, 8)}…</code>
                      <span className="text-xs text-slate-500">
                        {ownLink ? 'guardada para esta campaña' : 'respaldo del espacio de trabajo'} · {formatDateTime(link.boundAt)}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => void openChat(link.url)} data-testid="chat-open">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir en el navegador
                      </Button>
                      {ownLink && (
                        <Button size="sm" variant="ghost" onClick={() => clearConversationLink(scope.key)}>
                          Olvidar
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500">Sin conversación guardada. Pegá abajo la URL de la que usás habitualmente.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-64 flex-1"
                      placeholder="https://chatgpt.com/c/… (cambiar o guardar otra)"
                      value={chatUrl}
                      onChange={(e) => setChatUrl(e.target.value)}
                      data-testid="chat-url-input"
                    />
                    <Button
                      size="sm"
                      disabled={!conversationIdFromUrl(chatUrl)}
                      onClick={() => saveLink(`campaign:${selected.id}`)}
                      data-testid="chat-url-save"
                    >
                      Guardar para esta campaña
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!conversationIdFromUrl(chatUrl)}
                      onClick={() => saveLink(`workspace:${workspace.id}`)}
                    >
                      Guardar como respaldo del espacio
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void openChat('https://chatgpt.com/')}>
                      Abrir ChatGPT (conversación nueva)
                    </Button>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={`2 · Fichas (${fichas.length})`}
                  subtitle={`${approvedCount} aprobadas. Aprobar no envía nada a LinkedIn: solo fija el texto exacto para un futuro lote.`}
                  actions={<LimitControl cfg={limit} />}
                />
                <div className="divide-y divide-slate-100" data-testid="fichas-list">
                  {fichas.length === 0 && (
                    <p className="px-5 py-6 text-sm text-slate-500">Todavía no hay fichas. Se crean al importar el resultado de ChatGPT.</p>
                  )}
                  {fichas.map((p) => (
                    <Ficha key={p.id} prospect={p} cfg={limit} />
                  ))}
                </div>
              </Card>
              <p className="text-right text-[11px] text-slate-400">Prospecting Copilot v{APP_VERSION}</p>
            </div>
          )}
        </div>
      )}

      {selected && (
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          campaign={selected}
          draft={importDraft}
          setDraft={setImportDraft}
        />
      )}
    </div>
  );
}

function LimitControl({ cfg }: { cfg: ChannelLimitConfig }) {
  const [value, setValue] = useState(String(cfg.configuredLimit));
  useEffect(() => setValue(String(cfg.configuredLimit)), [cfg.configuredLimit]);
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500" data-testid="limit-control">
      <span>Objetivo de caracteres</span>
      <Input
        className="w-20 !py-1"
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const n = Number(value);
          if (Number.isFinite(n) && n !== cfg.configuredLimit) setConfiguredLimit(n);
        }}
        data-testid="limit-input"
      />
      <span>
        − margen {cfg.margin} = <b data-testid="limit-effective">{effectiveLimit(cfg)}</b> {cfg.observedLimit ? '(observado)' : '(provisional)'}
      </span>
    </div>
  );
}

function Ficha({ prospect, cfg }: { prospect: Prospect; cfg: ChannelLimitConfig }) {
  const state = useAppState();
  const { toast } = useToast();
  const person = personById(state, prospect.personId);
  const company = companyById(state, prospect.companyId);
  const r = prospect.research;
  const status = prospect.approval?.status ?? 'pending';
  const [open, setOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const gaps = essentialGaps(prospect, person);
  const check = checkApprovable(finalText(prospect), cfg);
  const pending = (prospect.messageProposals ?? []).filter((x) => x.status === 'pending');
  const history = prospect.messageHistory ?? [];
  const blocked = gaps.length > 0 ? `Falta ${gaps.join(', ')}.` : !check.ok ? check.reason : undefined;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo.', 'error');
    }
  };

  return (
    <div className="px-5 py-4" data-testid="ficha" data-approval={status} data-name={person?.fullName}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {person?.fullName} <span className="font-normal text-slate-500">— {[person?.title, company?.name].filter(Boolean).join(' · ')}</span>
          </p>
          <p className="text-xs text-slate-500">{prospect.fitReason}</p>
          {person?.linkedinUrl && (
            <a className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline" href={person.linkedinUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" /> {person.linkedinUrl}
            </a>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {r?.origin === 'chatgpt_import' && (
              <Badge className="border-violet-200 bg-violet-50 text-violet-700" >
                <span data-testid="ficha-origin">Investigación importada de ChatGPT</span>
              </Badge>
            )}
            {gaps.length > 0 && (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                <span data-testid="ficha-incomplete">Incompleta: falta {gaps.join(', ')}</span>
              </Badge>
            )}
            {pending.length > 0 && (
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                <span data-testid="ficha-has-proposal">{pending.length} propuesta{pending.length > 1 ? 's' : ''} de ChatGPT</span>
              </Badge>
            )}
          </div>
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
            <span data-testid="ficha-status">{status === 'approved' ? 'Aprobada' : status === 'discarded' ? 'Descartada' : 'Pendiente'}</span>
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} data-testid="ficha-open">
            {open ? 'Cerrar' : 'Revisar'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <p className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">
              Las fuentes las aportó ChatGPT. La app las guarda pero no las verificó de forma independiente.
              {r?.postsAccessible === false && ' ChatGPT indicó que no pudo leer publicaciones de LinkedIn.'}
              {r?.postsAccessible === null && ' ChatGPT no indicó si pudo leer publicaciones de LinkedIn.'}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hechos y fuentes</p>
              {r?.facts?.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                  {r.facts.map((f, i) => (
                    <li key={i}>
                      {f.text}{' '}
                      {f.sourceUrl ? (
                        <a className="text-xs text-brand-700 hover:underline" href={f.sourceUrl} target="_blank" rel="noreferrer">
                          fuente
                        </a>
                      ) : (
                        <span className="text-xs text-amber-700">(sin fuente)</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : r?.verifiedFacts.length ? (
                <ul className="list-disc pl-5 text-slate-700">{r.verifiedFacts.map((f, i) => <li key={i}>{f}</li>)}</ul>
              ) : (
                <p className="text-slate-400">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inferencias (suposiciones, no hechos)</p>
              {r?.inferences.length ? <ul className="list-disc pl-5 text-slate-600">{r.inferences.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-slate-400">—</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Publicaciones consultadas</p>
              {r?.posts.length ? (
                <ul className="space-y-1">
                  {r.posts.map((post, i) => (
                    <li key={i} className="truncate">
                      <a className="text-brand-700 hover:underline" href={post.url} target="_blank" rel="noreferrer">{post.title || post.url}</a>
                      <span className="text-xs text-slate-400"> {post.date ?? 'sin fecha'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">Ninguna.</p>
              )}
            </div>
            {r?.photoUrl && (
              <p className="text-xs text-slate-500">
                Foto: <a className="text-brand-700 hover:underline" href={r.photoUrl} target="_blank" rel="noreferrer">enlace</a> · fuente:{' '}
                <a className="text-brand-700 hover:underline" href={r.photoSource} target="_blank" rel="noreferrer">{r.photoSource}</a>
              </p>
            )}
            {r?.limitations?.length ? <p className="text-xs text-slate-500">Limitaciones informadas: {r.limitations.join(' · ')}</p> : null}
            {gaps.includes('URL de LinkedIn') && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2">
                <Input
                  className="min-w-56 flex-1"
                  placeholder="https://www.linkedin.com/in/…"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  data-testid="ficha-url-input"
                />
                <Button
                  size="sm"
                  onClick={() => safe(() => { setProspectLinkedinUrl(prospect.id, urlDraft); setUrlDraft(''); toast('URL guardada.', 'success'); })}
                  data-testid="ficha-url-save"
                >
                  Completar URL
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <MessageEditor prospect={prospect} limit={effectiveLimit(cfg)} />

            {pending.map((pr) => (
              <div key={pr.id} className="rounded-lg border border-sky-200 bg-sky-50/50 p-2 text-sm" data-testid="proposal">
                <p className="text-xs font-medium text-sky-800">Propuesta de ChatGPT (no reemplaza tu texto hasta que la apliques)</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{pr.text}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { applyMessageProposal(prospect.id, pr.id); toast('Propuesta aplicada. Si la ficha estaba aprobada, volvió a pendiente.', 'info'); }} data-testid="proposal-apply">
                    Aplicar esta versión
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissMessageProposal(prospect.id, pr.id)} data-testid="proposal-dismiss">
                    Descartar
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              {status !== 'approved' ? (
                <Button
                  size="sm"
                  disabled={Boolean(blocked)}
                  title={blocked}
                  onClick={() => safe(() => { approve(prospect.id); toast('Ficha aprobada: el texto quedó fijado. No se envió nada.', 'success'); })}
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
              <span className="text-xs text-slate-500" data-testid="ficha-counter">
                {check.chars}/{check.limit} caracteres
              </span>
            </div>
            {blocked && status !== 'approved' && (
              <p className="flex gap-1.5 text-xs text-amber-700" data-testid="ficha-blocked">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No se puede aprobar: {blocked}
              </p>
            )}
            {prospect.approval?.approvedAt && status === 'approved' && (
              <p className="text-xs text-slate-500">Aprobada {formatDateTime(prospect.approval.approvedAt)} con el texto exacto mostrado. Editarlo invalida la aprobación.</p>
            )}

            {history.length > 0 && (
              <details className="text-xs text-slate-500">
                <summary className="flex cursor-pointer items-center gap-1" data-testid="ficha-history">
                  <History className="h-3.5 w-3.5" /> Versiones anteriores ({history.length})
                </summary>
                <ul className="mt-1 space-y-1.5">
                  {[...history].reverse().map((h, i) => (
                    <li key={i} className="rounded bg-slate-50 p-1.5">
                      <p className="whitespace-pre-wrap text-slate-700">{h.text}</p>
                      <p className="mt-0.5 flex items-center gap-2">
                        {formatDateTime(h.at)} · reemplazada por {h.reason === 'proposal_applied' ? 'una propuesta' : h.reason === 'reset' ? 'el borrador original' : 'una edición'}
                        {h.wasApproved ? ' · estaba aprobada' : ''}
                        <button className="text-brand-700 underline" onClick={() => { saveMessage(prospect.id, h.text); toast('Versión restaurada (como edición nueva).', 'info'); }}>
                          Restaurar
                        </button>
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
