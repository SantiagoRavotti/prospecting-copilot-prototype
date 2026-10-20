import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { parseEmailCredential } from './emailCredential';

const relay = createRequire(import.meta.url)('../../electron/relay.cjs');

const LINK = 'https://ref.supabase.co/auth/v1/verify?token=abc123hash&type=magiclink&redirect_to=https://x.test/';

describe('email credential parsing (web + desktop agree)', () => {
  for (const [name, parse] of [['web', parseEmailCredential], ['desktop', relay.parseEmailCredential]] as const) {
    it(`${name}: code, link, pkce link, garbage`, () => {
      expect(parse(' 12345678 ')).toEqual({ kind: 'code', code: '12345678' });
      expect(parse(LINK)).toEqual({ kind: 'link', tokenHash: 'abc123hash', type: 'magiclink' });
      expect(parse(LINK.replace('abc123hash', 'pkce_zz')).kind).toBe('invalid');
      expect(parse('hola').kind).toBe('invalid');
    });
  }
});
