/**
 * KitFlow simulation: pure TS, no React. The UI reads `S` directly and the
 * 3D scene samples entity positions every frame.
 *
 * ORDER FLOW
 *   confirmed -(inbound truck + forklift unload)-> received
 *   received  -(player/operator detrash)->         detrashed
 *   detrashed -(ERP goods receipt: scan parts vs BOM, quarantine wrong parts, post GR)-> scanned
 *   scanned   -(forklift to free WC)->             building
 *   building  -(WC progress; may break down)->     staged (forklift to staging lane)
 *   staged    -(truck docked + ERP goods issue: serial, trailer, seal, post)-> loading -> shipped
 *
 * DETRASH LAYERS (outer -> inner): strap -> wrap -> card -> foam; parts must not be touched.
 * GR: posting early books unscanned parts as short (expedite wasted); unquarantined wrong parts
 *     reach the workcentre and cost rework.
 */
import { CARRIERS, CITIES, CUSTOMERS, MODEL_LIST, MODELS, OPS, SHIFT_SEC, UPGRADES, WC_NAMES } from './content';
import type { ModelId, Tune, UpgradeId } from './content';
import { tuneFor } from './modifiers';
import type { ModifierId } from './modifiers';
import {
  AISLE_Z, BACK_LANE_Z, FORK_HOME, IN_DOORS, OUT_DOCKS, RECV_SLOTS, STAGE_SLOTS, WC_POS,
  dockDrop, inPick, route, wcIn, wcOut,
} from './layout';
import type { Vec } from './layout';
import { mulberry } from './rng';

/* ---------------------------------- types ---------------------------------- */

export type Stage = 'confirmed' | 'received' | 'detrashed' | 'scanned' | 'building' | 'staged' | 'loading' | 'shipped' | 'delivered';
export const STAGES: Stage[] = ['confirmed', 'received', 'detrashed', 'scanned', 'building', 'staged', 'shipped'];
export const STAGE_LABEL: Record<Stage, string> = {
  confirmed: 'Order confirmed', received: 'Kit received', detrashed: 'Detrashed', scanned: 'GR posted', building: 'Building',
  staged: 'Staged', loading: 'Loading', shipped: 'Shipped', delivered: 'Delivered',
};

export interface Shipment {
  id: string; model: ModelId; city: string; customer: string;
  created: number; due: number; value: number; rush: boolean;
  kitId: string; machineId: string | null; truckId: string | null;
  stage: Stage; stageAt: Partial<Record<Stage, number>>;
  late: boolean; paid: number; damage: number;
  gi: { serial: boolean; trailer: boolean; seal: string | null };
}

export type TrashKind = 'strap' | 'wrap' | 'card' | 'foam';
export const LAYERS: TrashKind[] = ['strap', 'wrap', 'card', 'foam'];
export const LAYER_LABEL: Record<TrashKind, string> = { strap: 'Straps', wrap: 'Stretch wrap', card: 'Cardboard', foam: 'Dunnage' };
export const LAYER_HINT: Record<TrashKind, string> = {
  strap: 'Swipe across the yellow straps to cut them',
  wrap: 'Peel the stretch wrap bands',
  card: 'Lift the lid, then the sleeve',
  foam: 'Pull the foam dunnage. Don’t touch the parts!',
};

/** p: geometry params interpreted by the detrash scene (see KitModel). */
export interface Piece { id: number; kind: TrashKind; layer: number; removed: boolean; p: number[] }
export interface Part {
  id: number; shape: 'box' | 'cyl'; x: number; y: number; z: number;
  w: number; h: number; d: number; tone: 'm' | 'g' | 'd'; axis: 'y' | 'x' | 'z'; damaged: boolean;
  /** material number printed on its barcode label */
  mat: string; scanned: boolean; quarantined: boolean;
}
export interface BomLine { mat: string; desc: string; qty: number; got: number }

export type KitState = 'inbound' | 'carried' | 'waiting' | 'scan' | 'clean' | 'toWC';
export interface Kit {
  id: string; shipmentId: string; model: ModelId; state: KitState; slot: number; pos: Vec;
  pieces: Piece[]; parts: Part[]; damage: number;
  by: 'player' | 'operator' | null; opT: number; priority: boolean;
  /** New Hire Day: whether the operator's nick roll has happened for this kit */
  opRolled: boolean;
  receivedAt: number; startedAt: number;
  /** routing operation number the kit is issued against (one of OPS) */
  op: number;
  bom: BomLine[]; exception: 'none' | 'wrong' | 'short'; po: string; grDoc: string | null; shortage: number; wrongIn: number;
}

export type MachineState = 'building' | 'done' | 'toStage' | 'carried' | 'staged' | 'loading';
export interface Machine { id: string; shipmentId: string; model: ModelId; state: MachineState; wc: number; slot: number; pos: Vec; progress: number; serial: string }

export type WcState = 'idle' | 'awaiting' | 'building' | 'blocked';
export interface Workcentre {
  id: string; idx: number; unlocked: boolean; state: WcState; down: boolean; repairT: number; broke: boolean;
  kitId: string | null; machineId: string | null; model: ModelId | null; progress: number; buildSec: number;
}

export type TruckState = 'enroute' | 'docked' | 'departing' | 'gone';
export interface Truck {
  id: string; carrier: string; kind: 'in' | 'out'; shipmentId: string; kitId: string | null;
  dock: number; state: TruckState; eta: number; anim: number; dockedAt: number;
  detention: number; tasked: boolean; loading: boolean; gateWait: boolean; warned: boolean; trailer: string;
}

export type TaskKind = 'unload' | 'toWC' | 'toStage' | 'load';
export interface Task { id: number; kind: TaskKind; pick: Vec; drop: Vec; ref: string; aux: number; truckId?: string; lane: number; label: string; created: number }

export type ForkState = 'idle' | 'home' | 'toPick' | 'pick' | 'toDrop' | 'drop';
export interface Forklift {
  id: string; home: Vec; pos: Vec; yaw: number; state: ForkState; task: Task | null;
  path: Vec[]; timer: number; carry: { kind: 'kit' | 'machine'; id: string } | null; lift: number;
}

export type Tone = 'info' | 'good' | 'warn' | 'bad';
export type Sfx = 'order' | 'drop' | 'clean' | 'ready' | 'ship' | 'alarm' | 'horn' | 'crack' | 'buy' | 'deny' | 'done' | 'end' | 'scan' | 'layer';
export interface SimEvent { text?: string; tone?: Tone; sfx?: Sfx }

