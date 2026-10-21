// Which ChatGPT conversation belongs to what: one saved conversation per
// campaign, falling back to the workspace's. The CRM keeps the structured data
// and history; the conversation reference only lets the user resume the chat.

import { getState, setState } from './store';
import type { AppState, ChatGptConversationLink } from './types';
import { nowIso } from './utils';

export type ConversationScope = { key: string; kind: 'campaign' | 'workspace'; label: string };

export function conversationIdFromUrl(url: string | null | undefined): string | null {
  const m = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(url ?? ''));
  return m ? m[1]!.toLowerCase() : null;
}

export function currentScope(state: AppState): ConversationScope {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? state.workspaces[0]!;
  const campaign = (state.campaigns ?? []).find(
    (c) => c.id === state.activeCampaignId && c.workspaceId === ws.id,
  );
  return campaign
    ? { key: `campaign:${campaign.id}`, kind: 'campaign', label: `Campaña "${campaign.name}"` }
    : { key: `workspace:${ws.id}`, kind: 'workspace', label: `Espacio "${ws.name}"` };
}

/** Saved link for the scope; a campaign without its own falls back to its workspace's. */
export function linkFor(state: AppState, scope: ConversationScope): ChatGptConversationLink | null {
  const links = state.chatgptConversations ?? {};
  if (links[scope.key]) return links[scope.key]!;
  if (scope.kind === 'campaign') {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return ws ? (links[`workspace:${ws.id}`] ?? null) : null;
  }
  return null;
}

export function saveConversationLink(
  scopeKey: string,
  url: string,
  source: ChatGptConversationLink['source'],
): ChatGptConversationLink | null {
  const conversationId = conversationIdFromUrl(url);
  if (!conversationId) return null;
  const link: ChatGptConversationLink = { url, conversationId, boundAt: nowIso(), source };
  setState((prev) => ({ ...prev, chatgptConversations: { ...(prev.chatgptConversations ?? {}), [scopeKey]: link } }));
  return link;
}

export function clearConversationLink(scopeKey: string): void {
  setState((prev) => {
    const next = { ...(prev.chatgptConversations ?? {}) };
    delete next[scopeKey];
    return { ...prev, chatgptConversations: next };
  });
}

export function setActiveCampaign(id: string | null): void {
  if (getState().activeCampaignId === id) return;
  setState((prev) => ({ ...prev, activeCampaignId: id }));
}

/** Append an entry to a research task's history (CRM side record of delivery). */
export function logTaskEvent(taskId: string, event: string): void {
  setState((prev) => ({
    ...prev,
    researchTasks: (prev.researchTasks ?? []).map((t) =>
      t.id === taskId ? { ...t, updatedAt: nowIso(), log: [...t.log, { at: nowIso(), event }] } : t,
    ),
  }));
}
