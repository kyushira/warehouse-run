/** Tuning + static content. Times are real seconds unless noted. */

export const SHIFT_SEC = 300;
const CLOCK_START = 6 * 60; // 06:00
const CLOCK_END = 14 * 60; // 14:00

/** Shift time (s) -> wall clock minutes. */
export const clockMin = (t: number) => CLOCK_START + (t / SHIFT_SEC) * (CLOCK_END - CLOCK_START);
export const clockStr = (t: number) => {
  const m = Math.floor(clockMin(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const SHIFT_START_LABEL = '06:00';
export const SHIFT_END_LABEL = '14:00';

export type ModelId = 'CX40' | 'FM200' | 'PK9' | 'RB5';

export interface ModelDef {
  id: ModelId;
  name: string;
  short: string;
  color: string;
  buildSec: number;
  value: number;
  /** shift second this model starts appearing in orders */
  unlockAt: number;
}

export const MODELS: Record<ModelId, ModelDef> = {
  CX40: { id: 'CX40', name: 'CX-40 Conveyor', short: 'CX-40', color: '#f59e0b', buildSec: 20, value: 800, unlockAt: 0 },
  FM200: { id: 'FM200', name: 'FM-200 Filler', short: 'FM-200', color: '#3b82f6', buildSec: 26, value: 1200, unlockAt: 0 },
  PK9: { id: 'PK9', name: 'PK-9 Packer', short: 'PK-9', color: '#8b5cf6', buildSec: 32, value: 1600, unlockAt: 70 },
  RB5: { id: 'RB5', name: 'RB-5 Robot Cell', short: 'RB-5', color: '#14b8a6', buildSec: 38, value: 2300, unlockAt: 150 },
};
export const MODEL_LIST = Object.values(MODELS);

export const CITIES = [
  'Philadelphia, PA', 'Columbus, OH', 'Reno, NV', 'Austin, TX', 'Denver, CO', 'Raleigh, NC',
  'Tacoma, WA', 'Omaha, NE', 'Tampa, FL', 'Boise, ID', 'Madison, WI', 'Tulsa, OK',
];
export const CUSTOMERS = [
  'Northwind Foods', 'Acme Bottling', 'Brightside Pharma', 'Cascade Dairy', 'Summit Brewing',
  'Orchard Labs', 'Bluebird Snacks', 'Ridgeway Paints', 'Harbor Cosmetics', 'Pinecrest Pet',
];
export const CARRIERS = ['Bluepeak', 'WareTrack', 'Northline', 'Swift Haul', 'Ironroad'];

export type UpgradeId = 'wc3' | 'forklift' | 'overtime' | 'operator' | 'cutter' | 'skip' | 'rfid';
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  cost: number[];
}
export const UPGRADES: UpgradeDef[] = [
  { id: 'wc3', name: 'Open WC-3', desc: 'Commission a third build cell', cost: [2400] },
  { id: 'operator', name: 'Detrash operator', desc: 'Auto-detrashes one kit at a time', cost: [1800, 3200] },
  { id: 'rfid', name: 'RFID portal', desc: 'Auto-posts goods receipts for error-free kits', cost: [2600] },
  { id: 'forklift', name: 'Lease forklift', desc: '+1 forklift in the fleet', cost: [900, 1600] },
  { id: 'overtime', name: 'Overtime crew', desc: 'Workcentres build 25% faster', cost: [2000] },
  { id: 'cutter', name: 'Safety cutter', desc: 'One click cuts every strap', cost: [600] },
  { id: 'skip', name: 'Bigger compactor', desc: 'Compactor capacity +30', cost: [500] },
];

export const TUNE = {
  forkSpeed: 5.5,
  forkHandle: 0.55,
  truckEta: 14,
  truckAnim: 5,
  inboundEta: [6, 11] as [number, number],
  detentionFree: 25,
  detentionPerSec: 6,
  skipCap: 45,
  skipEmptySec: 5,
  repairSec: 4,
  repairCost: 120,
  damageBuildSec: 4,
  damageCost: 60,
  operatorPieceSec: [1.3, 0.8] as [number, number],
  breakdownPerSec: 0.01,
  recyclePerPiece: 3,
  deliverSec: 18,
  /* knobs below exist so shift modifiers can bend them */
  startBudget: 1500,
  /** gap between orders (s), lerped from shift start to end */
  orderGap: [24, 13] as [number, number],
  rushChance: 0.2,
  rushPay: 1.5,
  valueMul: 1,
  /** scales the slack before an order is due */
  dueMul: 1,
  upgradeMul: 1,
  /** model unlock times are multiplied by this */
  unlockMul: 1,
  /** extra trash pieces per kit (spread over wrap/foam) */
  extraTrash: 0,
  /** outbound bays (0-based) closed for the shift */
  closedDocks: [] as number[],
  startOperator: 0,
  /** chance per kit that the operator nicks a part */
  opDamage: 0,
  /* ERP goods receipt */
  /** chance a kit has a supplier error: base + shift progress * k */
  exceptionChance: [0.15, 0.3] as [number, number],
  shortageSec: 8,
  wrongPartSec: 15,
  wrongPartCost: 120,
  falseShortCost: 100,
};
export type Tune = typeof TUNE;
