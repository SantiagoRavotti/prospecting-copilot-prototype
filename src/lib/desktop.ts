// Typed access to the Electron preload surface. In the web builds (cloud or
// local/demo mode) `window.desktop` does not exist and everything is null.

export interface BridgeSelfTestResult {
  ok: boolean;
  url: string;
  title: string;
  textSnippet: string;
  readAt: string;
}

export interface ChatGptViewState {
  created: boolean;
  attached: boolean;
  url: string | null;
  conversationId: string | null;
  loggedIn?: boolean;
}

export interface DirectiveDelivery extends ChatGptViewState {
  delivered: boolean;
  /** session | composer | insert | confirm | confirmed | dry_run */
  stage: string;
  reason?: string;
}

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloudRelayStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectorUrl: string;
  encryptionAvailable: boolean;
  lastPushAt: string | null;
  lastPollAt: string | null;
  applied: number;
  failed: number;
  lastError: string | null;
  lastApplied: { at: string; tool: string; result?: unknown; error?: string }[];
}

export interface DesktopApi {
  isDesktop: true;
  initialState: string | null;
  writeState(json: string): Promise<{ bytes: number; path: string }>;
  readState(): Promise<string | null>;
  listBackups(): Promise<{ file: string; bytes: number }[]>;
  onCrmRefresh(handler: () => void): () => void;
  cloud: {
    status(): Promise<CloudRelayStatus>;
    sendCode(email: string): Promise<{ sent: boolean }>;
    verifyCode(email: string, code: string): Promise<{ email: string | null }>;
    signOut(): Promise<{ signedOut: boolean }>;
    syncNow(): Promise<CloudRelayStatus>;
  };
  chatgpt: {
    show(bounds: ViewBounds): Promise<ChatGptViewState>;
    setBounds(bounds: ViewBounds): Promise<void>;
    hide(): Promise<void>;
    open(url?: string): Promise<ChatGptViewState>;
    status(): Promise<ChatGptViewState>;
    sendDirective(text: string, conversationUrl?: string): Promise<DirectiveDelivery>;
    onNavigated(handler: (nav: { url: string; conversationId: string | null }) => void): () => void;
  };
  bridge: {
    status(): Promise<{ running: boolean; port: number | null }>;
    launch(startUrl?: string): Promise<{ alreadyRunning: boolean; port: number }>;
    readPage(): Promise<{ url: string; title: string; text: string }>;
    openUrl(url: string): Promise<{ navigated: string }>;
    stop(): Promise<{ stopped: boolean }>;
    selfTest(): Promise<BridgeSelfTestResult>;
  };
  legacyKey: {
    status(): Promise<{ stored: boolean }>;
    delete(): Promise<{ stored: boolean }>;
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
