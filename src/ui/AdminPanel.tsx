import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Bug, ChevronDown, ChevronUp, Delete, Lock, ShieldCheck, X } from 'lucide-react';
import { SHIFT_SEC } from '../game/content';
import { ADMIN_PIN, SPEEDS, act, admin, cheatsActive, isTainted, lockAdmin, setFlag, unlockAdmin } from '../game/admin';
import type { AdminFlags } from '../game/admin';
import { S, cash } from '../game/sim';
import { sfx, toast, togglePause, useSim, useUi } from '../game/store';
import { at, money } from './format';

const useAdminUi = create<{ pin: boolean; panel: boolean; collapsed: boolean }>(() => ({ pin: false, panel: admin.unlocked && admin.panelOpen, collapsed: false }));

/** Settings entry point: asks for the passcode unless already unlocked. */
export function openAdmin() {
  if (admin.unlocked) {
    admin.panelOpen = true;
    useAdminUi.setState({ panel: true, collapsed: false });
  } else useAdminUi.setState({ pin: true });
}
export const adminLabel = () => (admin.unlocked ? 'Admin panel' : 'Admin mode');

/* -------------------------------- pin pad --------------------------------- */
function PinPad() {
  const open = useAdminUi((s) => s.pin);
  const [code, setCodeState] = useState('');
  // ref mirrors state so rapid taps never read a stale code
  const codeRef = useRef('');
  const setCode = (v: string | ((c: string) => string)) => {
    codeRef.current = typeof v === 'function' ? v(codeRef.current) : v;
    setCodeState(codeRef.current);
  };
  const [bad, setBad] = useState(0);
  const close = () => { setCode(''); useAdminUi.setState({ pin: false }); };
  const press = (d: string) => {
    sfx('click');
    if (codeRef.current.length >= ADMIN_PIN.length) return;
    const next = codeRef.current + d;
    setCode(next);
    if (next.length === ADMIN_PIN.length) {
      if (unlockAdmin(next)) {
        sfx('ready');
        setCode('');
        useAdminUi.setState({ pin: false, panel: true, collapsed: false });
        toast('Admin mode unlocked', 'good');
      } else {
        sfx('deny');
        setBad((n) => n + 1);
        setTimeout(() => setCode(''), 350);
      }
    }
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Escape') close();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  if (!open) return null;
  return (
    <div className="overlay" style={{ zIndex: 60 }} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog pinpad" role="dialog" aria-label="Admin passcode">
        <div className="hd" style={{ textAlign: 'center' }}>
          <div className="icon-tile bad" style={{ margin: '0 auto' }}><Lock size={18} /></div>
          <h2 style={{ fontSize: 18 }}>Admin passcode</h2>
          <p>Enter the 4-digit code to open debug tools.</p>
        </div>
        <div className="bd">
          <div key={bad} className={`pin-dots ${bad ? 'shake' : ''}`}>
            {Array.from({ length: ADMIN_PIN.length }, (_, i) => <i key={i} className={i < code.length ? 'on' : ''} />)}
          </div>
          <div className="pin-keys">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="btn" onClick={() => press(d)}>{d}</button>)}
            <button className="btn" aria-label="Cancel" onClick={close}><X size={16} /></button>
            <button className="btn" onClick={() => press('0')}>0</button>
            <button className="btn" aria-label="Delete" onClick={() => setCode((c) => c.slice(0, -1))}><Delete size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- panel ---------------------------------- */
function Toggle({ k, label, hint }: { k: keyof AdminFlags; label: string; hint?: string }) {
  const on = admin.flags[k] === true;
  return (
    <label className="adm-row">
      <span className="grow">{label}{hint && <small>{hint}</small>}</span>
      <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label}
        onClick={() => { setFlag(k, !on as AdminFlags[typeof k]); sfx('click'); useUi.getState().bump(); }} />
    </label>
  );
}

function Act({ label, run, tone }: { label: string; run: () => void; tone?: string }) {
  return <button className={`btn sm ${tone ?? ''}`} onClick={() => { run(); sfx('buy'); useUi.getState().bump(); }}>{label}</button>;
}

