import { afterEach, describe, expect, it } from 'vitest';
import { getNumber, local, session } from './storage';

const g = globalThis as { window?: unknown };
afterEach(() => {
  delete g.window;
});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe('safe storage', () => {
  it('works normally when storage is available', () => {
    g.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
    expect(local.set('a', '1')).toBe(true);
    expect(local.get('a')).toBe('1');
    expect(getNumber('a')).toBe(1);
    session.set('s', 'x');
    expect(session.get('s')).toBe('x');
    session.remove('s');
    expect(session.get('s')).toBeNull();
  });

  it('degrades instead of throwing when access itself throws (blocked cookies)', () => {
    g.window = {
      get localStorage(): Storage { throw new DOMException('denied', 'SecurityError'); },
      get sessionStorage(): Storage { throw new DOMException('denied', 'SecurityError'); },
    };
    expect(local.get('a')).toBeNull();
    expect(local.set('a', '1')).toBe(false);
    expect(() => local.remove('a')).not.toThrow();
    expect(session.get('k')).toBeNull();
    expect(getNumber('a', 5)).toBe(5);
  });

  it('degrades when setItem throws (quota exceeded)', () => {
    const s = memoryStorage();
    s.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    g.window = { localStorage: s };
    expect(local.set('a', '1')).toBe(false);
  });

  it('works with no window at all', () => {
    expect(local.get('a')).toBeNull();
    expect(local.set('a', '1')).toBe(false);
  });

  it('getNumber falls back on missing, empty and garbage values', () => {
    const s = memoryStorage();
    g.window = { localStorage: s };
    expect(getNumber('missing')).toBe(0);
    expect(getNumber('missing', -Infinity)).toBe(-Infinity);
    s.setItem('e', '');
    expect(getNumber('e', 3)).toBe(3);
    s.setItem('bad', 'NaN-ish');
    expect(getNumber('bad', 3)).toBe(3);
    s.setItem('neg', '-250');
    expect(getNumber('neg')).toBe(-250);
  });
});
