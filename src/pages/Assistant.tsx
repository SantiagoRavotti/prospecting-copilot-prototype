// Embedded assistant (desktop only). Chats with the local agent (BYOK, runs in
// the Electron main process) which can do REAL web research, read the page
// open in the managed Chrome, query the CRM, and PROPOSE changes that the
// user applies with one click. It never sends anything anywhere.

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, Send, Wrench, X } from 'lucide-react';
import type { AgentProposal } from '../lib/desktop';
import { desktopApi } from '../lib/desktop';
import {
  activeWorkspace,
  addNote,
  saveMessage,
  updateOpportunity,
  createFollowUp,
  useAppState,
} from '../lib/store';
import { cn, daysFromNow, nowIso } from '../lib/utils';
import { Button, Card, EmptyState, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export default function Assistant() {
  const desktop = desktopApi();
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveTool, setLiveTool] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!desktop) return;
    return desktop.agent.onEvent((ev) => {
      if (ev.type === 'tool') setLiveTool(ev.name ?? null);
    });
  }, [desktop]);

  if (!desktop) {
    return (
      <EmptyState
        title="El asistente vive en la app de escritorio"
        body="Esta función usa tu clave de Anthropic y el puente con Chrome, disponibles solo en la versión instalada."
      />
    );
  }

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setLiveTool(null);
    try {
      const snapshot = {
        prospects: state.prospects.filter((p) => p.workspaceId === workspace.id).slice(0, 200),
        companies: state.companies.slice(0, 200),
        opportunities: state.opportunities.slice(0, 100),
        follow_ups: state.followUps.slice(0, 100),
        conversations: (state.conversations ?? []).slice(-200),
      };
      const result = await desktop.agent.chat({
        messages: next,
        crmSnapshot: snapshot,
        campaignContext: `Campaña activa: ${workspace.name}. Propuesta de valor: ${workspace.valueProposition}. Servicios: ${workspace.services.join('; ')}.`,
      });
      setMessages((m) => [...m, { role: 'assistant', content: result.text || '(sin texto)' }]);
      if (result.proposals.length > 0) {
        setProposals((p) => [...p, ...result.proposals]);
        toast(`${result.proposals.length} propuesta(s) del asistente para revisar.`, 'info');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('NO_API_KEY')) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              'Falta tu clave de Anthropic. Cargala en Settings → “Clave de Anthropic (BYOK)” y volvé a intentar.',
          },
        ]);
      } else {
        toast(msg, 'error');
      }
    } finally {
      setBusy(false);
      setLiveTool(null);
    }
  };

  const applyProposal = (p: AgentProposal, index: number) => {
    try {
      const patch = p.patch as Record<string, string | undefined>;
      if (p.entity === 'prospect' && p.id) {
        if (typeof patch.notes === 'string') addNote(p.id, patch.notes);
        if (typeof patch.editedMessage === 'string') saveMessage(p.id, patch.editedMessage);
      } else if (p.entity === 'opportunity' && p.id) {
        const allowed: Record<string, unknown> = {};
        for (const k of ['notes', 'summary', 'relevanceRationale', 'assignee'] as const) {
          if (typeof patch[k] === 'string') allowed[k] = patch[k];
        }
        updateOpportunity(p.id, allowed, `Asistente: ${p.reason}`);
      } else if (p.entity === 'follow_up' && p.id) {
        createFollowUp(p.id, daysFromNow(Number(patch.dueInDays) || 3), patch.message ?? p.reason);
      } else {
        toast('Tipo de propuesta no soportado todavía.', 'error');
        return;
      }
      setProposals((list) => list.filter((_, i) => i !== index));
      toast('Propuesta aplicada.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo aplicar.', 'error');
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-900">Asistente</h1>
        <p className="text-sm text-slate-500">
          Investigación real con tu clave · lee la página abierta en el Chrome gestionado · propone,
          nunca envía. Campaña: <strong>{workspace.name}</strong>
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          data-testid="assistant-thread"
        >
          {messages.length === 0 && (
            <p className="pt-10 text-center text-sm text-slate-400">
              Probá: “Investigá a [nombre] de [empresa] y proponeme un mensaje para esta campaña”, o
              abrí un perfil en el Chrome gestionado y preguntá “¿qué ves en la página abierta?”.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'ml-auto bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-800',
              )}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {liveTool ? (
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> {liveTool}…
                </span>
              ) : (
                'pensando…'
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {proposals.length > 0 && (
          <div
            className="border-t border-amber-100 bg-amber-50/50 px-4 py-3"
            data-testid="assistant-proposals"
          >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Bot className="h-3.5 w-3.5" /> Propuestas del asistente — las aplicás vos
            </p>
            <div className="space-y-2">
              {proposals.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-700">
                      {p.entity} {p.id ? `· ${p.id.slice(0, 8)}…` : ''}
                    </p>
                    <p className="text-slate-500">{p.reason}</p>
                    <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
                      {JSON.stringify(p.patch, null, 1)}
                    </pre>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => applyProposal(p, i)}>
                    <Check className="h-3 w-3" /> Aplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Descartar propuesta"
                    onClick={() => setProposals((list) => list.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form
          className="flex items-end gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            rows={2}
            className="flex-1"
            placeholder="Escribile al asistente…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            data-testid="assistant-input"
          />
          <Button type="submit" loading={busy} data-testid="assistant-send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
      <p className="mt-2 text-[11px] text-slate-400">
        Consumo con tu clave (BYOK). El asistente no puede enviar invitaciones ni mensajes — solo
        investiga, consulta el CRM y propone. {nowIso().slice(0, 10)}
      </p>
    </div>
  );
}
