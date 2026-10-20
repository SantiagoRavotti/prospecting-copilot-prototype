// What the user typed in a sign-in field: the one-time code from the email,
// or the sign-in link from the same email pasted as text. Supabase's free plan
// does not allow customizing the email template, so the email may contain only
// a link; pasting it works inside the app's own windows, where clicking it
// would open a different browser. (electron/relay.cjs mirrors this parser.)

export type EmailCredential =
  | { kind: 'code'; code: string }
  | { kind: 'link'; tokenHash: string; type: 'magiclink' | 'email' | 'signup' }
  | { kind: 'invalid'; reason: string };

export function parseEmailCredential(input: string): EmailCredential {
  const raw = input.trim();
  if (/^\d{6,10}$/.test(raw)) return { kind: 'code', code: raw };
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash');
      const type = (url.searchParams.get('type') ?? 'magiclink') as 'magiclink' | 'email' | 'signup';
      if (!token) return { kind: 'invalid', reason: 'El enlace no contiene un token de acceso.' };
      if (token.startsWith('pkce_')) {
        return { kind: 'invalid', reason: 'Ese enlace solo funciona abriéndolo en el navegador donde lo pediste.' };
      }
      return { kind: 'link', tokenHash: token, type };
    } catch {
      return { kind: 'invalid', reason: 'No parece un enlace válido.' };
    }
  }
  return { kind: 'invalid', reason: 'Pegá el código del email o el enlace completo.' };
}