function Panel() {
  useSim();
  const { panel, collapsed } = useAdminUi();
  const phase = useUi((s) => s.phase);
  const [budget, setBudget] = useState('');
  if (!panel || !admin.unlocked) return null;
  const playing = phase === 'playing' && S.running;
  const hide = () => { admin.panelOpen = false; useAdminUi.setState({ panel: false }); };
  const counts = [
    ['Orders', S.shipments.length], ['Kits', S.kits.length], ['Machines', S.machines.length],
    ['Trucks', S.trucks.length], ['Tasks', S.tasks.length], ['Forklifts', S.forklifts.length],
  ];
  return (
    <aside className={`admin panel ${collapsed ? 'collapsed' : ''}`} aria-label="Admin panel">
      <div className="adm-h">
        <span className="adm-badge"><Bug size={12} /> ADMIN</span>
        <span className="sub mono">{at(S.t)} · {S.t.toFixed(1)}s · {Math.round(admin.fps)} fps</span>
        <button className="btn icon sm" aria-label={collapsed ? 'Expand' : 'Collapse'} onClick={() => useAdminUi.setState({ collapsed: !collapsed })}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button className="btn icon sm" aria-label="Hide admin panel" onClick={hide}><X size={14} /></button>
      </div>
      {!collapsed && (
        <div className="adm-body scroll">
          {(cheatsActive() || isTainted()) && <div className="adm-warn">Admin tools used. This shift won't count for best scores.</div>}
          {!playing && <div className="adm-warn info">Start a shift to use the live tools.</div>}

          <div className="adm-sect">
            <div className="adm-t">Time</div>
            <div className="seg">
              {SPEEDS.map((v) => (
                <button key={v} className={admin.flags.speed === v ? 'on' : ''} onClick={() => { setFlag('speed', v); useUi.getState().bump(); }}>{v}×</button>
              ))}
            </div>
            <div className="adm-acts">
              <Act label={S.paused ? 'Resume' : 'Pause'} run={() => togglePause()} />
              <Act label="+30s" run={() => act.skip(30)} />
              <Act label="+60s" run={() => act.skip(60)} />
              <Act label="End shift" tone="danger" run={() => act.endShift()} />
            </div>
            <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(1, S.t / SHIFT_SEC) * 100}%` }} /></div>
          </div>

          <div className="adm-sect">
            <div className="adm-t">Money <span className="mono muted">budget {money(cash())} · rev {money(S.revenue)} · costs {money(S.costs)}</span></div>
            <div className="adm-acts">
              <Act label="+$1k" run={() => act.addMoney(1000)} />
              <Act label="+$10k" run={() => act.addMoney(10000)} />
              <Act label="−$1k" run={() => act.addMoney(-1000)} />
              <Act label="Clear costs" run={() => act.clearCosts()} />
            </div>
            <form className="adm-acts" onSubmit={(e) => { e.preventDefault(); const n = Number(budget); if (Number.isFinite(n)) { act.setBudget(n); sfx('buy'); setBudget(''); } }}>
              <input className="adm-input mono" inputMode="numeric" placeholder="Set budget to…" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d-]/g, ''))} />
              <button className="btn sm pri" type="submit">Set</button>
            </form>
          </div>

          <div className="adm-sect">
            <div className="adm-t">Automation</div>
            <Toggle k="autoDetrash" label="Auto-detrash" hint="Strips every waiting kit" />
            <Toggle k="autoGR" label="Auto-scan GR" hint="Scans, quarantines, posts" />
            <Toggle k="autoBook" label="Auto-book trucks" />
            <Toggle k="autoDispatch" label="Auto-dispatch" hint="Serial, trailer, seal, post GI" />
            <Toggle k="autoRepair" label="Auto-repair cells" />
            <Toggle k="autoSkip" label="Auto-empty compactor" />
          </div>

          <div className="adm-sect">
            <div className="adm-t">Cheats</div>
            <Toggle k="noBreakdowns" label="No breakdowns" />
            <Toggle k="noExceptions" label="No supplier errors" hint="Applies to new kits" />
            <Toggle k="freezeDue" label="Freeze deadlines" />
          </div>

          <div className="adm-sect">
            <div className="adm-t">Spawn & events</div>
            <div className="adm-acts">
              <Act label="New order" run={() => act.spawnOrder(false)} />
              <Act label="Rush order" run={() => act.spawnOrder(true)} />
              <Act label="Breakdown" run={() => { if (!act.breakdown()) toast('No workcentre is building right now', 'warn'); }} />
              <Act label="Trucks arrive now" run={() => act.trucksNow()} />
              <Act label="Finish builds" run={() => act.finishBuilds()} />
              <Act label="Clear all kits" run={() => act.clearKits()} />
              <Act label="Empty compactor" run={() => act.emptyCompactor()} />
              <Act label="Max upgrades" run={() => act.maxUpgrades()} />
            </div>
          </div>

          <div className="adm-sect">
            <div className="adm-t">Debug info</div>
            <div className="adm-grid mono">
              {counts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            <div className="sub mono" style={{ marginTop: 6 }}>
              seed {S.seed}{S.daily ? ' (daily)' : ''} · mods {S.mods.length ? S.mods.join(', ') : 'none'}
            </div>
            <div className="sub mono">
              receiving {S.recv.filter(Boolean).length}/{S.recv.length} · staging {S.stage.filter(Boolean).length}/{S.stage.length} · compactor {S.skip.count}/{S.skip.cap}
            </div>
          </div>

          <div className="adm-sect">
            <button className="btn sm" onClick={() => { lockAdmin(); useAdminUi.setState({ panel: false }); toast('Admin mode locked', 'info'); useUi.getState().bump(); }}>
              <ShieldCheck size={13} /> Lock admin & reset tools
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

export function AdminLayer() {
  return (
    <>
      <PinPad />
      <Panel />
    </>
  );
}
