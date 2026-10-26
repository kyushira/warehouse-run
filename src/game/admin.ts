/**
 * Admin / debug mode (passcode-gated). Holds debug flags, runs automation each
 * sim step, and offers one-shot actions. Any shift touched by admin tools is
 * "tainted" so it doesn't count toward best scores.
 */
import { SHIFT_SEC, UPGRADES } from './content';
import type { Tune } from './content';
import {
  S, bookTruck, canShip, currentLayer, debugSpawnOrder, emptySkip, giStep, grSummary, kitById, machineById,
  postGR, quarantinePart, removePiece, repairWC, scanPart, shipOut, tick, upgradeCost, buyUpgrade, drainEvents,
} from './sim';
import type { SimState } from './sim';
import { session } from '../lib/storage';

export const ADMIN_PIN = '0000';
const KEY = 'kitflow.admin';

export interface AdminFlags {
  speed: number;
  autoDetrash: boolean;
  autoGR: boolean;
  autoDispatch: boolean;
  autoBook: boolean;
  autoRepair: boolean;
  autoSkip: boolean;
  noBreakdowns: boolean;
  noExceptions: boolean;
  freezeDue: boolean;
}

const DEFAULT_FLAGS: AdminFlags = {
  speed: 1, autoDetrash: false, autoGR: false, autoDispatch: false, autoBook: false, autoRepair: false,
  autoSkip: false, noBreakdowns: false, noExceptions: false, freezeDue: false,
};

export const admin = {
  unlocked: session.get(KEY) === '1',
  panelOpen: false,
  flags: { ...DEFAULT_FLAGS },
  fps: 60,
};

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/* --------------------------------- taint ---------------------------------- */
const tainted = new WeakSet<SimState>();
const taint = () => tainted.add(S);
export const isTainted = () => tainted.has(S);

/* ---------------------------------- lock ---------------------------------- */
export function unlockAdmin(pin: string) {
  if (pin !== ADMIN_PIN) return false;
  admin.unlocked = true;
  admin.panelOpen = true;
  session.set(KEY, '1');
  return true;
}
export function lockAdmin() {
  admin.unlocked = false;
  admin.panelOpen = false;
  admin.flags = { ...DEFAULT_FLAGS };
  session.remove(KEY);
}

export function setFlag<K extends keyof AdminFlags>(k: K, v: AdminFlags[K]) {
  admin.flags[k] = v;
  const neutral = k === 'speed' ? v === 1 : v === false;
  if (!neutral) taint();
}

/** True if any automation/cheat is active right now (shown as a warning). */
export const cheatsActive = () => Object.entries(admin.flags).some(([k, v]) => (k === 'speed' ? v !== 1 : v === true));

/* ------------------------------- tune patching ------------------------------ */
// remember each shift's original values so toggles can restore them
const orig = new WeakMap<Tune, { breakdownPerSec: number; exceptionChance: [number, number] }>();
function patchTune() {
  const t = S.tune;
  if (!orig.has(t)) orig.set(t, { breakdownPerSec: t.breakdownPerSec, exceptionChance: [...t.exceptionChance] as [number, number] });
  const o = orig.get(t)!;
  t.breakdownPerSec = admin.flags.noBreakdowns ? 0 : o.breakdownPerSec;
  t.exceptionChance = admin.flags.noExceptions ? [0, 0] : o.exceptionChance;
}

/* -------------------------------- automation ------------------------------- */
let pieceT = 0, actT = 0;

