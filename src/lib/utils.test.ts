import { describe, expect, it } from 'vitest';
import { charCount, firstNameOf, hashString, lastNameOf, mulberry32 } from './utils';

describe('charCount', () => {
  it('counts plain characters', () => {
    expect(charCount('hello')).toBe(5);
    expect(charCount('')).toBe(0);
  });

  it('counts unicode code points, not UTF-16 units', () => {
    expect(charCount('héllo')).toBe(5);
    expect(charCount('👍')).toBe(1); // surrogate pair counts once
  });
});

describe('name helpers', () => {
  it('splits first and last names', () => {
    expect(firstNameOf('Jane Marie Doe')).toBe('Jane');
    expect(lastNameOf('Jane Marie Doe')).toBe('Marie Doe');
    expect(lastNameOf('Jane')).toBe('');
  });
});

describe('hashString / mulberry32', () => {
  it('hashString is deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('mulberry32 produces a reproducible sequence in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