export interface Stats {
  orders: number; shipped: number; onTime: number; late: number; kitsDetrashed: number; pieces: number;
  damage: number; detention: number; repairs: number; breakdowns: number; detrashTime: number; playerKits: number;
  grPosted: number; grAccurate: number; falseShort: number; wrongIn: number; caught: number; scans: number;
}

export interface SimState {
  seed: number; daily: boolean; mods: ModifierId[]; tune: Tune;
  rng: () => number; t: number; running: boolean; paused: boolean; over: boolean;
  revenue: number; costs: number; spent: number; startBudget: number;
  shipments: Shipment[]; kits: Kit[]; machines: Machine[]; trucks: Truck[];
  wcs: Workcentre[]; forklifts: Forklift[]; tasks: Task[];
  recv: (string | null)[]; stage: (string | null)[];
  skip: { count: number; cap: number; emptyT: number };
  up: Record<UpgradeId, number>;
  nextOrder: number; seq: { ship: number; kit: number; truck: number; mach: number; task: number; piece: number; doc: number };
  playerKit: string | null; opKit: string | null;
  events: SimEvent[]; stats: Stats; warned: Record<string, number>;
}

/* --------------------------------- state ----------------------------------- */

const fresh = (seed: number, mods: ModifierId[] = [], daily = false, tune = tuneFor(mods)): SimState => ({
  seed, daily, mods, tune, rng: mulberry(seed), t: 0, running: false, paused: false, over: false,
  revenue: 0, costs: 0, spent: 0, startBudget: tune.startBudget,
  shipments: [], kits: [], machines: [], trucks: [], tasks: [],
  wcs: WC_POS.map((_, i) => ({
    id: WC_NAMES[i] ?? `WC-${i + 1}`, idx: i, unlocked: i < 2, state: 'idle', down: false, repairT: 0, broke: false,
    kitId: null, machineId: null, model: null, progress: 0, buildSec: 1,
  })),
  forklifts: [0, 1].map((i) => makeForklift(i)),
  recv: RECV_SLOTS.map(() => null), stage: STAGE_SLOTS.map(() => null),
  skip: { count: 0, cap: tune.skipCap, emptyT: 0 },
  up: { wc3: 0, forklift: 0, overtime: 0, operator: tune.startOperator, cutter: 0, skip: 0, rfid: 0 },
  nextOrder: 9, seq: { ship: 78440, kit: 1040, truck: 2050, mach: 300, task: 0, piece: 0, doc: 5000123400 },
  playerKit: null, opKit: null, events: [], warned: {},
  stats: { orders: 0, shipped: 0, onTime: 0, late: 0, kitsDetrashed: 0, pieces: 0, damage: 0, detention: 0, repairs: 0, breakdowns: 0, detrashTime: 0, playerKits: 0, grPosted: 0, grAccurate: 0, falseShort: 0, wrongIn: 0, caught: 0, scans: 0 },
});

function makeForklift(i: number): Forklift {
  const h = FORK_HOME[i];
  return { id: `FL-0${i + 1}`, home: h, pos: { ...h }, yaw: Math.PI, state: 'idle', task: null, path: [], timer: 0, carry: null, lift: 0 };
}

export let S: SimState = fresh(1);

/* -------------------------------- helpers ---------------------------------- */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(S.rng() * arr.length)];
const emit = (text: string | undefined, tone: Tone = 'info', sfx?: Sfx) => S.events.push({ text, tone, sfx });
const warnOnce = (key: string, text: string, every = 12) => {
  if (S.t - (S.warned[key] ?? -99) < every) return;
  S.warned[key] = S.t;
  emit(text, 'warn', 'deny');
};

export const shipmentById = (id: string | null | undefined) => S.shipments.find((s) => s.id === id);
export const kitById = (id: string | null | undefined) => S.kits.find((k) => k.id === id);
export const machineById = (id: string | null | undefined) => S.machines.find((m) => m.id === id);
export const truckById = (id: string | null | undefined) => S.trucks.find((t) => t.id === id);

export const net = () => Math.round(S.revenue - S.costs);
export const cash = () => Math.floor(S.startBudget + S.revenue - S.costs - S.spent);
export const progress = () => Math.min(1, S.t / SHIFT_SEC);

function setStage(sh: Shipment, st: Stage) {
  sh.stage = st;
  sh.stageAt[st] = S.t;
}

export const dockClosed = (i: number) => S.tune.closedDocks.includes(i);
export function dockBusy(i: number) {
  return dockClosed(i) || S.trucks.some((t) => t.kind === 'out' && t.dock === i && (t.state !== 'departing' || t.anim < 0.35));
}
export const freeDocks = () => OUT_DOCKS.map((_, i) => i).filter((i) => !dockBusy(i));
const inDoorBusy = (i: number) => S.trucks.some((t) => t.kind === 'in' && t.dock === i && (t.state !== 'departing' || t.anim < 0.3));

export const remainingByLayer = (k: Kit) => LAYERS.map((kind) => k.pieces.filter((p) => p.kind === kind && !p.removed).length);
export const currentLayer = (k: Kit): TrashKind | null => {
  const r = k.pieces.filter((p) => !p.removed);
  if (!r.length) return null;
  return LAYERS[Math.min(...r.map((p) => p.layer))];
};
export const kitProgress = (k: Kit) => k.pieces.filter((p) => p.removed).length / Math.max(1, k.pieces.length);
/** kits that need the player: detrash ('waiting') or ERP goods receipt ('scan') */
export const waitingKits = () =>
  S.kits.filter((k) => k.state === 'waiting' || k.state === 'scan').sort((a, b) => (shipmentById(a.shipmentId)?.due ?? 0) - (shipmentById(b.shipmentId)?.due ?? 0));

/* ------------------------------ kit generation ----------------------------- */

const CRATE = { w: 2.4, d: 1.8, base: 0.24, h: 1.3 };
export const KIT_CRATE = CRATE;

