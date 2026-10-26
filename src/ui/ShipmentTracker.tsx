import { ClipboardCheck, Forklift, Hammer, Package, PackageCheck, ScanBarcode, Scissors, Send, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MODELS } from '../game/content';
import { S, STAGES, STAGE_LABEL, bookTruck, shipmentById, truckById } from '../game/sim';
import type { Shipment, Stage } from '../game/sim';
import { openDispatch, openKit, sfx, useSim, useUi } from '../game/store';
import { at, dueText, money, mmss } from './format';
import { Chip } from './primitives';
import { shipmentActions, shipmentHealth, truckStatus } from './status';

const ICON: Record<Stage, LucideIcon> = {
  confirmed: ClipboardCheck, received: Package, detrashed: Scissors, scanned: ScanBarcode, building: Hammer,
  staged: PackageCheck, loading: Forklift, shipped: Truck, delivered: Truck,
};

const SHORT: Record<Stage, string> = {
  confirmed: 'Confirmed', received: 'Received', detrashed: 'Detrashed', scanned: 'GR posted', building: 'Building',
  staged: 'Staged', loading: 'Loading', shipped: 'Shipped', delivered: 'Delivered',
};

export const activeShipments = () =>
  S.shipments.filter((s) => s.stage !== 'delivered').sort((a, b) => {
    const rank = (x: Shipment) => (x.stage === 'shipped' ? 1 : 0);
    return rank(a) - rank(b) || a.due - b.due;
  });

export function useSelectedShipment() {
  useSim();
  const sel = useUi((s) => s.selected);
  const list = activeShipments();
  const cur = shipmentById(sel);
  return cur && cur.stage !== 'delivered' ? cur : list[0];
}

export function Stepper({ sh }: { sh: Shipment }) {
  const cur = sh.stage === 'delivered' ? STAGES.length : sh.stage === 'loading' ? STAGES.indexOf('shipped') : STAGES.indexOf(sh.stage);
  return (
    <div className="stepper">
      {STAGES.map((st, i) => {
        const Ic = ICON[st];
        const cls = i < cur || (i === cur && sh.stage === 'shipped') ? 'done' : i === cur ? 'cur' : '';
        const t = sh.stageAt[st];
        return (
          <div key={st} className={`step ${cls}`}>
            <div className="node"><Ic size={15} /></div>
            <div className="lab" title={STAGE_LABEL[st]}>{SHORT[st]}</div>
            <div className="tm mono">{t !== undefined ? at(t) : '—'}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ShipActions({ sh }: { sh: Shipment }) {
  const acts = shipmentActions(sh);
  return (
    <div className="actions">
      {acts.map((a, i) => {
        if (a.kind === 'detrash') return <button key={i} className="btn pri" onClick={() => openKit(a.kitId)}><Scissors size={14} /> Detrash kit</button>;
        if (a.kind === 'book') {
          const urgent = sh.stage === 'building' || sh.stage === 'staged';
          return <button key={i} className={`btn ${urgent ? 'pri' : ''}`} onClick={() => { sfx('click'); bookTruck(sh.id); }}><Truck size={14} /> Book truck</button>;
        }
        if (a.kind === 'scan') return <button key={i} className="btn pri" onClick={() => openKit(a.kitId)}><ScanBarcode size={14} /> Scan GR</button>;
        if (a.kind === 'ship') return <button key={i} className="btn go pulse" onClick={() => openDispatch(sh.id)}><Send size={14} /> Dispatch</button>;
        return <button key={i} className="btn" disabled>{a.label}</button>;
      })}
    </div>
  );
}

export function ShipCard({ sh }: { sh: Shipment }) {
  const tr = truckById(sh.truckId);
  const health = shipmentHealth(sh);
  return (
    <div className="ship-card">
      <div className="id"><span>#{sh.id}{sh.rush && <span className="chip bad" style={{ marginLeft: 6 }}>RUSH</span>}</span><span className="mono">{money(sh.paid || sh.value)}</span></div>
      <div className="to">To: {sh.city}</div>
      <div className="meta">{MODELS[sh.model].name} · {sh.customer}</div>
      <div className="meta" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip s={health} /> <span className="mono">{sh.stage === 'shipped' || sh.stage === 'delivered' ? `shipped ${at(sh.stageAt.shipped ?? 0)}` : dueText(sh.due)}</span>
      </div>
      {tr && (
        <div className="meta" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Truck size={13} /> {tr.id} · {tr.carrier} · Bay {tr.dock + 1} <Chip s={truckStatus(tr)} />
        </div>
      )}
      <ShipActions sh={sh} />
    </div>
  );
}

export function ShipTabs() {
  const sh = useSelectedShipment();
  const select = useUi((s) => s.select);
  const list = activeShipments();
  return (
    <div className="ship-tabs">
      {list.map((s) => {
        const h = shipmentHealth(s);
        const col = h.tone === 'bad' ? '#ef4444' : h.tone === 'warn' ? '#f59e0b' : '#22c55e';
        return (
          <button key={s.id} className={`ship-tab ${s === sh ? 'sel' : ''}`} onClick={() => select(s.id)}>
            <span className="dot" style={{ background: col }} />
            {s.id.replace('SHP-', '#')} <span className="muted mono">{s.stage === 'shipped' ? 'shipped' : at(s.due)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TrackingBody() {
  const sh = useSelectedShipment();
  if (!sh) return <div className="empty">No open shipments yet.</div>;
  return (
    <div className="track-body">
      <Stepper sh={sh} />
      <ShipCard sh={sh} />
    </div>
  );
}

export function ShipmentTracker({ extraTabs }: { extraTabs?: React.ReactNode }) {
  useSim();
  return (
    <section className="track panel">
      <div className="track-h">
        <span className="h-title"><Truck size={15} /> Shipment Tracking</span>
        <ShipTabs />
        {extraTabs}
      </div>
      <TrackingBody />
      <div className="sub" style={{ marginTop: 8 }}>
        {S.stats.shipped} shipped · next order in {mmss(S.nextOrder)}
      </div>
    </section>
  );
}
