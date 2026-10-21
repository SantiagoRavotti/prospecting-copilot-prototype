// UI-only state of the ChatGPT dock (open/closed), remembered per machine.
import { useSyncExternalStore } from 'react';

const KEY = 'pc-chatgpt-dock-open';
let open = (() => {
  try {
    // Experimental and OFF by default: Google sign-in is blocked inside the embedded panel.
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

export function setDockOpen(value: boolean): void {
  open = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function isDockOpen(): boolean {
  return open;
}

export function useDockOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}