type PartSpec = [Part['shape'], number, number, number, number, number, number, Part['tone'], Part['axis'], string, string];
const PART_SETS: Record<ModelId, PartSpec[]> = {
  CX40: [
    ['box', 0, 0.24, -0.62, 2.1, 0.16, 0.16, 'g', 'y', 'CX-RAIL-01', 'Side rail'],
    ['box', 0, 0.24, 0.62, 2.1, 0.16, 0.16, 'g', 'y', 'CX-RAIL-01', 'Side rail'],
    ['cyl', -0.62, 0.4, 0, 0.5, 0.5, 0.7, 'd', 'z', 'CX-MTR-200', 'Drive motor'],
    ['box', 0.45, 0.4, 0, 0.95, 0.45, 0.75, 'm', 'y', 'CX-BLT-60', 'Belt module'],
    ['box', 0.45, 0.85, 0.05, 0.5, 0.3, 0.4, 'g', 'y', 'CX-GBX-10', 'Gearbox'],
  ],
  FM200: [
    ['cyl', -0.45, 0.24, 0, 0.8, 1.0, 0.8, 'm', 'y', 'FM-TNK-80', 'Product tank'],
    ['box', 0.55, 0.24, -0.35, 0.6, 0.5, 0.55, 'g', 'y', 'FM-PMP-30', 'Dosing pump'],
    ['box', 0.55, 0.24, 0.45, 0.8, 0.2, 0.3, 'd', 'y', 'FM-NZL-04', 'Nozzle bar'],
    ['box', 0.55, 0.74, -0.35, 0.5, 0.45, 0.14, 'm', 'y', 'FM-HMI-07', 'HMI panel'],
  ],
  PK9: [
    ['box', -0.4, 0.24, 0, 1.0, 0.95, 1.1, 'm', 'y', 'PK-CAB-90', 'Cabinet frame'],
    ['box', 0.55, 0.24, -0.4, 0.7, 0.18, 0.7, 'g', 'y', 'PK-INF-20', 'Infeed tray'],
    ['cyl', 0.6, 0.24, 0.45, 0.42, 0.42, 0.42, 'd', 'y', 'PK-MTR-15', 'Servo motor'],
    ['box', 0.55, 0.42, -0.4, 0.5, 0.4, 0.5, 'm', 'y', 'PK-SLD-05', 'Sealer head'],
  ],
  RB5: [
    ['cyl', -0.5, 0.24, 0, 0.9, 0.35, 0.9, 'g', 'y', 'RB-BSE-50', 'Robot base'],
    ['box', -0.5, 0.59, 0, 0.26, 0.7, 0.26, 'm', 'y', 'RB-ARM-A1', 'Arm link A'],
    ['box', 0.35, 0.24, 0.35, 0.95, 0.24, 0.24, 'm', 'y', 'RB-ARM-B2', 'Arm link B'],
    ['box', 0.55, 0.24, -0.42, 0.45, 0.6, 0.4, 'g', 'y', 'RB-CTL-09', 'Controller'],
    ['box', 0.85, 0.48, 0.35, 0.3, 0.28, 0.3, 'd', 'y', 'RB-GRP-03', 'Gripper'],
  ],
};
const PART_DESC = new Map(Object.values(PART_SETS).flat().map((p) => [p[9], p[10]]));
export const partDesc = (mat: string) => PART_DESC.get(mat) ?? 'Unknown material';

/** same family, last digit changed: CX-MTR-200 -> CX-MTR-260 (easy to misread) */
const lookalike = (mat: string) => mat.replace(/(\d)(?=\D*$)/, (d) => String((Number(d) + 2 + Math.floor(S.rng() * 6)) % 10));

function makePieces(model: ModelId, parts: Part[]): Piece[] {
  const prog = progress(), r = S.rng, out: Piece[] = [];
  const add = (kind: TrashKind, p: number[]) => out.push({ id: ++S.seq.piece, kind, layer: LAYERS.indexOf(kind), removed: false, p });
  const straps = 2 + (r() < 0.35 + prog * 0.45 ? 1 : 0) + (prog > 0.55 && r() < 0.45 ? 1 : 0);
  for (let i = 0; i < straps; i++) {
    const axis = i < 2 ? 0 : 1; // loops across x first, then across z
    const n = axis === 0 ? Math.min(2, straps) : straps - 2;
    const k = axis === 0 ? i : i - 2;
    const span = axis === 0 ? CRATE.w : CRATE.d;
    add('strap', [axis, ((k + 1) / (n + 1) - 0.5) * span * 0.9]);
  }
  const extraBands = Math.ceil(S.tune.extraTrash / 3);
  const bands = 2 + extraBands + (r() < 0.3 + prog * 0.5 ? 1 : 0) + (prog > 0.5 && r() < 0.4 ? 1 : 0);
  for (let i = 0; i < bands; i++) add('wrap', [i, bands]);
  add('card', [0]); // lid
  add('card', [1]); // sleeve
  const foams = 3 + S.tune.extraTrash - extraBands + Math.floor(r() * (2 + prog * 3));
  const spots: number[][] = [];
  for (let tries = 0; spots.length < foams && tries < 80; tries++) {
    const x = (r() - 0.5) * (CRATE.w - 0.5), z = (r() - 0.5) * (CRATE.d - 0.45);
    if (spots.some((s) => Math.hypot(s[0] - x, s[2] - z) < 0.42)) continue;
    spots.push([x, topAt(parts, x, z), z, r() * Math.PI, 0.85 + r() * 0.35]);
  }
  for (const s of spots) add('foam', s);
  void model;
  return out;
}

function topAt(parts: Part[], x: number, z: number) {
  let y = CRATE.base;
  for (const p of parts) if (Math.abs(x - p.x) < p.w / 2 + 0.12 && Math.abs(z - p.z) < p.d / 2 + 0.1) y = Math.max(y, p.y + p.h);
  return y;
}

function makeKit(shipmentId: string, model: ModelId): Kit {
  let parts: Part[] = PART_SETS[model].map((s, i) => ({
    id: i, shape: s[0], x: s[1], y: s[2], z: s[3], w: s[4], h: s[5], d: s[6], tone: s[7], axis: s[8], damaged: false,
    mat: s[9], scanned: false, quarantined: false,
  }));
  const bom: BomLine[] = [];
  for (const p of parts) {
    const line = bom.find((l) => l.mat === p.mat);
    if (line) line.qty++;
    else bom.push({ mat: p.mat, desc: partDesc(p.mat), qty: 1, got: 0 });
  }
  // supplier errors get more common as the shift heats up
  let exception: Kit['exception'] = 'none';
  if (S.t > 20 && S.rng() < S.tune.exceptionChance[0] + progress() * S.tune.exceptionChance[1]) {
    const victim = parts[1 + Math.floor(S.rng() * (parts.length - 1))];
    if (S.rng() < 0.55) {
      exception = 'wrong';
      victim.mat = lookalike(victim.mat);
    } else {
      exception = 'short';
      parts = parts.filter((p) => p !== victim);
    }
  }
  const kitNo = ++S.seq.kit;
  return {
    id: `KIT-${kitNo}`, shipmentId, model, state: 'inbound', slot: -1, pos: { x: 0, z: 0 }, op: opFor(kitNo),
    parts, pieces: makePieces(model, parts), damage: 0, by: null, opT: 0, opRolled: false, priority: false, receivedAt: 0, startedAt: 0,
    bom, exception, po: `45000${12000 + kitNo}`, grDoc: null, shortage: 0, wrongIn: 0,
  };
}

