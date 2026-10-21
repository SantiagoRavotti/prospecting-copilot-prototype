// Version shown inside the app and stamped in every research package.
// Injected at build time from package.json (vite `define`).
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
