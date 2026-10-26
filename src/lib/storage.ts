/**
 * Web Storage that never throws. Merely touching `window.localStorage` throws a
 * SecurityError when storage is blocked (Safari "Block all cookies", some
 * embedded webviews, sandboxed iframes), and setItem throws when the quota is
 * full (old Safari private mode). Saved data is a nice-to-have here, so failures
 * degrade to "not saved" instead of crashing the game.
 */
type Kind = 'localStorage' | 'sessionStorage';

function store(kind: Kind): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}

function make(kind: Kind) {
  return {
    get(key: string): string | null {
      try {
        return store(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): boolean {
      try {
        const s = store(kind);
        if (!s) return false;
        s.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key: string) {
      try {
        store(kind)?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const local = make('localStorage');
export const session = make('sessionStorage');

/** Stored number, or `fallback` when missing/unreadable/not a number. */
export function getNumber(key: string, fallback = 0): number {
  const raw = local.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
