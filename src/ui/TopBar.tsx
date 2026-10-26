import { Boxes, CircleDollarSign, Dices, Gauge, Pause, Play, Settings, Wallet } from 'lucide-react';
import { SHIFT_END_LABEL, SHIFT_START_LABEL } from '../game/content';
import { S, cash, net, progress } from '../game/sim';
import { sfx, togglePause, useSim, useUi } from '../game/store';
import { at, money, pct } from './format';
import { modNames, modTooltip } from './mods';
import { Bar } from './primitives';

/** On-time % counting overdue open orders as misses. */
export function onTimeRate() {
  const overdue = S.shipments.filter((s) => s.stage !== 'shipped' && s.stage !== 'delivered' && s.due < S.t).length;
  const denom = S.stats.shipped + overdue;
  return denom ? S.stats.onTime / denom : 1;
}

export function TopBar() {
  useSim();
  const open = useUi((s) => s.settingsOpen);
  const setSettings = useUi((s) => s.setSettings);
  const phase = useUi((s) => s.phase);
  const last = [...S.shipments].filter((s) => s.paid).sort((a, b) => (b.stageAt.shipped ?? 0) - (a.stageAt.shipped ?? 0))[0];
  const fresh = last && S.t - (last.stageAt.shipped ?? 0) < 5;
  const ot = onTimeRate();
  return (
    <header className="topbar panel">
      <div className="brand">
        <div className="logo"><Boxes size={18} /></div>
        <div>
          <b>KitFlow</b>
          <small>Riverside Hub · WH-01</small>
        </div>
      </div>
      <div className="shiftbar" title="Shift progress">
        <span>{SHIFT_START_LABEL}</span>
        <Bar v={progress()} />
        <span>{SHIFT_END_LABEL}</span>
      </div>
      <div className="tkpis">
        {S.mods.length > 0 && (
          <div className="tkpi" title={modTooltip(S.mods)}>
            <Dices size={15} />
            <span className="lbl mod-names">{S.daily ? 'Daily · ' : ''}{modNames(S.mods)}</span>
          </div>
        )}
        <div className="tkpi" title="Net revenue (shipments − costs)">
          <CircleDollarSign size={15} className="good-ic" />
          <b className="mono">{money(net())}</b>
          {fresh && <span className="delta">+{money(last.paid)}</span>}
        </div>
        <div className={`tkpi hide-sm ${ot < 0.7 ? 'bad' : ot < 0.9 ? 'warn' : ''}`} title="On-time delivery">
          <Gauge size={15} />
          <b className="mono">{pct(ot)}</b>
          <span className="lbl">on-time</span>
        </div>
        <div className="tkpi hide-sm" title="Ops budget for upgrades">
          <Wallet size={15} />
          <b className="mono">{money(cash())}</b>
          <span className="lbl">budget</span>
        </div>
      </div>
      <div className="top-right">
        <div className={`live ${S.paused || phase !== 'playing' ? 'paused' : ''}`}>
          <span className="rec" />
          <span className="hide-sm">{S.paused ? 'PAUSED' : 'LIVE'}</span>
          <span className="mono">{at(S.t)}</span>
        </div>
        <button className="btn icon" aria-label={S.paused ? 'Resume' : 'Pause'} title="Pause (Space)" disabled={phase !== 'playing'} onClick={() => { sfx('click'); togglePause(); }}>
          {S.paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button className="btn icon" aria-label="Settings" title="Settings" onClick={() => { sfx('click'); setSettings(!open); }}>
          <Settings size={16} />
        </button>
        <div className="avatar">
          <div className="pic">OM</div>
          <div>
            <b>You</b>
            <small>Operations Manager</small>
          </div>
        </div>
      </div>
    </header>
  );
}
