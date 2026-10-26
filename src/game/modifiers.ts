/**
 * Shift modifiers: each shift rolls a couple of these from its seed, so a
 * daily seed gets the same conditions for everyone. Each one bends the
 * shift's copy of TUNE before the first order spawns.
 */
import { TUNE } from './content';
import type { Tune } from './content';
import { mulberry } from './rng';

export type ModifierId =
  | 'holiday' | 'heatwave' | 'strike' | 'green' | 'lean' | 'grant' | 'sale'
  | 'premium' | 'strict' | 'maint' | 'packaging' | 'express' | 'prototype' | 'newhire';

export interface ModifierDef {
  id: ModifierId;
  name: string;
  desc: string;
  /** challenge = makes the shift harder, boon = easier, mixed = trade-off */
  kind: 'challenge' | 'boon' | 'mixed';
  conflicts?: ModifierId[];
  apply: (t: Tune) => void;
}

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'holiday', name: 'Holiday Rush', kind: 'mixed',
    desc: 'Orders arrive 35% faster and rush orders are twice as common, but rush orders pay ×1.8.',
    apply: (t) => { t.orderGap = [t.orderGap[0] / 1.35, t.orderGap[1] / 1.35]; t.rushChance = 0.4; t.rushPay = 1.8; },
  },
  {
    id: 'heatwave', name: 'Heatwave', kind: 'challenge', conflicts: ['maint'],
    desc: 'Forklifts run 15% slower and workcentres break down twice as often.',
    apply: (t) => { t.forkSpeed *= 0.85; t.breakdownPerSec *= 2; },
  },
  {
    id: 'strike', name: 'Carrier Strike', kind: 'challenge', conflicts: ['express'],
    desc: 'Bay 3 is closed and outbound trucks take 50% longer to arrive.',
    apply: (t) => { t.closedDocks = [2]; t.truckEta *= 1.5; },
  },
  {
    id: 'green', name: 'Green Audit', kind: 'mixed',
    desc: 'Recycling pays ×4, but every damaged part costs ×3.',
    apply: (t) => { t.recyclePerPiece *= 4; t.damageCost *= 3; },
  },
  {
    id: 'lean', name: 'Lean Budget', kind: 'challenge', conflicts: ['grant'],
    desc: 'You start the shift with $600 instead of $1,500.',
    apply: (t) => { t.startBudget = 600; },
  },
  {
    id: 'grant', name: 'Capex Grant', kind: 'boon', conflicts: ['lean'],
    desc: 'Head office tops up the budget: start with $3,500.',
    apply: (t) => { t.startBudget = 3500; },
  },
  {
    id: 'sale', name: 'Supplier Sale', kind: 'boon',
    desc: 'All upgrades cost 30% less.',
    apply: (t) => { t.upgradeMul = 0.7; },
  },
  {
    id: 'premium', name: 'Premium Contracts', kind: 'mixed',
    desc: 'Orders pay 30% more, but due times are 20% tighter.',
    apply: (t) => { t.valueMul = 1.3; t.dueMul = 0.8; },
  },
  {
    id: 'strict', name: 'Strict Carriers', kind: 'challenge',
    desc: 'Detention starts after 12s instead of 25s and costs $10/s.',
    apply: (t) => { t.detentionFree = 12; t.detentionPerSec = 10; },
  },
  {
    id: 'maint', name: 'Fresh Service', kind: 'boon', conflicts: ['heatwave'],
    desc: 'The cells were just serviced: 70% fewer breakdowns and repairs cost half.',
    apply: (t) => { t.breakdownPerSec *= 0.3; t.repairCost /= 2; },
  },
  {
    id: 'packaging', name: 'Over-packed Kits', kind: 'challenge',
    desc: 'A new supplier packs kits with extra wrap and dunnage. The compactor fills faster.',
    apply: (t) => { t.extraTrash = 3; },
  },
  {
    id: 'express', name: 'Express Lane', kind: 'boon', conflicts: ['strike'],
    desc: 'Inbound and outbound trucks arrive 40% faster.',
    apply: (t) => { t.truckEta *= 0.6; t.inboundEta = [t.inboundEta[0] * 0.6, t.inboundEta[1] * 0.6]; },
  },
  {
    id: 'prototype', name: 'Prototype Week', kind: 'mixed',
    desc: 'PK-9 and RB-5 orders unlock much earlier. They pay more but take longer to build.',
    apply: (t) => { t.unlockMul = 0.25; },
  },
  {
    id: 'newhire', name: 'New Hire Day', kind: 'mixed',
    desc: 'A detrash operator starts on shift for free, but 1 in 4 of their kits gets a nicked part.',
    apply: (t) => { t.startOperator = 1; t.opDamage = 0.25; },
  },
];

export const modifierById = (id: ModifierId) => MODIFIERS.find((m) => m.id === id)!;

/** Two modifiers per shift: always one challenge or trade-off, plus one more of any kind. */
export function rollModifiers(seed: number): ModifierId[] {
  const r = mulberry(seed ^ 0x5bd1e995);
  const pickFrom = (pool: ModifierDef[]) => pool[Math.floor(r() * pool.length)];
  const first = pickFrom(MODIFIERS.filter((m) => m.kind !== 'boon'));
  const second = pickFrom(MODIFIERS.filter((m) => m !== first && !first.conflicts?.includes(m.id)));
  return [first.id, second.id];
}

export function tuneFor(mods: ModifierId[]): Tune {
  const t: Tune = { ...TUNE, inboundEta: [...TUNE.inboundEta], operatorPieceSec: [...TUNE.operatorPieceSec], orderGap: [...TUNE.orderGap], closedDocks: [] };
  for (const id of mods) modifierById(id).apply(t);
  return t;
}
