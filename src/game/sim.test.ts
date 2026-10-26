/**
 * Seeded simulation tests. The sim is pure TS driven by a seeded RNG, so a
 * fixed seed + fixed step size replays exactly. These guard against crashes and
 * broken invariants; they deliberately don't pin balance numbers (tuning should
 * stay free to change without rewriting tests).
 */
import { describe, expect, it } from 'vitest';
import * as G from './sim';
import { OPS, SHIFT_SEC, TUNE } from './content';
import { MODIFIERS, rollModifiers, tuneFor } from './modifiers';
import type { ModifierId } from './modifiers';

const DT = 1 / 30;

/** A competent-ish player: detrash, scan/quarantine, book, ship, repair, empty. */
function autopilotStep() {
  for (const sh of G.S.shipments) {
    if (G.canShip(sh)) {
      for (const st of ['serial', 'trailer', 'seal'] as const) G.giStep(sh.id, st);
      G.shipOut(sh.id);
    }
    const m = G.machineById(sh.machineId);
    if (!sh.truckId && m && m.progress > 0.6) G.bookTruck(sh.id);
  }
  if (G.S.skip.count > G.S.skip.cap * 0.8) G.emptySkip();
  for (const w of G.S.wcs) if (w.down) G.repairWC(w.idx);
  const k = G.waitingKits()[0];
  if (!k) return;
  G.openDetrash(k.id);
  if (k.state === 'scan') {
    const g = G.grSummary(k);
    const un = k.parts.find((x) => !x.scanned && !x.quarantined);
    if (g.offBom[0]) G.quarantinePart(k.id, g.offBom[0].id);
    else if (un) G.scanPart(k.id, un.id);
    else G.postGR(k.id);
  } else {
    const layer = G.currentLayer(k);
    const p = k.pieces.find((x) => !x.removed && x.kind === layer);
    if (p) G.removePiece(k.id, p.id);
  }
}

interface RunOpts { seed: number; mods?: ModifierId[]; play?: boolean; buy?: boolean }

/** Run a whole shift with a fixed step; checks invariants every simulated second. */
function runShift({ seed, mods = [], play = true, buy = false }: RunOpts) {
  G.startShift(seed, mods);
  let busy = 0, nextCheck = 0, steps = 0;
  while (!G.S.over) {
    G.tick(DT);
    G.drainEvents();
    if (play) {
      busy -= DT;
      if (busy <= 0) {
        autopilotStep();
        busy = 0.6;
      }
      if (buy) for (const id of ['cutter', 'forklift', 'wc3', 'operator', 'rfid', 'overtime', 'skip'] as const) G.buyUpgrade(id);
    }
    if (G.S.t >= nextCheck) {
      checkInvariants();
      nextCheck += 1;
    }
    if (++steps > (SHIFT_SEC + 5) / DT) throw new Error('shift never ended');
  }
  checkInvariants();
  return G.report();
}

function checkInvariants() {
  const S = G.S;
  for (const v of [S.t, S.revenue, S.costs, S.spent, S.startBudget, G.cash(), G.net()]) expect(Number.isFinite(v)).toBe(true);
  // slot tables point at live entities that agree on their slot
  S.recv.forEach((id, i) => {
    if (id === null) return;
    const k = G.kitById(id);
    expect(k, `recv[${i}] -> ${id}`).toBeDefined();
    expect(k!.slot).toBe(i);
  });
  S.stage.forEach((id, i) => {
    if (id === null) return;
    const m = G.machineById(id);
    expect(m, `stage[${i}] -> ${id}`).toBeDefined();
    expect(m!.slot).toBe(i);
  });
  // every kit/machine belongs to a known shipment
  for (const k of S.kits) expect(G.shipmentById(k.shipmentId)).toBeDefined();
  for (const m of S.machines) expect(G.shipmentById(m.shipmentId)).toBeDefined();
  // a building workcentre always has its machine
  for (const w of S.wcs) if (w.state === 'building') expect(G.machineById(w.machineId)).toBeDefined();
  // trucks: one outbound truck per bay at most while docked
  const docked = S.trucks.filter((t) => t.kind === 'out' && t.state === 'docked').map((t) => t.dock);
  expect(new Set(docked).size).toBe(docked.length);
  expect(S.skip.count).toBeLessThanOrEqual(S.skip.cap);
  for (const wc of S.wcs) expect(wc.progress).toBeLessThanOrEqual(1);
}

/** compact fingerprint of a finished shift */
function fingerprint() {
  const S = G.S;
  return JSON.stringify({
    t: S.t.toFixed(3), revenue: S.revenue.toFixed(3), costs: S.costs.toFixed(3), stats: S.stats,
    ships: S.shipments.map((s) => [s.id, s.model, s.stage, s.paid]),
  });
}

