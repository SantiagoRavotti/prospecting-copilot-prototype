// Typed access to the Electron preload surface. In the web builds (cloud or
// local/demo mode) `window.desktop` does not exist and everything is null.

export interface BridgeSelfTestResult {
  ok: boolean;
  url: string;
  title: string;
  textSnippet: string;
  readAt: string;
}

export interface AgentProposal {
  entity: 'prospect' | 'opportunity' | 'follow_up' | 'company' | 'person';
  id?: string;
  patch: Record<string, unknown>;
  reason: string;
}

export interface AgentChatResult {
  text: string;
  proposals: AgentProposal[];
  usage: { input_tokens: number; output_tokens: number; searches: number };
}

export interface McpAuditEntry {
  at: string;
  tool: string;
  ok: boolean;
  ms?: number;
  error?: string;
  args: string;
}

export interface McpStatus {
  running: boolean;
  port: number | null;
  publicOrigin: string | null;
  connectorUrl: string | null;
  clients: string[];
  activeTokens: number;
  sessions: number;
  audit: McpAuditEntry[];
}

export interface DesktopApi {
  isDesktop: true;
  initialState: string | null;
  writeState(json: string): Promise<{ bytes: number; path: string }>;
  readState(): Promise<string | null>;
  listBackups(): Promise<{ file: string; bytes: number }[]>;
  onCrmRefresh(handler: () => void): () => void;
  mcp: {
    status(): Promise<McpStatus>;
    setPublicOrigin(origin: string): Promise<McpStatus>;
    revokeAll(): Promise<McpStatus>;
  };
  chatgpt: {
    open(directive?: string): Promise<{ opened: boolean; reused: boolean }>;
    status(): Promise<{ open: boolean }>;
  };
  bridge: {
    status(): Promise<{ running: boolean; port: number | null }>;
    launch(startUrl?: string): Promise<{ alreadyRunning: boolean; port: number }>;
    readPage(): Promise<{ url: string; title: string; text: string }>;
    openUrl(url: string): Promise<{ navigated: string }>;
    stop(): Promise<{ stopped: boolean }>;
    selfTest(): Promise<BridgeSelfTestResult>;
  };
  secrets: {
    setAnthropicKey(key: string): Promise<{ stored: boolean; last4: string }>;
    anthropicKeyStatus(): Promise<{ stored: boolean; last4: string | null }>;
    clearAnthropicKey(): Promise<{ stored: boolean }>;
  };
  agent: {
    chat(payload: {
      messages: { role: 'user' | 'assistant'; content: string }[];
      crmSnapshot: unknown;
      campaignContext: string;
    }): Promise<AgentChatResult>;
    onEvent(handler: (ev: { type: string; text?: string; name?: string }) => void): () => void;
  };
}

export function desktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { desktop?: DesktopApi }).desktop;
  return api?.isDesktop ? api : null;
}

export function isDesktopMode(): boolean {
  return desktopApi() != null;
}