/**
 * Op number for a kit. Drawn from its own seeded stream (seed + kit number), not
 * S.rng, so adding it doesn't shift any existing roll: same seed, same shift.
 */
function opFor(kitNo: number) {
  return OPS[Math.floor(mulberry((S.seed ^ Math.imul(kitNo, 0x9e3779b1)) >>> 0)() * OPS.length)];
}

/* --------------------------------- orders ---------------------------------- */

function spawnOrder(preReceived = false, forceRush?: boolean) {
  const avail = MODEL_LIST.filter((m) => m.unlockAt * S.tune.unlockMul <= S.t);
  const m = pick(avail);
  const rush = forceRush ?? (!preReceived && S.t > 45 && S.rng() < S.tune.rushChance);
  S.seq.ship += 3 + Math.floor(S.rng() * 14);
  const id = `SHP-${S.seq.ship}`;
  const due = S.t + (rush ? 64 : 86) * S.tune.dueMul + m.buildSec + S.rng() * 16 + (preReceived ? 12 : 0);
  const sh: Shipment = {
    id, model: m.id, city: pick(CITIES), customer: pick(CUSTOMERS), created: S.t, due,
    value: Math.round((m.value * S.tune.valueMul * (rush ? S.tune.rushPay : 1)) / 10) * 10, rush, kitId: '', machineId: null, truckId: null,
    stage: 'confirmed', stageAt: { confirmed: S.t }, late: false, paid: 0, damage: 0,
    gi: { serial: false, trailer: false, seal: null },
  };
  const kit = makeKit(id, m.id);
  sh.kitId = kit.id;
  S.shipments.push(sh);
  S.kits.push(kit);
  S.stats.orders++;
  if (preReceived) {
    const slot = S.recv.findIndex((x) => x === null);
    S.recv[slot] = kit.id;
    kit.slot = slot;
    kit.state = 'waiting';
    kit.pos = { ...RECV_SLOTS[slot] };
    kit.receivedAt = S.t;
    setStage(sh, 'received');
    return;
  }
  const [a, b] = S.tune.inboundEta;
  S.trucks.push(newTruck('in', id, kit.id, -1, lerp(a, b, S.rng())));
  emit(`${rush ? 'RUSH order' : 'New order'} ${id} · ${m.short} → ${sh.city}`, rush ? 'warn' : 'info', 'order');
}

function newTruck(kind: 'in' | 'out', shipmentId: string, kitId: string | null, dock: number, eta: number): Truck {
  return {
    id: `TRK-${++S.seq.truck}`, carrier: pick(CARRIERS), kind, shipmentId, kitId, dock, state: 'enroute', eta, anim: 0,
    dockedAt: 0, detention: 0, tasked: false, loading: false, gateWait: false, warned: false,
    trailer: `TRL-${4100 + Math.floor(S.rng() * 880)}`,
  };
}

/* ---------------------------------- tasks ---------------------------------- */

const TASK_PRI: Record<TaskKind, number> = { load: 3, toStage: 2, unload: 1, toWC: 1 };
function addTask(t: Omit<Task, 'id' | 'created'>) {
  S.tasks.push({ ...t, id: ++S.seq.task, created: S.t });
}

function dispatch() {
  for (const tr of S.trucks) {
    if (tr.kind !== 'in' || tr.state !== 'docked' || tr.tasked) continue;
    const slot = S.recv.findIndex((x) => x === null);
    if (slot < 0) {
      warnOnce('recvFull', 'Receiving is full. Detrash kits to free a slot.');
      continue;
    }
    const kit = kitById(tr.kitId)!;
    S.recv[slot] = kit.id;
    kit.slot = slot;
    tr.tasked = true;
    addTask({ kind: 'unload', pick: inPick(tr.dock), drop: RECV_SLOTS[slot], ref: kit.id, aux: slot, truckId: tr.id, lane: BACK_LANE_Z, label: `Unloading ${kit.id}` });
  }
  for (const wc of S.wcs) {
    if (!wc.unlocked || wc.state !== 'idle') continue;
    const q = S.kits
      .filter((k) => k.state === 'clean')
      .sort((a, b) => Number(b.priority) - Number(a.priority) || (shipmentById(a.shipmentId)!.due - shipmentById(b.shipmentId)!.due));
    const kit = q[0];
    if (!kit) break;
    kit.state = 'toWC';
    wc.state = 'awaiting';
    wc.kitId = kit.id;
    wc.model = kit.model;
    addTask({ kind: 'toWC', pick: RECV_SLOTS[kit.slot], drop: wcIn(wc.idx), ref: kit.id, aux: wc.idx, lane: AISLE_Z, label: `${kit.id} → ${wc.id}` });
  }
  for (const m of S.machines) {
    if (m.state !== 'done') continue;
    const slot = S.stage.findIndex((x) => x === null);
    if (slot < 0) {
      warnOnce('stageFull', 'Staging lanes are full. Ship machines out!');
      continue;
    }
    S.stage[slot] = m.id;
    m.slot = slot;
    m.state = 'toStage';
    addTask({ kind: 'toStage', pick: wcOut(m.wc), drop: STAGE_SLOTS[slot], ref: m.id, aux: slot, lane: AISLE_Z, label: `${m.id} → Lane ${slot + 1}` });
  }
}

function takeTask(f: Forklift): Task | null {
  if (!S.tasks.length) return null;
  let best = 0;
  for (let i = 1; i < S.tasks.length; i++) {
    const a = S.tasks[i], b = S.tasks[best];
    if (TASK_PRI[a.kind] > TASK_PRI[b.kind] || (TASK_PRI[a.kind] === TASK_PRI[b.kind] && a.created < b.created)) best = i;
  }
  void f;
  return S.tasks.splice(best, 1)[0];
}

/* -------------------------------- forklifts -------------------------------- */

function follow(f: Forklift, dt: number) {
  const sp = S.tune.forkSpeed * (f.carry ? 0.85 : 1) * dt;
  let budget = sp;
  while (budget > 0 && f.path.length) {
    const w = f.path[0];
    const dx = w.x - f.pos.x, dz = w.z - f.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.001) {
      const target = Math.atan2(dx, dz);
      let da = target - f.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      f.yaw += da * Math.min(1, dt * 10);
    }
    if (d <= budget) {
      f.pos.x = w.x; f.pos.z = w.z; budget -= d; f.path.shift();
    } else {
      f.pos.x += (dx / d) * budget; f.pos.z += (dz / d) * budget; budget = 0;
    }
  }
  return f.path.length === 0;
}

