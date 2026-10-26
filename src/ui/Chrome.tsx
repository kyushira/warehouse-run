/** Toasts, settings popover, zoom controls, title, briefing + shift report overlays. */
import { useEffect, useState } from 'react';
import {
  Boxes, CalendarDays, CircleCheck, CircleQuestionMark, CircleX, Dices, Headphones, Info, LocateFixed, Minus, Pause, Play, Plus,
  RefreshCw, Repeat, RotateCw, Scissors, Send, Share2, TriangleAlert, Truck, Volume2, VolumeX, Factory,
  Bug,
} from 'lucide-react';
import { audio } from '../audio/audio';
import { MODELS } from '../game/content';
import { S, report } from '../game/sim';
import { beginShift, planShift, restartShift, sfx, togglePause, useSim, useUi } from '../game/store';
import { todaySeed } from '../game/rng';
import { resetCam, rotateCam, zoomCam } from '../scene/cameraApi';
import { money, pct } from './format';
import { ModChips, ModList, modNames } from './mods';
import { adminLabel, openAdmin } from './AdminPanel';
import { isTainted } from '../game/admin';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  // while detrashing, updates go to the modal's feed strip so nothing covers the kit
  const detrashing = useUi((s) => !!s.detrashKit || !!s.dispatch);
  if (detrashing) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast panel ${t.tone}`}>
          <span className="ic">
            {t.tone === 'good' ? <CircleCheck size={16} /> : t.tone === 'bad' ? <CircleX size={16} /> : t.tone === 'warn' ? <TriangleAlert size={16} /> : <Info size={16} />}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ZoomControls() {
  const btn = (label: string, on: () => void, icon: React.ReactNode) => (
    <button aria-label={label} title={label} onClick={() => { sfx('click'); on(); }}>{icon}</button>
  );
  return (
    <div className="zoom panel">
      {btn('Zoom in', () => zoomCam(1.25), <Plus size={16} />)}
      {btn('Zoom out', () => zoomCam(0.8), <Minus size={16} />)}
      <hr />
      {btn('Rotate view', () => rotateCam(Math.PI / 4), <RotateCw size={16} />)}
      {btn('Reset view', () => resetCam(), <LocateFixed size={16} />)}
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />;
}

export function SettingsMenu() {
  useSim();
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettings);
  const setHelp = useUi((s) => s.setHelp);
  const phase = useUi((s) => s.phase);
  const [, force] = useState(0);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);
  if (!open) return null;
  const st = audio.settings;
  const refresh = () => force((n) => n + 1);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 44 }} onClick={() => setOpen(false)} />
      <div className="settings panel" role="dialog" aria-label="Settings">
        <div className="item">
          <Headphones size={17} />
          <div className="grow">Music<small>Lo-fi ops radio</small></div>
          <Switch label="Music" on={st.music} onClick={() => { audio.init(); audio.setMusic(!st.music); refresh(); }} />
        </div>
        {st.music && (
          <div className="item" style={{ paddingTop: 0 }}>
            <VolumeX size={15} className="muted" />
            <input type="range" min={0} max={1} step={0.05} value={st.musicVol} aria-label="Music volume" onChange={(e) => { audio.setMusicVol(+e.target.value); refresh(); }} />
            <Volume2 size={15} className="muted" />
          </div>
        )}
        <div className="item">
          {st.sfx ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <div className="grow">Sound effects</div>
          <Switch label="Sound effects" on={st.sfx} onClick={() => { audio.init(); audio.setSfx(!st.sfx); refresh(); sfx('click'); }} />
        </div>
        <hr />
        {phase === 'playing' && (
          <div className="item" style={{ cursor: 'pointer' }} onClick={() => { togglePause(); }}>
            {S.paused ? <Play size={17} /> : <Pause size={17} />}
            <div className="grow">{S.paused ? 'Resume shift' : 'Pause shift'}<small>Space</small></div>
          </div>
        )}
        <div className="item" style={{ cursor: 'pointer' }} onClick={() => { setOpen(false); openAdmin(); }}>
          <Bug size={17} />
          <div className="grow">{adminLabel()}<small>Debug tools · passcode</small></div>
        </div>
        <div className="item" style={{ cursor: 'pointer' }} onClick={() => { setOpen(false); setHelp(true); if (phase === 'playing') togglePause(true); }}>
          <CircleQuestionMark size={17} />
          <div className="grow">How to play</div>
        </div>
        {!confirm ? (
          <div className="item" style={{ cursor: 'pointer', color: 'var(--red)' }} onClick={() => setConfirm(true)}>
            <RefreshCw size={17} />
            <div className="grow">Restart shift<small>Start over from 06:00</small></div>
          </div>
        ) : (
          <>
            <div className="item" style={{ color: 'var(--red)' }}><RefreshCw size={17} /><div className="grow">Restart? Progress will be lost.</div></div>
            <div className="confirm">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn danger" onClick={() => { setOpen(false); restartShift(); }}>Restart</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const HOWTO = [
  { icon: <Scissors size={18} />, t: 'Detrash + scan', d: 'Cut straps, peel wrap, lift cardboard, pull dunnage (don’t touch the parts). Then scan every part into ERP and quarantine wrong ones.' },
  { icon: <Factory size={18} />, t: 'Cells build', d: 'Forklifts feed clean kits to the workcentres, which build machines on their own. Repair breakdowns fast.' },
  { icon: <Truck size={18} />, t: 'Book trucks', d: 'Time it so the truck docks as the machine is staged. Idle trucks charge detention after 25s.' },
  { icon: <Send size={18} />, t: 'Dispatch', d: 'At the dock, scan the serial and trailer, apply the seal and post the goods issue before the due time.' },
];

export function TitleScreen() {
  const phase = useUi((s) => s.phase);
  const help = useUi((s) => s.helpOpen);
  const setHelp = useUi((s) => s.setHelp);
  if (phase !== 'title' && !help) return null;
  const best = +(localStorage.getItem('kitflow.best') || 0);
  const dailyBest = +(localStorage.getItem(dailyKey(todaySeed())) || 0);
  const playing = phase !== 'title';
  return (
    <div className="overlay">
      <div className="dialog">
        <div className="hd">
          <div className="logo" style={{ width: 40, height: 40 }}><Boxes size={22} /></div>
          <h2>KitFlow · Warehouse Ops</h2>
          <p>Run the Riverside Hub kit-to-machine line for one shift (06:00–14:00). Keep the cells fed, keep the floor clean, and get every machine out the door on time.</p>
        </div>
        <div className="bd">
          <div className="howto">
            {HOWTO.map((h) => (
              <div key={h.t}>
                <div className="icon-tile">{h.icon}</div>
                <div><b>{h.t}</b>{h.d}</div>
              </div>
            ))}
          </div>
          <p className="sub" style={{ marginBottom: 12 }}>
            Shortcuts: <b>D</b> detrash next kit · <b>Space</b> pause · <b>Esc</b> close. Drag the map to pan, scroll or pinch to zoom.
          </p>
          {playing ? (
            <button className="btn pri" style={{ width: '100%', padding: 12 }} onClick={() => { setHelp(false); togglePause(false); }}>Resume shift</button>
          ) : (
            <>
              <button className="btn pri" style={{ width: '100%', padding: 12, fontSize: 14 }} onClick={() => planShift(false)}><Dices size={16} /> Start shift</button>
              <button className="btn" style={{ width: '100%', padding: 12, marginTop: 8 }} onClick={() => planShift(true)}>
                <CalendarDays size={15} /> Daily challenge{dailyBest ? ` · today's best ${money(dailyBest)}` : ''}
              </button>
            </>
          )}
          {best > 0 && !playing && <p className="sub" style={{ textAlign: 'center', marginTop: 10 }}>Best shift: {money(best)}</p>}
        </div>
      </div>
    </div>
  );
}

