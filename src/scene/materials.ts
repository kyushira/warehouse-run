import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared standard material by color (+options key). */
export function mat(color: string, opts: { rough?: number; metal?: number; opacity?: number; emissive?: string; ei?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? ''}|${opts.ei ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.75,
      metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.ei ?? 0,
    });
    cache.set(key, m);
  }
  return m;
}

export const C = {
  floor: '#f4f7fb',
  slab: '#e7edf5',
  ground: '#e9eff6',
  asphalt: '#cfd7e2',
  line: '#ffffff',
  grass: '#d7ecd6',
  wall: '#2f6fe4',
  wallLight: '#4f8bf0',
  wallDark: '#1d4fc4',
  trim: '#1e3a8a',
  steel: '#94a3b8',
  dark: '#334155',
  yellow: '#facc15',
  safety: '#f59e0b',
  wood: '#c08a4b',
  woodDark: '#9a6b37',
  card: '#c9a26b',
  sleeve: '#d6b27e',
  tape: '#8a6232',
  foam: '#f8fafc',
  fork: '#f59e0b',
  tire: '#1f2937',
  glass: '#bfdbfe',
};

const texCache = new Map<string, THREE.CanvasTexture>();

/** Canvas text texture (offline-safe; no font downloads). */
export function labelTexture(text: string, o: { fg?: string; bg?: string; w?: number; h?: number; size?: number; weight?: number; align?: CanvasTextAlign; border?: string } = {}) {
  const key = JSON.stringify([text, o]);
  const hit = texCache.get(key);
  if (hit) return hit;
  const w = o.w ?? 512, h = o.h ?? 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  if (o.bg) {
    g.fillStyle = o.bg;
    const r = Math.min(24, h / 3);
    g.beginPath();
    g.roundRect(2, 2, w - 4, h - 4, r);
    g.fill();
    if (o.border) {
      g.strokeStyle = o.border;
      g.lineWidth = 4;
      g.stroke();
    }
  }
  g.fillStyle = o.fg ?? '#334155';
  g.font = `${o.weight ?? 800} ${o.size ?? 64}px Inter, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  g.fillText(text, o.align === 'left' ? 24 : w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Vertical cladding ribs for the blue warehouse walls. */
export function claddingTexture(color: string, rib: string) {
  const key = `clad|${color}|${rib}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = rib;
  g.fillRect(0, 0, 6, 64);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(6, 0, 3, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

/** Diagonal sheen streaks for stretch wrap. */
export function wrapTexture() {
  const key = 'wrap';
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  for (let i = -128; i < 256; i += 18) {
    g.lineWidth = 2 + (i % 3);
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 60, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

/** Barcode sticker: bars derived from the code + human-readable text. tone tints the label. */
export function barcodeTexture(code: string, tone: 'plain' | 'good' | 'bad' = 'plain') {
  const key = `bc|${code}|${tone}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = tone === 'good' ? '#dcfce7' : tone === 'bad' ? '#fee2e2' : '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = tone === 'good' ? '#16a34a' : tone === 'bad' ? '#dc2626' : '#cbd5e1';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 122);
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  g.fillStyle = '#0f172a';
  for (let x = 22; x < 234; ) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 2 + ((h >>> 3) & 3) * 2;
    if ((h >>> 9) & 1) g.fillRect(x, 16, w, 66);
    x += w + 2;
  }
  g.font = '800 26px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.fillText(code, 128, 108);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
