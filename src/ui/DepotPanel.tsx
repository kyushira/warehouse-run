import { Bot, Factory, Flag, Lock, Recycle, ScanBarcode, Scissors, Wrench } from 'lucide-react';
import { MODELS, TUNE, UPGRADES } from '../game/content';
import {
  S, buyUpgrade, canShip, cash, emptySkip, kitProgress, repairWC, shipmentById, togglePriority, upgradeCost, waitingKits,
} from '../game/sim';
import { openKit, sfx, useSim, useUi } from '../game/store';
import type { SideTab } from '../game/store';
import { YardList } from './YardList';
import { dueText, money } from './format';
import { Bar, Chip, Swatch } from './primitives';
import { kitStatus, wcStatus } from './status';

export function KitList() {
  useSim();
  const sel = useUi((s) => s.selected);
  const select = useUi((s) => s.select);
  const order = { waiting: 0, scan: 0, clean: 1, toWC: 2, carried: 2, inbound: 3 } as const;
  const kits = [...S.kits].sort((a, b) => order[a.state] - order[b.state] || (shipmentById(a.shipmentId)!.due - shipmentById(b.shipmentId)!.due));
  if (!kits.length) return <div className="empty">No kits on site. Inbound trucks are on the way.</div>;
  return (
    <div className="list">
      {kits.map((k) => {
        const sh = shipmentById(k.shipmentId)!;
        const st = kitStatus(k);
        return (
          <div key={k.id} className={`row ${sel === sh.id ? 'sel' : ''}`} onClick={() => select(sh.id)}>
            <Swatch model={k.model} />
            <div className="grow">
              <div className="t1">{k.id} <Chip s={st} />{k.damage > 0 && <Chip s={{ label: `${k.damage} dmg`, tone: 'bad' }} />}</div>
              <div className="t2">Op {k.op} · {sh.id} · {MODELS[k.model].short} · {dueText(sh.due)}</div>
              {k.state === 'waiting' && <Bar v={kitProgress(k)} tone={k.by === 'operator' ? '' : 'warn'} />}
            </div>
            {k.state === 'waiting' && (
              <button className="btn sm pri" onClick={(e) => { e.stopPropagation(); openKit(k.id); }}>
                <Scissors size={13} /> Detrash
              </button>
            )}
            {k.state === 'scan' && (
              <button className="btn sm pri" onClick={(e) => { e.stopPropagation(); openKit(k.id); }}>
                <ScanBarcode size={13} /> Scan GR
              </button>
            )}
            {k.state === 'clean' && (
              <button className={`btn sm ${k.priority ? 'pri' : ''}`} title="Build this kit next" onClick={(e) => { e.stopPropagation(); sfx('click'); togglePriority(k.id); }}>
                <Flag size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WcList() {
  useSim();
  return (
    <div className="list">
      {S.wcs.map((w) => {
        const st = wcStatus(w);
        return (
          <div key={w.id} className="row">
            <div className={`icon-tile ${w.down ? 'bad' : w.state === 'building' ? '' : w.state === 'blocked' ? 'good' : ''}`} style={{ width: 30, height: 30 }}>
              {w.unlocked ? <Factory size={15} /> : <Lock size={15} />}
            </div>
            <div className="grow">
              <div className="t1">{w.id} <Chip s={st} /></div>
              <div className="t2">
                {!w.unlocked ? 'Commission it in Upgrades' : w.model ? `${MODELS[w.model].name}` : 'Waiting for a clean kit'}
              </div>
              {w.unlocked && (w.state === 'building' || w.state === 'blocked') && <Bar v={w.progress} tone={w.down ? 'bad' : w.state === 'blocked' ? 'good' : ''} />}
            </div>
            {w.down && w.repairT <= 0 && (
              <button className="btn sm danger" onClick={() => repairWC(w.idx)}>
                <Wrench size={13} /> Repair {money(S.tune.repairCost)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CompactorRow() {
  useSim();
  const { count, cap, emptyT } = S.skip;
  const f = count / cap;
  return (
    <div className="row" style={{ padding: '4px 0' }}>
      <div className={`icon-tile ${f > 0.85 ? 'bad' : f > 0.6 ? 'warn' : 'good'}`} style={{ width: 30, height: 30 }}><Recycle size={15} /></div>
      <div className="grow">
        <div className="t1">Compactor <span className="muted mono">{count}/{cap}</span></div>
        <Bar v={emptyT > 0 ? emptyT / TUNE.skipEmptySec : f} tone={f > 0.85 ? 'bad' : f > 0.6 ? 'warn' : 'good'} />
      </div>
      <button className="btn sm" disabled={emptyT > 0 || count === 0} onClick={() => emptySkip()}>
        {emptyT > 0 ? 'Emptying…' : 'Empty'}
      </button>
    </div>
  );
}

export function UpgradeList() {
  useSim();
  const budget = cash();
  return (
    <div className="list">
      {UPGRADES.map((u) => {
        const lvl = S.up[u.id];
        const cost = upgradeCost(u.id);
        const maxed = cost === undefined;
        return (
          <div key={u.id} className="row">
            <div className="grow">
              <div className="t1">
                {u.id === 'operator' && <Bot size={13} />}
                {u.name}
                {u.cost.length > 1 && <span className="muted">Lv {lvl}/{u.cost.length}</span>}
              </div>
              <div className="t2">{u.desc}</div>
            </div>
            <button className={`btn sm ${!maxed && budget >= cost ? 'pri' : ''}`} disabled={maxed || budget < cost} onClick={() => buyUpgrade(u.id)}>
              {maxed ? 'Owned' : money(cost)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function SidePanel() {
  useSim();
  const tab = useUi((s) => s.sideTab);
  const setTab = useUi((s) => s.setSideTab);
  const kits = waitingKits().length;
  const ready = S.shipments.filter(canShip).length;
  const status = S.wcs.some((w) => w.down) ? { label: 'Breakdown', tone: 'bad' as const }
    : kits > 3 || S.recv.every(Boolean) ? { label: 'Congested', tone: 'warn' as const } : { label: 'Operational', tone: 'good' as const };
  const tabs: { id: SideTab; label: string; badge?: number }[] = [
    { id: 'floor', label: 'Floor', badge: kits || undefined },
    { id: 'yard', label: 'Yard', badge: ready || undefined },
    { id: 'shop', label: 'Shop' },
  ];
  return (
    <aside className="right panel">
      <div className="depot-h">
        <h3>Riverside Hub <Chip s={status} /></h3>
        <div className="tabs" style={{ marginTop: 10 }}>
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}{t.badge !== undefined && <span className="tbadge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        {tab === 'floor' && <FloorTab />}
        {tab === 'yard' && <YardList />}
        {tab === 'shop' && <ShopTab />}
      </div>
    </aside>
  );
}

export function FloorTab() {
  return (
    <>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Kit prep</span><span className="sub">{S.recv.filter(Boolean).length}/{S.recv.length} slots</span></div>
        <KitList />
      </div>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Workcentres</span><span className="sub">Auto-build</span></div>
        <WcList />
      </div>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Waste</span></div>
        <CompactorRow />
      </div>
    </>
  );
}

export function ShopTab() {
  useSim();
  return (
    <div className="sect">
      <div className="sect-h"><span className="h-title">Upgrades</span><span className="sub mono">Budget {money(cash())}</span></div>
      <UpgradeList />
    </div>
  );
}