function carryPos(f: Forklift) {
  return { x: f.pos.x + Math.sin(f.yaw) * 1.25, z: f.pos.z + Math.cos(f.yaw) * 1.25 };
}

/** Stop short so the forks (not the mast) reach the point. */
function approach(path: Vec[]) {
  if (!path.length) return path;
  const end = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : null;
  if (!prev) return path;
  const dx = end.x - prev.x, dz = end.z - prev.z, d = Math.hypot(dx, dz);
  if (d < 1.4) return path;
  path[path.length - 1] = { x: end.x - (dx / d) * 1.25, z: end.z - (dz / d) * 1.25 };
  return path;
}

function updateForklifts(dt: number) {
  for (const f of S.forklifts) {
    f.lift += ((f.carry ? 1 : 0) - f.lift) * Math.min(1, dt * 6);
    if ((f.state === 'idle' || f.state === 'home') && S.tasks.length) {
      const t = takeTask(f);
      if (t) {
        f.task = t;
        f.state = 'toPick';
        f.path = approach(route(f.pos, t.pick, t.lane));
      }
    }
    switch (f.state) {
      case 'idle':
        if (Math.hypot(f.pos.x - f.home.x, f.pos.z - f.home.z) > 0.1) {
          f.state = 'home';
          f.path = route(f.pos, f.home, AISLE_Z);
        }
        break;
      case 'home':
        if (follow(f, dt)) {
          f.state = 'idle';
          f.yaw = Math.PI;
        }
        break;
      case 'toPick':
        if (follow(f, dt)) { f.state = 'pick'; f.timer = S.tune.forkHandle; }
        break;
      case 'pick':
        f.timer -= dt;
        if (f.timer <= 0) {
          onPick(f, f.task!);
          f.state = 'toDrop';
          f.path = approach(route(f.pos, f.task!.drop, f.task!.lane));
        }
        break;
      case 'toDrop':
        if (follow(f, dt)) { f.state = 'drop'; f.timer = S.tune.forkHandle; }
        break;
      case 'drop':
        f.timer -= dt;
        if (f.timer <= 0) {
          onDrop(f.task!);
          f.carry = null;
          f.task = null;
          f.state = 'idle';
        }
        break;
    }
    if (f.carry) {
      const e = f.carry.kind === 'kit' ? kitById(f.carry.id) : machineById(f.carry.id);
      if (e) e.pos = carryPos(f);
    }
  }
}

function onPick(f: Forklift, t: Task) {
  if (t.kind === 'unload' || t.kind === 'toWC') {
    const kit = kitById(t.ref)!;
    if (t.kind === 'toWC') S.recv[kit.slot] = null;
    kit.state = 'carried';
    f.carry = { kind: 'kit', id: kit.id };
    if (t.kind === 'unload') {
      const tr = truckById(t.truckId)!;
      tr.state = 'departing';
      tr.anim = 0;
    }
  } else {
    const m = machineById(t.ref)!;
    if (t.kind === 'toStage') {
      const wc = S.wcs[m.wc];
      wc.state = 'idle';
      wc.machineId = null;
      wc.model = null;
      wc.progress = 0;
    } else {
      S.stage[m.slot] = null;
    }
    m.state = 'carried';
    f.carry = { kind: 'machine', id: m.id };
  }
}

function onDrop(t: Task) {
  switch (t.kind) {
    case 'unload': {
      const kit = kitById(t.ref)!;
      const sh = shipmentById(kit.shipmentId)!;
      kit.state = 'waiting';
      kit.pos = { ...RECV_SLOTS[kit.slot] };
      kit.receivedAt = S.t;
      setStage(sh, 'received');
      emit(`${kit.id} received. Ready to detrash.`, 'info', 'drop');
      break;
    }
    case 'toWC': {
      const kit = kitById(t.ref)!;
      const sh = shipmentById(kit.shipmentId)!;
      const wc = S.wcs[t.aux];
      const mdef = MODELS[kit.model];
      const m: Machine = {
        id: `MCH-${++S.seq.mach}`, shipmentId: sh.id, model: kit.model, state: 'building', wc: wc.idx, slot: -1,
        pos: { x: WC_POS[wc.idx].x, z: WC_POS[wc.idx].z }, progress: 0,
        serial: `SN-${MODELS[kit.model].short}-${String(S.seq.mach * 7 + 113).padStart(5, '0')}`,
      };
      S.machines.push(m);
      wc.state = 'building';
      wc.progress = 0;
      wc.broke = false;
      wc.machineId = m.id;
      wc.kitId = null;
      wc.buildSec = mdef.buildSec * (S.up.overtime ? 0.75 : 1) + kit.damage * S.tune.damageBuildSec
        + kit.shortage * S.tune.shortageSec + kit.wrongIn * S.tune.wrongPartSec;
      if (kit.wrongIn) {
        S.costs += kit.wrongIn * S.tune.wrongPartCost;
        emit(`${wc.id}: wrong part fitted from ${kit.id}. Rework +${S.tune.wrongPartSec}s, −$${S.tune.wrongPartCost}`, 'bad', 'alarm');
      } else if (kit.shortage) {
        emit(`${wc.id} waiting on expedited part for ${kit.id} (+${kit.shortage * S.tune.shortageSec}s)`, 'warn');
      }
      sh.machineId = m.id;
      setStage(sh, 'building');
      S.kits = S.kits.filter((k) => k !== kit);
      break;
    }
    case 'toStage': {
      const m = machineById(t.ref)!;
      const sh = shipmentById(m.shipmentId)!;
      m.state = 'staged';
      m.pos = { ...STAGE_SLOTS[m.slot] };
      setStage(sh, 'staged');
      const tr = truckById(sh.truckId);
      emit(
        tr?.state === 'docked' ? `${MODELS[m.model].short} staged. Truck is waiting: ship it!` : `${MODELS[m.model].short} for ${sh.id} staged${tr ? '' : '. Book a truck'}.`,
        'good', 'ready',
      );
      break;
    }
    case 'load': {
      const m = machineById(t.ref)!;
      const sh = shipmentById(m.shipmentId)!;
      const tr = truckById(sh.truckId)!;
      S.machines = S.machines.filter((x) => x !== m);
      tr.state = 'departing';
      tr.anim = 0;
      tr.loading = false;
      const lateBy = S.t - sh.due;
      sh.late = lateBy > 0;
      const factor = sh.late ? Math.max(0.3, 1 - lateBy / 150) : 1;
      sh.paid = Math.round(sh.value * factor);
      S.revenue += sh.paid;
      S.stats.shipped++;
      if (sh.late) S.stats.late++;
      else S.stats.onTime++;
      setStage(sh, 'shipped');
      emit(`${sh.id} shipped to ${sh.city} · +$${sh.paid.toLocaleString()}${sh.late ? ' (late)' : ''}`, sh.late ? 'warn' : 'good', 'ship');
      break;
    }
  }
}

