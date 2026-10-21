// Save a text file for the user. In the desktop app this opens a "save as"
// dialog (so they know where the context package went); in the web build it
// triggers a normal browser download.

import { desktopApi } from './desktop';

export async function saveTextFile(
  name: string,
  content: string,
  mime = 'application/json',
): Promise<{ where: string } | null> {
  const desktop = desktopApi();
  if (desktop) {
    const r = await desktop.files.saveText(name, content);
    return r ? { where: r.path } : null;
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { where: `Descargas · ${name}` };
}
