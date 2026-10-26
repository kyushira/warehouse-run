import { MODELS } from '../game/content';
import { S, kitById, kitProgress, machineById, truckById, canShip } from '../game/sim';
import type { Kit, Shipment, Tone, Truck, Workcentre } from '../game/sim';
import { mmss } from './format';

export type Status = { label: string; tone: Tone | 'muted' | 'violet' };

export function kitStatus(k: Kit): Status {
  if (k.state === 'inbound') return { label: 'Inbound', tone: 'muted' };
  if (k.state === 'waiting') {
    if (k.by === 'operator') return { label: `Operator ${Math.round(kitProgress(k) * 100)}%`, tone: 'violet' };
    if (k.by === 'player') return { label: 'Detrashing', tone: 'info' };
    return { label: kitProgress(k) > 0 ? `Wrapped ${Math.round(kitProgress(k) * 100)}%` : 'Wrapped', tone: 'warn' };
  }
  if (k.state === 'scan') {
    const offBom = k.parts.some((p) => p.scanned && !p.quarantined && !k.bom.some((l) => l.mat === p.mat));
    return offBom ? { label: 'ERP exception', tone: 'bad' } : { label: 'Scan GR', tone: 'info' };
  }
  if (k.state === 'clean') return { label: k.priority ? 'Priority · queued' : 'Clean · queued', tone: 'good' };
  return { label: 'To workcentre', tone: 'info' };
}

export function wcStatus(w: Workcentre): Status {
  if (!w.unlocked) return { label: 'Locked', tone: 'muted' };
  if (w.down) return w.repairT > 0 ? { label: `Repairing ${mmss(w.repairT)}`, tone: 'warn' } : { label: 'Breakdown', tone: 'bad' };
  if (w.state === 'building') return { label: `Building ${Math.round(w.progress * 100)}%`, tone: 'info' };
  if (w.state === 'awaiting') return { label: 'Kit en route', tone: 'info' };
  if (w.state === 'blocked') return { label: 'Done · pickup', tone: 'good' };
  return { label: 'Idle', tone: 'muted' };
}

export function truckStatus(t: Truck): Status {
  if (t.state === 'enroute') return t.gateWait ? { label: 'Gate queue', tone: 'warn' } : { label: `ETA ${mmss(t.eta)}`, tone: 'info' };
  if (t.state === 'departing') return { label: 'Departing', tone: 'muted' };
  if (t.loading) return { label: 'Loading', tone: 'good' };
  if (t.kind === 'in') return { label: 'Unloading', tone: 'info' };
  return t.detention > 0 ? { label: `Detention ${'$' + Math.round(t.detention)}`, tone: 'bad' } : { label: 'Docked', tone: 'good' };
}

/** rough seconds of work still ahead of a shipment, for the "at risk" chip */
function remainingEstimate(sh: Shipment) {
  const build = MODELS[sh.model].buildSec;
  const m = machineById(sh.machineId);
  switch (sh.stage) {
    case 'confirmed': return 18 + 12 + 8 + build + 10;
    case 'received': return 12 + 8 + build + 10;
    case 'detrashed': return 6 + 8 + build + 10;
    case 'scanned': return 8 + build + 10;
    case 'building': return (1 - (m?.progress ?? 0)) * build + 10;
    case 'staged': {
      const tr = truckById(sh.truckId);
      return tr ? (tr.state === 'docked' ? 5 : tr.eta + 5) : S.tune.truckEta + 5;
    }
    default: return 0;
  }
}

export function shipmentHealth(sh: Shipment): Status {
  if (sh.stage === 'shipped' || sh.stage === 'delivered') return sh.late ? { label: 'Shipped late', tone: 'warn' } : { label: 'On time', tone: 'good' };
  const left = sh.due - S.t;
  if (left < 0) return { label: `${mmss(-left)} late`, tone: 'bad' };
  if (left < remainingEstimate(sh)) return { label: 'At risk', tone: 'warn' };
  return { label: 'On track', tone: 'good' };
}

export type Action =
  | { kind: 'detrash'; kitId: string }
  | { kind: 'book' }
  | { kind: 'ship' }
  | { kind: 'scan'; kitId: string }
  | { kind: 'wait'; label: string };

/** what the manager should do next for a shipment (primary first) */
export function shipmentActions(sh: Shipment): Action[] {
  const out: Action[] = [];
  const kit = kitById(sh.kitId);
  const tr = truckById(sh.truckId);
  if (canShip(sh)) return [{ kind: 'ship' }];
  if (kit && kit.state === 'waiting') out.push({ kind: 'detrash', kitId: kit.id });
  if (kit && kit.state === 'scan') out.push({ kind: 'scan', kitId: kit.id });
  if (!sh.truckId && sh.stage !== 'shipped' && sh.stage !== 'delivered') out.push({ kind: 'book' });
  if (!out.length) {
    if (sh.stage === 'delivered') out.push({ kind: 'wait', label: 'Delivered' });
    else if (sh.stage === 'shipped') out.push({ kind: 'wait', label: 'In transit' });
    else if (sh.stage === 'loading') out.push({ kind: 'wait', label: 'Loading…' });
    else if (sh.stage === 'staged' && tr) out.push({ kind: 'wait', label: tr.state === 'enroute' ? `Truck ETA ${mmss(tr.eta)}` : 'Truck docking' });
    else if (sh.stage === 'confirmed') out.push({ kind: 'wait', label: 'Kit inbound' });
    else out.push({ kind: 'wait', label: sh.stage === 'building' ? 'Building…' : 'Queued for build' });
  }
  return out;
}