/* --------------------------------- systems --------------------------------- */

function updateTrucks(dt: number) {
  for (const tr of S.trucks) {
    if (tr.state === 'enroute') {
      if (tr.kind === 'in' && tr.dock < 0 && tr.eta <= S.tune.truckAnim) {
        const d = IN_DOORS.findIndex((_, i) => !inDoorBusy(i));
        if (d < 0) {
          tr.eta = S.tune.truckAnim;
          tr.gateWait = true;
          continue;
        }
        tr.dock = d;
        tr.gateWait = false;
      }
      tr.eta -= dt;
      if (tr.eta <= 0) {
        tr.eta = 0;
        tr.state = 'docked';
        tr.dockedAt = S.t;
        if (tr.kind === 'out') {
          const sh = shipmentById(tr.shipmentId)!;
          emit(`${tr.id} docked at Bay ${tr.dock + 1} for ${sh.id}`, sh.stage === 'staged' ? 'good' : 'info', 'horn');
        }
      }
    } else if (tr.state === 'docked' && tr.kind === 'out' && !tr.loading) {
      if (S.t - tr.dockedAt > S.tune.detentionFree) {
        const c = S.tune.detentionPerSec * dt;
        tr.detention += c;
        S.costs += c;
        S.stats.detention += c;
        if (!tr.warned) {
          tr.warned = true;
          emit(`${tr.id} on detention at Bay ${tr.dock + 1}: $${S.tune.detentionPerSec}/s`, 'bad', 'deny');
        }
      }
    } else if (tr.state === 'departing') {
      tr.anim += dt / S.tune.truckAnim;
      if (tr.anim >= 1) tr.state = 'gone';
    }
  }
  S.trucks = S.trucks.filter((t) => t.state !== 'gone');
}

function updateWCs(dt: number) {
  for (const wc of S.wcs) {
    if (wc.state !== 'building') continue;
    const m = machineById(wc.machineId)!;
    if (wc.down) {
      if (wc.repairT > 0) {
        wc.repairT -= dt;
        if (wc.repairT <= 0) {
          wc.down = false;
          emit(`${wc.id} back online`, 'good', 'done');
        }
      }
      continue;
    }
    if (!wc.broke && S.t > 50 && wc.progress > 0.15 && wc.progress < 0.85 && S.rng() < S.tune.breakdownPerSec * dt) {
      wc.down = true;
      wc.broke = true;
      S.stats.breakdowns++;
      emit(`${wc.id} breakdown! Send a technician.`, 'bad', 'alarm');
      continue;
    }
    wc.progress = Math.min(1, wc.progress + dt / wc.buildSec);
    m.progress = wc.progress;
    if (wc.progress >= 1) {
      wc.state = 'blocked';
      m.state = 'done';
      emit(`${wc.id} finished ${MODELS[m.model].short}`, 'info', 'done');
    }
  }
}

function updateOperator(dt: number) {
  const lvl = S.up.operator;
  if (!lvl) return;
  let kit = kitById(S.opKit);
  if (!kit || kit.state !== 'waiting' || kit.by !== 'operator') {
    S.opKit = null;
    kit = waitingKits().find((k) => k.by === null);
    if (!kit) return;
    kit.by = 'operator';
    kit.opT = 0;
    S.opKit = kit.id;
  }
  kit.opT += dt;
  const each = S.tune.operatorPieceSec[lvl - 1];
  if (kit.opT >= each) {
    kit.opT = 0;
    const next = kit.pieces.filter((p) => !p.removed).sort((a, b) => a.layer - b.layer)[0];
    if (next?.kind === 'foam' && !kit.opRolled) {
      kit.opRolled = true;
      const ok = kit.parts.filter((p) => !p.damaged);
      if (ok.length && S.rng() < S.tune.opDamage) touchPart(kit.id, ok[Math.floor(S.rng() * ok.length)].id, 'Operator nicked a part');
    }
    if (next) removeInternal(kit, next, false);
  }
}

function updateSkip(dt: number) {
  if (S.skip.emptyT > 0) {
    S.skip.emptyT -= dt;
    if (S.skip.emptyT <= 0) {
      const rebate = S.skip.count * S.tune.recyclePerPiece;
      S.revenue += rebate;
      S.skip.count = 0;
      S.skip.emptyT = 0;
      emit(`Compactor emptied · +$${rebate} recycling`, 'good', 'done');
    }
  }
}

/* --------------------------------- actions --------------------------------- */

export type RemoveResult = { ok: true; cleared: boolean; layerDone: boolean; count: number } | { ok: false; reason: 'order' | 'skip' | 'gone'; hint: string };

/** all trash gone -> ERP goods receipt step (auto-posted by RFID when the kit is error-free) */
function finishDetrash(kit: Kit) {
  const sh = shipmentById(kit.shipmentId)!;
  const byPlayer = kit.by === 'player';
  kit.state = 'scan';
  if (!byPlayer) kit.by = null;
  if (S.opKit === kit.id) S.opKit = null;
  setStage(sh, 'detrashed');
  S.stats.kitsDetrashed++;
  if (byPlayer && kit.startedAt) {
    S.stats.playerKits++;
    S.stats.detrashTime += S.t - kit.startedAt;
  }
  if (S.up.rfid && kit.exception === 'none') {
    for (const p of kit.parts) scanPart(kit.id, p.id, true);
    postGR(kit.id, true);
    return;
  }
  emit(
    S.up.rfid ? `RFID flagged an exception on ${kit.id}. Check the BOM!` : `${kit.id} detrashed. Scan the parts into ERP.`,
    S.up.rfid ? 'warn' : 'good', 'clean',
  );
}