const dailyKey = (seed: number) => `kitflow.daily.${seed}`;
const dateLabel = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ShiftBriefing() {
  const phase = useUi((s) => s.phase);
  const plan = useUi((s) => s.plan);
  if (phase !== 'briefing' || !plan) return null;
  return (
    <div className="overlay">
      <div className="dialog">
        <div className="hd">
          <div className="sub">Shift briefing · Riverside Hub</div>
          <h2>{plan.daily ? `Daily challenge · ${dateLabel()}` : 'Today’s conditions'}</h2>
          <p>{plan.daily ? 'Everyone gets the same orders and conditions today.' : 'These conditions hold for the whole shift, 06:00–14:00.'}</p>
        </div>
        <div className="bd">
          <ModList mods={plan.mods} />
          <button className="btn pri" style={{ width: '100%', padding: 12, fontSize: 14 }} onClick={() => beginShift()}>Clock in</button>
          <button className="btn" style={{ width: '100%', padding: 10, marginTop: 8 }} onClick={() => useUi.setState({ phase: 'title' })}>Back</button>
        </div>
      </div>
    </div>
  );
}

export function ShiftReport() {
  const phase = useUi((s) => s.phase);
  return phase === 'over' ? <ReportCard /> : null;
}

function ReportCard() {
  const [copied, setCopied] = useState(false);
  const [{ r, best, isBest }] = useState(() => {
    const r = report();
    const best = +(localStorage.getItem('kitflow.best') || 0);
    // admin/debug shifts never count toward best scores
    if (isTainted()) return { r, best, isBest: false };
    if (r.score > best) localStorage.setItem('kitflow.best', String(r.score));
    if (S.daily && r.score > +(localStorage.getItem(dailyKey(S.seed)) || -Infinity)) localStorage.setItem(dailyKey(S.seed), String(r.score));
    return { r, best, isBest: r.score > best };
  });
  const st = S.stats;
  const color = { S: '#d97706', A: '#16a34a', B: '#2563eb', C: '#64748b', D: '#dc2626' }[r.grade];
  const shipped = S.shipments.filter((s) => s.stage === 'shipped' || s.stage === 'delivered');
  const share = () => {
    const blocks = shipped.map((s) => (s.late ? '🟨' : '🟩')).join('') + '⬜'.repeat(Math.min(8, r.open));
    const url = /^https?:/.test(location.href) ? `\n${location.href.split('#')[0]}` : '';
    const text = `🏭 KitFlow${S.daily ? ' Daily' : ''} · ${dateLabel()}\n🎲 ${modNames(S.mods)}\nGrade ${r.grade} · ${money(r.score)} · ${pct(r.onTimePct)} on-time\n${blocks}\n✂️ ${st.kitsDetrashed} kits detrashed · ${st.damage} parts damaged${url}`;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(done, () => prompt('Copy your result:', text));
  };
  const top = Object.entries(
    shipped.reduce<Record<string, number>>((a, s) => ((a[s.model] = (a[s.model] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="overlay">
      <div className="dialog">
        <div className="hd" style={{ textAlign: 'center' }}>
          <div className="sub">{S.daily ? 'Daily challenge' : 'Shift report'} · Riverside Hub</div>
          <div className="grade" style={{ color }}>{r.grade}</div>
          <h2 style={{ marginTop: 2 }}>{money(r.score)} net revenue</h2>
          <p>{isTainted() ? 'Admin shift · not ranked' : isBest ? 'New best shift!' : best ? `Best: ${money(best)}` : 'First shift logged.'}</p>
          <ModChips mods={S.mods} />
        </div>
        <div className="bd">
          <div className="report">
            <div><div className="lbl">Shipped</div><div className="val">{st.shipped} <span className="muted" style={{ fontSize: 12 }}>of {st.orders} orders</span></div></div>
            <div><div className="lbl">On-time delivery</div><div className="val">{pct(r.onTimePct)}</div></div>
            <div><div className="lbl">Kits detrashed</div><div className="val">{st.kitsDetrashed} <span className="muted" style={{ fontSize: 12 }}>{r.avgDetrash ? `avg ${r.avgDetrash.toFixed(1)}s` : ''}</span></div></div>
            <div><div className="lbl">Parts damaged</div><div className="val">{st.damage}</div></div>
            <div><div className="lbl">Detention + repairs</div><div className="val">{money(st.detention + st.repairs * S.tune.repairCost)}</div></div>
            <div><div className="lbl">Top machine</div><div className="val" style={{ fontSize: 15 }}>{top ? `${MODELS[top[0] as keyof typeof MODELS].short} ×${top[1]}` : '—'}</div></div>
          </div>
          <button className="btn pri" style={{ width: '100%', padding: 12 }} onClick={share}><Share2 size={15} /> {copied ? 'Copied!' : 'Share result'}</button>
          <button className="btn" style={{ width: '100%', padding: 12, marginTop: 8 }} onClick={() => planShift(false)}><Dices size={15} /> New shift</button>
          <button className="btn" style={{ width: '100%', padding: 10, marginTop: 8 }} onClick={() => restartShift()}><Repeat size={15} /> Replay this shift</button>
        </div>
      </div>
    </div>
  );
}