/** Runs after every sim step (dt is already speed-scaled). */
export function adminTick(dt: number) {
  if (!admin.unlocked || !S.running || S.paused || S.over) return;
  patchTune();
  const f = admin.flags;
  if (f.freezeDue) for (const sh of S.shipments) if (sh.stage !== 'shipped' && sh.stage !== 'delivered') sh.due += dt;

  // detrash: one piece every 0.12s per kit keeps the animation readable
  pieceT += dt;
  if (f.autoDetrash && pieceT >= 0.12) {
    for (const k of S.kits) {
      if (k.state !== 'waiting') continue;
      const layer = currentLayer(k);
      const p = k.pieces.find((x) => !x.removed && x.kind === layer);
      if (p) removePiece(k.id, p.id);
    }
  }
  if (pieceT >= 0.12) pieceT = 0;

  actT += dt;
  if (actT < 0.25) return;
  actT = 0;
  if (f.autoGR) {
    for (const k of S.kits) {
      if (k.state !== 'scan') continue;
      for (const p of k.parts) if (!p.scanned && !p.quarantined) scanPart(k.id, p.id, true);
      for (const p of grSummary(k).offBom) quarantinePart(k.id, p.id);
      postGR(k.id);
    }
  }
  if (f.autoBook) {
    for (const sh of S.shipments) {
      if (sh.truckId || sh.stage === 'shipped' || sh.stage === 'delivered' || sh.stage === 'loading') continue;
      const m = machineById(sh.machineId);
      if (m && (m.state !== 'building' || m.progress > 0.5)) bookTruck(sh.id);
    }
  }
  if (f.autoDispatch) {
    for (const sh of S.shipments) {
      if (!canShip(sh)) continue;
      giStep(sh.id, 'serial');
      giStep(sh.id, 'trailer');
      giStep(sh.id, 'seal');
      shipOut(sh.id);
    }
  }
  if (f.autoRepair) for (const w of S.wcs) if (w.down && w.repairT <= 0) repairWC(w.idx);
  if (f.autoSkip && S.skip.count >= S.skip.cap * 0.8) emptySkip();
}

/* --------------------------------- actions --------------------------------- */
export const act = {
  addMoney(n: number) {
    taint();
    S.startBudget += n;
  },
  /** set spendable budget to exactly n */
  setBudget(n: number) {
    taint();
    S.startBudget = n - (S.revenue - S.costs - S.spent);
  },
  clearCosts() {
    taint();
    S.costs = 0;
  },
  /** fast-forward the sim by `sec` seconds in small steps */
  skip(sec: number) {
    taint();
    for (let t = 0; t < sec && !S.over; t += 0.05) {
      tick(0.05);
      adminTick(0.05);
    }
    const evs = drainEvents();
    return evs.slice(-3);
  },
  endShift() {
    taint();
    S.t = SHIFT_SEC;
  },
  spawnOrder(rush: boolean) {
    taint();
    debugSpawnOrder(rush);
  },
  breakdown() {
    taint();
    const wc = S.wcs.find((w) => w.state === 'building' && !w.down);
    if (wc) {
      wc.down = true;
      wc.broke = true;
      S.events.push({ text: `${wc.id} breakdown (admin)`, tone: 'bad', sfx: 'alarm' });
    }
    return !!wc;
  },
  trucksNow() {
    taint();
    for (const t of S.trucks) if (t.state === 'enroute' && !t.gateWait) t.eta = Math.min(t.eta, 0.05);
  },
  finishBuilds() {
    taint();
    for (const w of S.wcs) if (w.state === 'building') {
      w.down = false;
      w.progress = 0.999;
    }
  },
  maxUpgrades() {
    taint();
    for (const u of UPGRADES) {
      for (let c = upgradeCost(u.id); c !== undefined; c = upgradeCost(u.id)) {
        S.startBudget += c;
        buyUpgrade(u.id);
      }
    }
  },
  emptyCompactor() {
    taint();
    S.skip.count = 0;
    S.skip.emptyT = 0;
  },
  /** finish every waiting kit instantly (detrash + perfect GR) */
  clearKits() {
    taint();
    for (const k of [...S.kits]) {
      if (k.state === 'waiting') {
        for (const p of [...k.pieces].sort((a, b) => a.layer - b.layer)) {
          if (p.removed) continue;
          S.skip.count = 0; // admin bypasses the compactor limit
          S.skip.emptyT = 0;
          removePiece(k.id, p.id);
        }
      }
      const kk = kitById(k.id);
      if (kk?.state === 'scan') {
        for (const p of kk.parts) if (!p.scanned && !p.quarantined) scanPart(kk.id, p.id, true);
        for (const p of grSummary(kk).offBom) quarantinePart(kk.id, p.id);
        postGR(kk.id);
      }
    }
  },
};