export interface GrSummary { lines: BomLine[]; offBom: Part[]; unscanned: number; missing: number; ready: boolean }
export function grSummary(kit: Kit): GrSummary {
  const offBom = kit.parts.filter((p) => p.scanned && !p.quarantined && !kit.bom.some((l) => l.mat === p.mat));
  const unscanned = kit.parts.filter((p) => !p.scanned && !p.quarantined).length;
  const missing = kit.bom.reduce((n, l) => n + Math.max(0, l.qty - l.got), 0);
  return { lines: kit.bom, offBom, unscanned, missing, ready: !offBom.length && !unscanned && !missing };
}

export type ScanResult = { ok: true; onBom: boolean; mat: string } | { ok: false; hint: string };
export function scanPart(kitId: string, partId: number, silent = false): ScanResult {
  const kit = kitById(kitId);
  const part = kit?.parts.find((p) => p.id === partId);
  if (!kit || !part || kit.state !== 'scan') return { ok: false, hint: '' };
  if (part.quarantined) return { ok: false, hint: 'That part is in quarantine' };
  if (part.scanned) return { ok: false, hint: `${part.mat} already scanned` };
  part.scanned = true;
  S.stats.scans++;
  const line = kit.bom.find((l) => l.mat === part.mat);
  if (line) line.got++;
  if (!silent && !line) emit(`${part.mat} is not on the BOM for ${kit.id}`, 'bad', 'deny');
  return { ok: true, onBom: !!line, mat: part.mat };
}

export function quarantinePart(kitId: string, partId: number) {
  const kit = kitById(kitId);
  const part = kit?.parts.find((p) => p.id === partId);
  if (!kit || !part || kit.state !== 'scan' || part.quarantined) return false;
  part.quarantined = true;
  if (!kit.bom.some((l) => l.mat === part.mat)) S.stats.caught++;
  emit(`${part.mat} moved to quarantine · NCR raised`, 'info', 'buy');
  return true;
}

/** Post the goods receipt with whatever has been scanned. */
export function postGR(kitId: string, auto = false) {
  const kit = kitById(kitId);
  if (!kit || kit.state !== 'scan') return false;
  const g = grSummary(kit);
  const realMissing = kit.exception === 'none' ? 0 : 1;
  const falseShort = Math.max(0, g.missing - realMissing);
  kit.shortage = g.missing;
  kit.wrongIn = kit.parts.filter((p) => !p.quarantined && !kit.bom.some((l) => l.mat === p.mat)).length;
  kit.grDoc = String(++S.seq.doc);
  kit.state = 'clean';
  kit.by = null;
  if (S.playerKit === kit.id) S.playerKit = null;
  if (falseShort) S.costs += falseShort * S.tune.falseShortCost;
  S.stats.grPosted++;
  S.stats.falseShort += falseShort;
  S.stats.wrongIn += kit.wrongIn;
  if (!falseShort && !kit.wrongIn) S.stats.grAccurate++;
  setStage(shipmentById(kit.shipmentId)!, 'scanned');
  if (auto) emit(`RFID posted GR ${kit.grDoc} for ${kit.id}`, 'good', 'scan');
  else if (falseShort) emit(`GR ${kit.grDoc} posted short: ${falseShort} part${falseShort > 1 ? 's' : ''} weren't scanned. Expedite wasted −$${falseShort * S.tune.falseShortCost}`, 'bad', 'deny');
  else if (g.missing) emit(`GR ${kit.grDoc} posted with shortage. Supplier is expediting the part.`, 'warn', 'scan');
  else emit(`GR ${kit.grDoc} posted for ${kit.id}. Queued for build.`, 'good', 'scan');
  return true;
}

function removeInternal(kit: Kit, piece: Piece, player: boolean): RemoveResult {
  if (S.skip.emptyT > 0 || S.skip.count >= S.skip.cap) {
    if (!player) warnOnce('skipFull', 'Compactor full. Empty it to keep detrashing.');
    return { ok: false, reason: 'skip', hint: S.skip.emptyT > 0 ? 'Compactor is emptying…' : 'Compactor full. Empty it!' };
  }
  const batch = piece.kind === 'strap' && S.up.cutter ? kit.pieces.filter((p) => p.kind === 'strap' && !p.removed) : [piece];
  for (const p of batch) p.removed = true;
  S.skip.count = Math.min(S.skip.cap, S.skip.count + batch.length);
  S.stats.pieces += batch.length;
  const layerDone = !kit.pieces.some((p) => p.layer === piece.layer && !p.removed);
  const cleared = kit.pieces.every((p) => p.removed);
  if (cleared) finishDetrash(kit);
  return { ok: true, cleared, layerDone, count: batch.length };
}

export function removePiece(kitId: string, pieceId: number): RemoveResult {
  const kit = kitById(kitId);
  const piece = kit?.pieces.find((p) => p.id === pieceId);
  if (!kit || !piece || piece.removed || kit.state !== 'waiting') return { ok: false, reason: 'gone', hint: '' };
  const cur = currentLayer(kit)!;
  if (piece.layer > LAYERS.indexOf(cur)) return { ok: false, reason: 'order', hint: LAYER_HINT[cur] + ' first' };
  if (!kit.startedAt) kit.startedAt = S.t;
  return removeInternal(kit, piece, true);
}

export function touchPart(kitId: string, partId: number, cause = 'Part damaged') {
  const kit = kitById(kitId);
  const part = kit?.parts.find((p) => p.id === partId);
  if (!kit || !part || part.damaged || kit.state !== 'waiting') return false;
  part.damaged = true;
  kit.damage++;
  const sh = shipmentById(kit.shipmentId)!;
  sh.damage++;
  S.costs += S.tune.damageCost;
  S.stats.damage++;
  emit(`${cause} on ${kit.id} · QC rework −$${S.tune.damageCost}, +${S.tune.damageBuildSec}s build`, 'bad', 'crack');
  return true;
}

export function openDetrash(kitId: string) {
  const kit = kitById(kitId);
  if (!kit || (kit.state !== 'waiting' && kit.state !== 'scan')) return false;
  const prev = kitById(S.playerKit);
  if (prev && prev !== kit && prev.by === 'player') prev.by = null;
  if (kit.by === 'operator') S.opKit = null;
  kit.by = 'player';
  S.playerKit = kit.id;
  return true;
}

export function closeDetrash() {
  const kit = kitById(S.playerKit);
  if (kit && kit.by === 'player') kit.by = null;
  S.playerKit = null;
}

