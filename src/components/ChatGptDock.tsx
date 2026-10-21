// ChatGPT docked next to the CRM (desktop). The real chatgpt.com session lives
// in a native view placed over the rectangle this component reserves; the
// header manages WHICH conversation belongs to the current campaign/workspace:
// resume the saved one, adopt the one that is open, or start a new one.

import { useEffect, useRef, useState } from 'react';
import { History, Link2, MessageSquarePlus, PanelRightClose, Unlink } from 'lucide-react';
import { desktopApi } from '../lib/desktop';
import { useAppState } from '../lib/store';
import {
  clearConversationLink,
  conversationIdFromUrl,
  currentScope,
  linkFor,
  saveConversationLink,
} from '../lib/chatgptLinks';
import { setDockOpen } from '../lib/dockStore';
import { formatDateTime } from '../lib/utils';
import { Button } from './ui';

export const DOCK_WIDTH_CSS = 'min(48vw, 760px)';

export default function ChatGptDock() {
  const desktop = desktopApi();
  const state = useAppState();
  const scope = currentScope(state);
  const link = linkFor(state, scope);
  const ownLink = (state.chatgptConversations ?? {})[scope.key] ?? null;
  const viewRef = useRef<HTMLDivElement>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const lastScope = useRef<string | null>(null);

  // Place the native view over our rectangle and keep it there.
  useEffect(() => {
    if (!desktop || !viewRef.current) return;
    const el = viewRef.current;
    const rect = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    void desktop.chatgpt.show(rect()).then((s) => setOpenUrl(s.url));
    const ro = new ResizeObserver(() => void desktop.chatgpt.setBounds(rect()));
    ro.observe(el);
    const onResize = () => void desktop.chatgpt.setBounds(rect());
    window.addEventListener('resize', onResize);
    const off = desktop.chatgpt.onNavigated((nav) => setOpenUrl(nav.url));
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      off();
      void desktop.chatgpt.hide();
    };
  }, [desktop]);

  // Resume the saved conversation when the dock opens or the scope changes.
  useEffect(() => {
    if (!desktop || lastScope.current === scope.key) return;
    lastScope.current = scope.key;
    if (link) void desktop.chatgpt.open(link.url).then((s) => setOpenUrl(s.url));
  }, [desktop, scope.key, link]);

  useEffect(() => {
    if (!desktop) return;
    const poll = () => void desktop.chatgpt.status().then((s) => setLoggedIn(s.loggedIn ?? null));
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [desktop]);

  if (!desktop) return null;
  const openId = conversationIdFromUrl(openUrl);
  const mismatch = Boolean(openId && link && openId !== link.conversationId);
  const adoptable = Boolean(openId && (!link || mismatch));

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex flex-col border-l border-slate-200 bg-white"
      style={{ width: DOCK_WIDTH_CSS }}
      data-testid="chatgpt-dock"
    >
      <div className="space-y-1.5 border-b border-slate-200 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-slate-800">
            ChatGPT · {scope.label}
            {loggedIn === false && <span className="ml-2 font-normal text-amber-700">sin sesión: iniciá sesión abajo</span>}
          </p>
          <button
            className="text-slate-400 hover:text-slate-700"
            title="Cerrar panel"
            onClick={() => setDockOpen(false)}
            data-testid="dock-close"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <p className="text-slate-500" data-testid="dock-link">
          {link ? (
            <>
              Conversación guardada {ownLink ? '' : '(del espacio de trabajo) '}
              <code>{link.conversationId.slice(0, 8)}</code> · {formatDateTime(link.boundAt)}
            </>
          ) : (
            'Sin conversación guardada: la primera directiva enviada desde Investigar la guarda, o elegí la abierta.'
          )}
        </p>
        {mismatch && <p className="text-amber-700">La conversación abierta no es la guardada para este alcance.</p>}
        <div className="flex flex-wrap gap-1.5">
          {link && (mismatch || !openId) && (
            <Button size="sm" variant="secondary" onClick={() => void desktop.chatgpt.open(link.url)} data-testid="dock-resume">
              <History className="h-3.5 w-3.5" /> Retomar guardada
            </Button>
          )}
          {adoptable && (
            <Button size="sm" variant="secondary" onClick={() => saveConversationLink(scope.key, openUrl!, 'user_choice')} data-testid="dock-adopt">
              <Link2 className="h-3.5 w-3.5" /> Usar la abierta
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void desktop.chatgpt.open()} data-testid="dock-new">
            <MessageSquarePlus className="h-3.5 w-3.5" /> Nueva conversación
          </Button>
          {ownLink && (
            <Button size="sm" variant="ghost" onClick={() => clearConversationLink(scope.key)}>
              <Unlink className="h-3.5 w-3.5" /> Olvidar
            </Button>
          )}
        </div>
      </div>
      <div ref={viewRef} className="flex-1 bg-slate-50" data-testid="chatgpt-view-slot">
        <p className="p-4 text-xs text-slate-400">Cargando ChatGPT…</p>
      </div>
    </aside>
  );
}
