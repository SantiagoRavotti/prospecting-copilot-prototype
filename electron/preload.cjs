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

  cloud: {
    status: () => ipcRenderer.invoke('cloud:status'),
    sendCode: (email) => ipcRenderer.invoke('cloud:sendCode', email),
    verifyCode: (email, code) => ipcRenderer.invoke('cloud:verifyCode', email, code),
    signOut: () => ipcRenderer.invoke('cloud:signOut'),
    syncNow: () => ipcRenderer.invoke('cloud:syncNow'),
  },

  chatgpt: {
    show: (bounds) => ipcRenderer.invoke('chatgpt:show', bounds),
    setBounds: (bounds) => ipcRenderer.invoke('chatgpt:setBounds', bounds),
    hide: () => ipcRenderer.invoke('chatgpt:hide'),
    open: (url) => ipcRenderer.invoke('chatgpt:open', url),
    status: () => ipcRenderer.invoke('chatgpt:status'),
    sendDirective: (text, conversationUrl) => ipcRenderer.invoke('chatgpt:sendDirective', text, conversationUrl),
    onNavigated: (handler) => {
      const listener = (_e, nav) => handler(nav);
      ipcRenderer.on('chatgpt:navigated', listener);
      return () => ipcRenderer.removeListener('chatgpt:navigated', listener);
    },
  },

  bridge: {
    status: () => ipcRenderer.invoke('bridge:status'),
    launch: (startUrl) => ipcRenderer.invoke('bridge:launch', startUrl),
    readPage: () => ipcRenderer.invoke('bridge:readPage'),
    openUrl: (url) => ipcRenderer.invoke('bridge:openUrl', url),
    stop: () => ipcRenderer.invoke('bridge:stop'),
    selfTest: () => ipcRenderer.invoke('bridge:selfTest'),
  },

  legacyKey: {
    status: () => ipcRenderer.invoke('legacyKey:status'),
    delete: () => ipcRenderer.invoke('legacyKey:delete'),
  },


});