describe('shift simulation', () => {
  it('replays identically for the same seed and modifiers', () => {
    const mods = rollModifiers(20261026);
    runShift({ seed: 20261026, mods });
    const a = fingerprint();
    runShift({ seed: 20261026, mods });
    expect(fingerprint()).toBe(a);
  });

  it('different seeds give different shifts', () => {
    runShift({ seed: 1 });
    const a = fingerprint();
    runShift({ seed: 2 });
    expect(fingerprint()).not.toBe(a);
  });

  it('an autopilot shift completes, ships orders and scores', () => {
    const r = runShift({ seed: 1 });
    expect(G.S.over).toBe(true);
    expect(G.S.running).toBe(false);
    expect(G.S.t).toBeGreaterThanOrEqual(SHIFT_SEC);
    expect(G.S.stats.shipped).toBeGreaterThan(0);
    expect(['S', 'A', 'B', 'C', 'D']).toContain(r.grade);
    expect(r.onTimePct).toBeGreaterThanOrEqual(0);
    expect(r.onTimePct).toBeLessThanOrEqual(1);
  });

  it('an idle player (no input) still reaches the end of the shift', () => {
    const r = runShift({ seed: 7, play: false });
    expect(G.S.over).toBe(true);
    expect(G.S.stats.shipped).toBe(0);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('buying every upgrade as soon as affordable never breaks the sim', () => {
    runShift({ seed: 3, buy: true });
    expect(G.S.forklifts.length).toBeLessThanOrEqual(4);
  });

  it.each(MODIFIERS.map((m) => m.id))('runs a full shift under modifier %s', (id) => {
    runShift({ seed: 11, mods: [id] });
    expect(G.S.over).toBe(true);
  });

  it('runs many rolled daily-style seeds without errors', () => {
    for (let seed = 20261001; seed < 20261009; seed++) runShift({ seed, mods: rollModifiers(seed) });
  });

  it('tick is a no-op when paused or before a shift starts', () => {
    G.startShift(5);
    G.setPaused(true);
    const t = G.S.t;
    G.tick(1);
    expect(G.S.t).toBe(t);
    G.setPaused(false);
    G.tick(1);
    expect(G.S.t).toBeCloseTo(t + 1);
  });
});

describe('detrash and goods receipt rules', () => {
  const firstKit = () => {
    G.startShift(42);
    G.drainEvents();
    const k = G.waitingKits()[0];
    expect(k).toBeDefined();
    return k;
  };

  it('starts with two pre-received kits in receiving', () => {
    G.startShift(42);
    expect(G.S.kits.filter((k) => k.state === 'waiting')).toHaveLength(2);
    expect(G.S.recv.filter(Boolean)).toHaveLength(2);
  });

  it('enforces layer order (straps before wrap before card before foam)', () => {
    const k = firstKit();
    const foam = k.pieces.find((p) => p.kind === 'foam')!;
    const r = G.removePiece(k.id, foam.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('order');
    const strap = k.pieces.find((p) => p.kind === 'strap')!;
    expect(G.removePiece(k.id, strap.id).ok).toBe(true);
  });

  it('a fully detrashed kit moves to scan; a clean scan posts an accurate GR', () => {
    const k = firstKit();
    for (const p of [...k.pieces].sort((a, b) => a.layer - b.layer)) G.removePiece(k.id, p.id);
    expect(k.state).toBe('scan');
    for (const p of k.parts) G.scanPart(k.id, p.id, true);
    for (const p of G.grSummary(k).offBom) G.quarantinePart(k.id, p.id);
    const costs = G.S.costs;
    expect(G.postGR(k.id)).toBe(true);
    expect(k.state).toBe('clean');
    expect(k.wrongIn).toBe(0);
    if (k.exception === 'none') {
      expect(G.S.stats.grAccurate).toBe(1);
      expect(G.S.costs).toBe(costs);
    }
  });

  it('posting GR before scanning books a false shortage and costs money', () => {
    const k = firstKit();
    for (const p of [...k.pieces].sort((a, b) => a.layer - b.layer)) G.removePiece(k.id, p.id);
    const costs = G.S.costs;
    G.postGR(k.id);
    expect(G.S.stats.falseShort).toBeGreaterThan(0);
    expect(G.S.costs).toBeGreaterThan(costs);
  });

  it('a full compactor blocks detrashing until emptied', () => {
    const k = firstKit();
    G.S.skip.count = G.S.skip.cap;
    const strap = k.pieces.find((p) => p.kind === 'strap')!;
    const r = G.removePiece(k.id, strap.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('skip');
  });
});

describe('ops and workcentres', () => {
  it('workcentres are FISE, Centris and MDP', () => {
    G.startShift(42);
    expect(G.S.wcs.map((w) => w.id)).toEqual(['FISE', 'Centris', 'MDP']);
  });
  it('every kit gets an op number from the routing list, deterministically per seed', () => {
    const opsFor = (seed: number) => {
      runShift({ seed, play: false });
      return G.S.kits.map((k) => [k.id, k.op] as const);
    };
    const a = opsFor(7);
    expect(a.length).toBeGreaterThan(0);
    for (const [, op] of a) expect(OPS).toContain(op);
    expect(opsFor(7)).toEqual(a);
    // across many kits, more than one op number shows up
    const seen = new Set<number>();
    for (let s = 1; s <= 5; s++) for (const [, op] of opsFor(s)) seen.add(op);
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('modifiers', () => {
  it('roll deterministically: two distinct, non-conflicting modifiers', () => {
    for (let seed = 0; seed < 500; seed++) {
      const mods = rollModifiers(seed);
      expect(rollModifiers(seed)).toEqual(mods);
      expect(mods).toHaveLength(2);
      expect(mods[0]).not.toBe(mods[1]);
      const first = MODIFIERS.find((m) => m.id === mods[0])!;
      expect(first.kind).not.toBe('boon');
      expect(first.conflicts ?? []).not.toContain(mods[1]);
    }
  });

  it('tuneFor never mutates the shared TUNE defaults', () => {
    const before = JSON.stringify(TUNE);
    for (const m of MODIFIERS) tuneFor([m.id]);
    tuneFor(MODIFIERS.map((m) => m.id));
    expect(JSON.stringify(TUNE)).toBe(before);
  });
});