export function bookTruck(shipmentId: string): string | null {
  const sh = shipmentById(shipmentId);
  if (!sh || sh.truckId || sh.stage === 'shipped' || sh.stage === 'delivered') return 'Already booked';
  const dock = freeDocks()[0];
  if (dock === undefined) {
    emit('All outbound bays are busy', 'warn', 'deny');
    return 'All bays busy';
  }
  const tr = newTruck('out', sh.id, null, dock, S.tune.truckEta);
  sh.truckId = tr.id;
  S.trucks.push(tr);
  emit(`${tr.id} (${tr.carrier}) booked for ${sh.id} · Bay ${dock + 1}`, 'info', 'buy');
  return null;
}

export function canShip(sh: Shipment) {
  const m = machineById(sh.machineId), tr = truckById(sh.truckId);
  return !!m && m.state === 'staged' && !!tr && tr.state === 'docked' && !tr.loading;
}

export type GiStep = 'serial' | 'trailer' | 'seal';
/** ERP goods issue at the dock: scan serial -> scan trailer -> apply seal -> post. */
export function giStep(shipmentId: string, step: GiStep): { ok: boolean; hint: string } {
  const sh = shipmentById(shipmentId);
  if (!sh || !canShip(sh)) return { ok: false, hint: '' };
  if (step === 'trailer' && !sh.gi.serial) return { ok: false, hint: 'Scan the machine serial first' };
  if (step === 'seal' && !sh.gi.trailer) return { ok: false, hint: 'Scan the trailer number first' };
  if (step === 'serial') sh.gi.serial = true;
  if (step === 'trailer') sh.gi.trailer = true;
  if (step === 'seal') sh.gi.seal = sh.gi.seal ?? `SL-${700000 + Math.floor(S.rng() * 99999)}`;
  return { ok: true, hint: '' };
}
export const giReady = (sh: Shipment) => sh.gi.serial && sh.gi.trailer && !!sh.gi.seal;

/** Post goods issue; the forklift then loads the truck. */
export function shipOut(shipmentId: string) {
  const sh = shipmentById(shipmentId);
  if (!sh || !canShip(sh) || !giReady(sh)) return false;
  const m = machineById(sh.machineId)!, tr = truckById(sh.truckId)!;
  m.state = 'loading';
  tr.loading = true;
  setStage(sh, 'loading');
  addTask({ kind: 'load', pick: STAGE_SLOTS[m.slot], drop: dockDrop(tr.dock), ref: m.id, aux: tr.dock, lane: AISLE_Z, label: `Loading ${tr.id} · Bay ${tr.dock + 1}` });
  emit(`GI ${++S.seq.doc} posted · ASN sent to ${sh.customer}`, 'good', 'scan');
  return true;
}

export function repairWC(idx: number) {
  const wc = S.wcs[idx];
  if (!wc.down || wc.repairT > 0) return;
  wc.repairT = S.tune.repairSec;
  S.costs += S.tune.repairCost;
  S.stats.repairs++;
  emit(`Technician dispatched to ${wc.id} · −$${S.tune.repairCost}`, 'info', 'buy');
}

export function emptySkip() {
  if (S.skip.emptyT > 0 || S.skip.count === 0) return;
  S.skip.emptyT = S.tune.skipEmptySec;
  emit('Compactor emptying…', 'info', 'buy');
}

export function togglePriority(kitId: string) {
  const k = kitById(kitId);
  if (k) k.priority = !k.priority;
}

export const upgradeCost = (id: UpgradeId) => {
  const base = UPGRADES.find((u) => u.id === id)!.cost[S.up[id]];
  return base === undefined ? undefined : Math.round((base * S.tune.upgradeMul) / 10) * 10;
};

export function buyUpgrade(id: UpgradeId) {
  const cost = upgradeCost(id);
  if (cost === undefined || cash() < cost) {
    emit(undefined, 'info', 'deny');
    return false;
  }
  S.spent += cost;
  S.up[id]++;
  if (id === 'wc3') S.wcs[2].unlocked = true;
  if (id === 'forklift') S.forklifts.push(makeForklift(S.forklifts.length));
  if (id === 'skip') S.skip.cap += 30;
  if (id === 'overtime') for (const wc of S.wcs) if (wc.state === 'building') wc.buildSec *= 0.75;
  emit(`${UPGRADES.find((u) => u.id === id)!.name} purchased`, 'good', 'buy');
  return true;
}

/* ---------------------------------- shift ---------------------------------- */

/** Admin/debug: drop a new order in right now. */
export function debugSpawnOrder(rush = false) {
  if (S.running) spawnOrder(false, rush);
}

export function startShift(seed: number, mods: ModifierId[] = [], daily = false) {
  S = fresh(seed, mods, daily);
  S.running = true;
  spawnOrder(true);
  spawnOrder(true);
  S.nextOrder = 6;
  emit('Shift started. Detrash the kits in Receiving!', 'info', 'horn');
}

export function setPaused(p: boolean) {
  if (S.running) S.paused = p;
}

function endShift() {
  S.over = true;
  S.running = false;
  emit('Shift complete', 'info', 'end');
}

export function report() {
  const open = S.shipments.filter((s) => s.stage !== 'shipped' && s.stage !== 'delivered');
  const overdue = open.filter((s) => s.due < S.t).length;
  const denom = S.stats.shipped + overdue;
  const onTimePct = denom ? S.stats.onTime / denom : 1;
  const score = net();
  const grAcc = S.stats.grPosted ? S.stats.grAccurate / S.stats.grPosted : 1;
  const grade = score >= 18000 && onTimePct >= 0.8 ? 'S' : score >= 14000 ? 'A' : score >= 9500 ? 'B' : score >= 5000 ? 'C' : 'D';
  return { score, onTimePct, grAcc, open: open.length, overdue, grade, avgDetrash: S.stats.playerKits ? S.stats.detrashTime / S.stats.playerKits : 0 };
}

/** One sim step. Drives everything; safe to call with variable dt. */
export function tick(dt: number) {
  if (!S.running || S.paused || S.over) return;
  S.t += dt;
  S.nextOrder -= dt;
  if (S.nextOrder <= 0) {
    spawnOrder();
    S.nextOrder = lerp(S.tune.orderGap[0], S.tune.orderGap[1], progress()) * (0.8 + S.rng() * 0.4);
  }
  updateTrucks(dt);
  dispatch();
  updateForklifts(dt);
  updateWCs(dt);
  updateOperator(dt);
  updateSkip(dt);
  for (const sh of S.shipments) if (sh.stage === 'shipped' && S.t - (sh.stageAt.shipped ?? 0) > S.tune.deliverSec) setStage(sh, 'delivered');
  if (S.t >= SHIFT_SEC) endShift();
}

export function drainEvents() {
  const e = S.events;
  S.events = [];
  return e;
}
