import { Forklift, Send, Truck } from 'lucide-react';
import { IN_DOORS, OUT_DOCKS } from '../game/layout';
import { MODELS } from '../game/content';
import { S, canShip, dockClosed, shipmentById } from '../game/sim';
import { openDispatch, useSim, useUi } from '../game/store';
import { Chip } from './primitives';
import { truckStatus } from './status';

/** Docks, inbound doors, gate queue and forklifts in one list. */
export function YardList() {
  useSim();
  const select = useUi((s) => s.select);
  const gate = S.trucks.filter((t) => t.kind === 'in' && t.state === 'enroute' && t.dock < 0);
  return (
    <>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Outbound bays</span></div>
        <div className="list">
          {OUT_DOCKS.map((_, i) => {
            const tr = S.trucks.find((t) => t.kind === 'out' && t.dock === i && t.state !== 'departing');
            const sh = shipmentById(tr?.shipmentId);
            return (
              <div key={i} className="row" onClick={() => sh && select(sh.id)} style={{ cursor: sh ? 'pointer' : undefined }}>
                <div className={`icon-tile ${tr ? 'good' : ''}`} style={{ width: 30, height: 30 }}><Truck size={15} /></div>
                <div className="grow">
                  <div className="t1">Bay {i + 1} {tr ? <Chip s={truckStatus(tr)} /> : dockClosed(i) ? <Chip s={{ label: 'Closed', tone: 'bad' }} /> : <Chip s={{ label: 'Available', tone: 'muted' }} />}</div>
                  <div className="t2">{tr && sh ? `${tr.id} · ${tr.carrier} · ${sh.id} · ${MODELS[sh.model].short}` : dockClosed(i) ? 'No carrier for this bay today' : 'No truck assigned'}</div>
                </div>
                {sh && canShip(sh) && (
                  <button className="btn sm go pulse" onClick={(e) => { e.stopPropagation(); openDispatch(sh.id); }}><Send size={13} /> Dispatch</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Inbound</span>{gate.length > 0 && <span className="sub">{gate.length} at the gate</span>}</div>
        <div className="list">
          {IN_DOORS.map((_, i) => {
            const tr = S.trucks.find((t) => t.kind === 'in' && t.dock === i && t.state !== 'departing');
            return (
              <div key={i} className="row">
                <div className="icon-tile warn" style={{ width: 30, height: 30 }}><Truck size={15} /></div>
                <div className="grow">
                  <div className="t1">Door {String.fromCharCode(65 + i)} {tr ? <Chip s={truckStatus(tr)} /> : <Chip s={{ label: 'Open', tone: 'muted' }} />}</div>
                  <div className="t2">{tr ? `${tr.id} · ${tr.carrier} · ${tr.kitId}` : 'Clear'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sect">
        <div className="sect-h"><span className="h-title">Forklifts</span><span className="sub">{S.tasks.length ? `${S.tasks.length} moves queued` : 'No queue'}</span></div>
        <div className="list">
          {S.forklifts.map((f) => (
            <div key={f.id} className="row">
              <div className="icon-tile" style={{ width: 30, height: 30 }}><Forklift size={15} /></div>
              <div className="grow">
                <div className="t1">{f.id} <Chip s={f.task ? { label: f.carry ? 'Carrying' : 'En route', tone: 'info' } : { label: 'Available', tone: 'good' }} /></div>
                <div className="t2">{f.task ? f.task.label : f.state === 'home' ? 'Returning to charger' : 'Idle at charger'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
