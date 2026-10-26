/** Shift modifier cards (briefing) and compact chips (top bar, report). */
import {
  Ban, FlaskConical, Gem, Gift, Landmark, Leaf, Package, PiggyBank, Tag, ThermometerSun, Timer, UserPlus, Wrench, Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { modifierById } from '../game/modifiers';
import type { ModifierDef, ModifierId } from '../game/modifiers';

const ICON: Record<ModifierId, ReactNode> = {
  holiday: <Gift size={18} />, heatwave: <ThermometerSun size={18} />, strike: <Ban size={18} />, green: <Leaf size={18} />,
  lean: <PiggyBank size={18} />, grant: <Landmark size={18} />, sale: <Tag size={18} />, premium: <Gem size={18} />,
  strict: <Timer size={18} />, maint: <Wrench size={18} />, packaging: <Package size={18} />, express: <Zap size={18} />,
  prototype: <FlaskConical size={18} />, newhire: <UserPlus size={18} />,
};
const KIND: Record<ModifierDef['kind'], { label: string; tone: string }> = {
  challenge: { label: 'Challenge', tone: 'bad' },
  boon: { label: 'Boon', tone: 'good' },
  mixed: { label: 'Trade-off', tone: 'warn' },
};

export const modNames = (mods: ModifierId[]) => mods.map((id) => modifierById(id).name).join(' · ');
export const modTooltip = (mods: ModifierId[]) => mods.map((id) => `${modifierById(id).name}: ${modifierById(id).desc}`).join('\n');

export function ModList({ mods }: { mods: ModifierId[] }) {
  return (
    <div className="mods">
      {mods.map((id) => {
        const m = modifierById(id), k = KIND[m.kind];
        return (
          <div key={id}>
            <div className={`icon-tile ${k.tone}`}>{ICON[id]}</div>
            <div>
              <b>{m.name} <span className={`chip ${k.tone}`}>{k.label}</span></b>
              {m.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ModChips({ mods }: { mods: ModifierId[] }) {
  return (
    <div className="mod-chips">
      {mods.map((id) => {
        const m = modifierById(id);
        return <span key={id} className={`chip ${KIND[m.kind].tone}`} title={m.desc}>{m.name}</span>;
      })}
    </div>
  );
}
