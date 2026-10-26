/**
 * Dev-only: `?demo=60` starts a shift and fast-forwards 60s with a simple
 * autopilot; `&kit=1` also opens the detrash view. Handy for screenshots.
 */
import * as G from '../game/sim';
import { beginShift, makePlan, openDispatch, openKit, useUi } from '../game/store';

export function runDemo() {
  const q = new URLSearchParams(location.search);
  const secs = Number(q.get('demo'));
  if (!q.has('demo')) return;
  // fixed seed keeps screenshots stable; `&seed=N` picks another shift
  beginShift(makePlan(false, Number(q.get('seed')) || 1));
  const dt = 1 / 30;
  let busy = 0;
  for (let t = 0; t < secs; t += dt) {
    G.tick(dt);
    G.drainEvents();
    for (const sh of G.S.shipments) {
      if (G.canShip(sh) && !q.get('dispatch')) {
        for (const st of ['serial', 'trailer', 'seal'] as const) G.giStep(sh.id, st);
        G.shipOut(sh.id);
      }
      const m = G.machineById(sh.machineId);
      if (!sh.truckId && m && m.progress > 0.6) G.bookTruck(sh.id);
    }
    if (G.S.skip.count > G.S.skip.cap * 0.8) G.emptySkip();
    for (const w of G.S.wcs) if (w.down) G.repairWC(w.idx);
    busy -= dt;
    if (busy <= 0) {
      const k = G.waitingKits()[0];
      if (k) {
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
      busy = 0.6;
    }
  }
  G.closeDetrash();
  if (q.get('kit') === 'scan') {
    // finish detrashing one kit, plant a lookalike part and scan most of it
    const k = G.waitingKits().find((x) => x.state === 'waiting') ?? G.waitingKits()[0];
    if (k) {
      G.openDetrash(k.id);
      for (const p of k.pieces) if (!p.removed) G.removePiece(k.id, p.id);
      if (k.exception === 'none' && k.parts[2]) { k.parts[2].mat = k.parts[2].mat.replace(/\d$/, (d) => String((+d + 5) % 10)); k.exception = 'wrong'; }
      for (const p of k.parts.slice(0, -1)) G.scanPart(k.id, p.id, true);
      G.drainEvents();
      openKit(k.id);
    }
  } else if (q.get('dispatch')) {
    const sh = G.S.shipments.find((x) => G.canShip(x));
    if (sh) {
      G.giStep(sh.id, 'serial');
      openDispatch(sh.id);
    }
  } else if (q.get('kit')) {
    const k = G.waitingKits()[0];
    if (k) openKit(k.id);
  }
  if (q.get('admin')) {
    void import('../game/admin').then((a) => {
      a.unlockAdmin(a.ADMIN_PIN);
      a.setFlag('autoDetrash', true);
      void import('../ui/AdminPanel').then((p) => p.openAdmin());
    });
  }
  useUi.getState().bump();
}
