// Preload: the ONLY surface the renderer sees of the desktop shell.
// Reads the persisted state synchronously at boot so the existing store can
// initialize without an async phase, then exposes a narrow IPC API.

const { contextBridge, ipcRenderer } = require('electron');
const storeFile = require('./storeFile.cjs');

const initialState = process.env.PC_DATA_DIR
  ? storeFile.readStateSync(process.env.PC_DATA_DIR)
  : null;

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  /** Raw JSON of the persisted state, read at boot (null on first run). */
  initialState,
  writeState: (json) => ipcRenderer.invoke('store:write', json),
  readState: () => ipcRenderer.invoke('store:read'),
  listBackups: () => ipcRenderer.invoke('store:backups'),
  /** Fired when an external writer (the MCP server) changed the state file. */
  onCrmRefresh: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('crm:refresh', listener);
    return () => ipcRenderer.removeListener('crm:refresh', listener);
  },

  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    setPublicOrigin: (origin) => ipcRenderer.invoke('mcp:setPublicOrigin', origin),
    revokeAll: () => ipcRenderer.invoke('mcp:revokeAll'),
  },

  chatgpt: {
    open: (directive) => ipcRenderer.invoke('chatgpt:open', directive),
    status: () => ipcRenderer.invoke('chatgpt:status'),
  },

  bridge: {
    status: () => ipcRenderer.invoke('bridge:status'),
    launch: (startUrl) => ipcRenderer.invoke('bridge:launch', startUrl),
    readPage: () => ipcRenderer.invoke('bridge:readPage'),
    openUrl: (url) => ipcRenderer.invoke('bridge:openUrl', url),
    stop: () => ipcRenderer.invoke('bridge:stop'),
    selfTest: () => ipcRenderer.invoke('bridge:selfTest'),
  },

  secrets: {
    setAnthropicKey: (key) => ipcRenderer.invoke('secrets:setAnthropicKey', key),
    anthropicKeyStatus: () => ipcRenderer.invoke('secrets:anthropicKeyStatus'),
    clearAnthropicKey: () => ipcRenderer.invoke('secrets:clearAnthropicKey'),
  },

  agent: {
    chat: (payload) => ipcRenderer.invoke('agent:chat', payload),
    onEvent: (handler) => {
      const listener = (_e, ev) => handler(ev);
      ipcRenderer.on('agent:event', listener);
      return () => ipcRenderer.removeListener('agent:event', listener);
    },
  },
});
