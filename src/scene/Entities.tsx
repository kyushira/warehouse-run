/** Dynamic yard objects. Positions are sampled from the sim every frame. */
import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Ban, Recycle, ScanBarcode, Scissors, Send, Truck, Wrench } from 'lucide-react';
import { TUNE } from '../game/content';
import { IN_DOORS, OUT_DOCKS, SKIP_POS, WC_POS, WC_SIZE, poseAt, truckKeys } from '../game/layout';
import {
  S, bookTruck, canShip, emptySkip, kitById, kitProgress, machineById, repairWC, shipmentById, truckById,
} from '../game/sim';
import { openDispatch, openKit, sfx, useSim, useUi } from '../game/store';
import { mmss } from '../ui/format';
import { Box, ForkliftModel, KitStatic, MachineModel, Pallet, TruckModel } from './models';
import { C, labelTexture, mat } from './materials';

const KIT_SCALE = 0.62;

const click = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  if (e.delta > 8) return;
  e.stopPropagation();
  fn();
};
const hover = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
  onPointerOut: () => { document.body.style.cursor = ''; },
};

function Pin({ y, tone, icon, label, onClick, bounce }: { y: number; tone: string; icon: ReactNode; label: string; onClick?: () => void; bounce?: boolean }) {
  return (
    <Html position={[0, y, 0]} zIndexRange={[20, 0]}>
      <div className={`pin ${tone} ${bounce ? 'bounce' : ''}`} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
        <div className="bub"><span className="ic">{icon}</span>{label}</div>
        <div className="stem" />
      </div>
    </Html>
  );
}

function Tag({ y, children }: { y: number; children: ReactNode }) {
  return (
    <Html position={[0, y, 0]} zIndexRange={[10, 0]} center>
      <div className="tag3d">{children}</div>
    </Html>
  );
}

function carrierOf(id: string) {
  return S.forklifts.find((f) => f.carry?.id === id);
}

/* ---------------------------------- kits ----------------------------------- */
function KitEntity({ id }: { id: string }) {
  const g = useRef<THREE.Group>(null);
  const k = kitById(id);
  useFrame(() => {
    const kit = kitById(id);
    if (!kit || !g.current) return;
    const f = carrierOf(id);
    g.current.position.set(kit.pos.x, f ? 0.13 + f.lift * 0.45 : 0, kit.pos.z);
    g.current.rotation.y = f ? f.yaw : 0;
  });
  if (!k) return null;
  const sel = useUi.getState().selected === k.shipmentId;
  return (
    <group ref={g} position={[k.pos.x, 0, k.pos.z]}>
      <group scale={KIT_SCALE} onClick={click(() => (k.state === 'waiting' || k.state === 'scan' ? openKit(k.id) : useUi.getState().select(k.shipmentId)))} {...hover}>
        <KitStatic kit={k} />
      </group>
      {sel && <SelRing r={1.2} />}
      {k.state === 'waiting' && k.by === null && (
        <Pin y={1.7} tone="warn" icon={<Scissors size={12} />} label={kitProgress(k) > 0 ? `Detrash ${Math.round(kitProgress(k) * 100)}%` : 'Detrash'} onClick={() => openKit(k.id)} bounce />
      )}
      {k.state === 'scan' && k.by === null && (
        <Pin y={1.7} tone="" icon={<ScanBarcode size={12} />} label="Scan GR" onClick={() => openKit(k.id)} bounce />
      )}
    </group>
  );
}

function SelRing({ r }: { r: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (m.current) m.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.06);
  });
  return (
    <mesh ref={m} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r + 0.14, 40]} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.8} />
    </mesh>
  );
}

/* -------------------------------- machines --------------------------------- */
function MachineEntity({ id }: { id: string }) {
  const g = useRef<THREE.Group>(null);
  const spark = useRef<THREE.Mesh>(null);
  const m = machineById(id);
  useFrame(({ clock }) => {
    const mm = machineById(id);
    if (!mm || !g.current) return;
    const f = carrierOf(id);
    g.current.position.set(mm.pos.x, f ? 0.13 + f.lift * 0.45 : 0, mm.pos.z);
    g.current.rotation.y = f ? f.yaw + Math.PI / 2 : mm.state === 'staged' || mm.state === 'loading' ? Math.PI / 2 : 0;
    if (spark.current) {
      const wc = S.wcs[mm.wc];
      const on = mm.state === 'building' && !wc.down;
      spark.current.visible = on && Math.sin(clock.elapsedTime * 23) > 0.2;
      const t = clock.elapsedTime * 1.7;
      spark.current.position.set(Math.sin(t) * 0.9, 0.6 + mm.progress * 1.4, Math.cos(t * 1.3) * 0.5);
    }
  });
  if (!m) return null;
  const sh = shipmentById(m.shipmentId);
  const tr = truckById(sh?.truckId);
  const building = m.state === 'building' || m.state === 'done';
  const sel = useUi.getState().selected === m.shipmentId;
  return (
    <group ref={g}>
      <group scale={building ? 1 : 0.82} onClick={click(() => sh && useUi.getState().select(sh.id))} {...hover}>
        {!building && <group scale={[1.5, 1, 1.25]}><Pallet /></group>}
        <group position={[0, building ? 0 : 0.26, 0]}><MachineModel model={m.model} p={m.state === 'building' ? m.progress : 1} /></group>
      </group>
      <mesh ref={spark} material={mat('#fde68a', { emissive: '#fbbf24', ei: 3 })}><sphereGeometry args={[0.09, 8, 6]} /></mesh>
      {sel && !building && <SelRing r={1.7} />}
      {m.state === 'staged' && sh && (canShip(sh)
        ? <Pin y={3} tone="good" icon={<Send size={12} />} label="Dispatch" onClick={() => openDispatch(sh.id)} bounce />
        : !tr && <Pin y={3} tone="" icon={<Truck size={12} />} label="Book truck" onClick={() => { sfx('click'); bookTruck(sh.id); }} bounce />)}
    </group>
  );
}

/* -------------------------------- forklifts -------------------------------- */
function ForkliftEntity({ idx }: { idx: number }) {
  const g = useRef<THREE.Group>(null);
  const fork = useRef<THREE.Group>(null);
  useFrame(() => {
    const f = S.forklifts[idx];
    if (!f || !g.current) return;
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
    if (fork.current) fork.current.position.y = 0.08 + f.lift * 0.45;
  });
  return (
    <group ref={g}>
      <ForkliftModel forkRef={fork} moving={() => !!S.forklifts[idx]?.path.length} />
    </group>
  );
}

/* --------------------------------- trucks ---------------------------------- */
function TruckEntity({ id }: { id: string }) {
  const g = useRef<THREE.Group>(null);
  const tr = truckById(id);
  useFrame(() => {
    const t = truckById(id);
    if (!t || !g.current) return;
    let u = 1, leaving = false, vis = true;
    if (t.state === 'enroute') {
      if (t.dock < 0 || t.eta > TUNE.truckAnim) vis = false;
      else u = 1 - t.eta / TUNE.truckAnim;
    } else if (t.state === 'departing') {
      leaving = true;
      u = t.anim;
    }
    g.current.visible = vis;
    if (!vis) return;
    const p = poseAt(truckKeys(t.kind, t.dock, leaving), u);
    g.current.position.set(p.x, 0, p.z);
    g.current.rotation.y = p.yaw;
  });
  if (!tr) return null;
  const sh = shipmentById(tr.shipmentId);
  return (
    <group ref={g} visible={false}>
      <group onClick={click(() => sh && useUi.getState().select(sh.id))} {...hover}>
        <TruckModel carrier={tr.carrier} open={tr.state === 'docked'} />
      </group>
      {tr.kind === 'out' && tr.state === 'docked' && tr.detention > 0 && (
        <Tag y={4.4}><span style={{ color: '#dc2626' }}>Detention ${Math.round(tr.detention)}</span></Tag>
      )}
      {tr.kind === 'out' && tr.state === 'docked' && sh && canShip(sh) && (
        <Pin y={4.6} tone="good" icon={<Send size={12} />} label={`Dispatch ${sh.id.replace('SHP-', '#')}`} onClick={() => openDispatch(sh.id)} />
      )}
    </group>
  );
}

function InboundDoors() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    IN_DOORS.forEach((_, i) => {
      const m = refs.current[i];
      if (!m) return;
      const open = S.trucks.some((t) => t.kind === 'in' && t.dock === i && (t.state === 'docked' || (t.state === 'enroute' && t.eta < 1.2)));
      const target = open ? 0.08 : 1;
      m.scale.y += (target - m.scale.y) * Math.min(1, dt * 4);
      m.position.y = 4 - (4 * m.scale.y) / 2;
    });
  });
  return (
    <group>
      {IN_DOORS.map((d, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[d.x, 2, -12.12]} material={mat('#cbd5e1', { rough: 0.5 })} castShadow>
          <boxGeometry args={[4, 4, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------- workcentres ------------------------------- */
function Workcentre({ idx }: { idx: number }) {
  const wc = S.wcs[idx];
  const { x, z } = WC_POS[idx];
  const light = useRef<THREE.MeshStandardMaterial>(null);
  const nameTex = useMemo(() => labelTexture(wc.id, { fg: '#ffffff', bg: '#1e3a8a', w: 256, h: 112, size: 64 }), [wc.id]);
  useFrame(({ clock }) => {
    const w = S.wcs[idx];
    if (!light.current) return;
    const col = !w.unlocked ? '#64748b' : w.down ? '#ef4444' : w.state === 'building' ? '#22c55e' : w.state === 'blocked' ? '#3b82f6' : '#f59e0b';
    light.current.color.set(col);
    light.current.emissive.set(col);
    light.current.emissiveIntensity = w.down ? (Math.sin(clock.elapsedTime * 8) > 0 ? 2.5 : 0.3) : 1.4;
  });
  const { w: W, d: D } = WC_SIZE;
  const fence = mat('#94a3b8', { opacity: 0.55 });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={wc.unlocked ? '#e2e8f0' : '#cbd5e1'} />
      </mesh>
      {[[0, -D / 2, W, 0.1], [0, D / 2, W, 0.1], [-W / 2, 0, 0.1, D], [W / 2, 0, 0.1, D]].map(([px, pz, sw, sd], i) => (
        <mesh key={i} position={[px, 0.03, pz]} material={mat(i === 1 ? '#facc15' : '#f59e0b')}><boxGeometry args={[sw, 0.01, sd]} /></mesh>
      ))}
      {/* fence: back + sides */}
      <Box p={[0, 0.7, -D / 2 + 0.05]} s={[W, 1.2, 0.04]} m={fence} cast={false} />
      <Box p={[-W / 2 + 0.05, 0.7, -0.6]} s={[0.04, 1.2, D - 1.2]} m={fence} cast={false} />
      <Box p={[W / 2 - 0.05, 0.7, -0.6]} s={[0.04, 1.2, D - 1.2]} m={fence} cast={false} />
      {/* gantry */}
      <Box p={[-W / 2 + 0.25, 1.9, -D / 2 + 0.3]} s={[0.18, 3.8, 0.18]} c="#334155" />
      <Box p={[W / 2 - 0.25, 1.9, -D / 2 + 0.3]} s={[0.18, 3.8, 0.18]} c="#334155" />
      <Box p={[0, 3.75, -D / 2 + 0.3]} s={[W - 0.3, 0.22, 0.26]} c="#f59e0b" />
      <Box p={[0.6, 3.3, -D / 2 + 0.3]} s={[0.4, 0.5, 0.4]} c="#334155" />
      {/* bench + cabinet */}
      <Box p={[W / 2 - 0.6, 0.45, 1.4]} s={[0.8, 0.9, 1.6]} c="#64748b" />
      <Box p={[-W / 2 + 0.55, 0.55, 1.6]} s={[0.7, 1.1, 0.9]} c="#ef4444" />
      {/* stack light */}
      <Box p={[-W / 2 + 0.3, 1.2, -1.4]} s={[0.08, 2.4, 0.08]} c="#334155" />
      <mesh position={[-W / 2 + 0.3, 2.5, -1.4]}>
        <cylinderGeometry args={[0.13, 0.13, 0.32, 12]} />
        <meshStandardMaterial ref={light} color="#22c55e" emissive="#22c55e" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 3.75, -D / 2 + 0.45]}>
        <planeGeometry args={[1.1, 0.48]} />
        <meshBasicMaterial map={nameTex} transparent />
      </mesh>
      <WcOverlay idx={idx} />
    </group>
  );
}

function WcOverlay({ idx }: { idx: number }) {
  useSim();
  const wc = S.wcs[idx];
  if (!wc.unlocked) {
    return (
      <group>
        {[[-1.2, 1.4], [1.2, 1.4], [0, 2.6]].map(([cx, cz], i) => (
          <mesh key={i} position={[cx, 0.35, cz]} material={mat('#f97316')} castShadow><coneGeometry args={[0.22, 0.7, 12]} /></mesh>
        ))}
      </group>
    );
  }
  if (!wc.down) return null;
  return wc.repairT > 0
    ? <Tag y={4.6}><Wrench size={11} /> Repairing {mmss(wc.repairT)}</Tag>
    : <Pin y={4.6} tone="bad" icon={<Wrench size={12} />} label={`Repair $${S.tune.repairCost}`} onClick={() => repairWC(idx)} bounce />;
}

/* -------------------------------- compactor -------------------------------- */
function Compactor() {
  useSim();
  const gauge = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!gauge.current) return;
    const f = Math.max(0.02, S.skip.count / S.skip.cap);
    gauge.current.scale.y = f;
    gauge.current.position.y = 0.3 + (1.6 * f) / 2;
    (gauge.current.material as THREE.MeshStandardMaterial).color.set(f > 0.85 ? '#ef4444' : f > 0.6 ? '#f59e0b' : '#22c55e');
  });
  const full = S.skip.count >= S.skip.cap * 0.85;
  return (
    <group position={[SKIP_POS.x, 0, SKIP_POS.z]} onClick={click(() => emptySkip())} {...hover}>
      <Box p={[0, 0.9, 0]} s={[2.4, 1.8, 1.8]} c="#15803d" />
      <Box p={[0, 1.95, -0.2]} s={[2.0, 0.3, 1.2]} c="#14532d" />
      <Box p={[1.25, 1.0, 0]} s={[0.1, 1.7, 0.4]} c="#e2e8f0" cast={false} />
      <mesh ref={gauge} position={[1.31, 1, 0]}>
        <boxGeometry args={[0.06, 1.6, 0.26]} />
        <meshStandardMaterial color="#22c55e" emissive="#14532d" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 1.2, 0.91]}>
        <planeGeometry args={[1.8, 0.45]} />
        <meshBasicMaterial map={labelTexture('COMPACTOR', { fg: '#ffffff', w: 512, h: 128, size: 72 })} transparent />
      </mesh>
      {S.skip.emptyT > 0 ? <Tag y={2.8}><Recycle size={11} /> Emptying…</Tag>
        : full && <Pin y={2.8} tone="bad" icon={<Recycle size={12} />} label={`Empty ${S.skip.count}/${S.skip.cap}`} onClick={() => emptySkip()} bounce />}
    </group>
  );
}

/* ---------------------------------- root ----------------------------------- */
export function Entities() {
  useSim();
  return (
    <group>
      {S.kits.filter((k) => k.state !== 'inbound').map((k) => <KitEntity key={k.id} id={k.id} />)}
      {S.machines.map((m) => <MachineEntity key={m.id} id={m.id} />)}
      {S.forklifts.map((f, i) => <ForkliftEntity key={f.id} idx={i} />)}
      {S.trucks.map((t) => <TruckEntity key={t.id} id={t.id} />)}
      {S.wcs.map((w) => <Workcentre key={w.id} idx={w.idx} />)}
      <InboundDoors />
      <Compactor />
      <ChargePads />
      <ClosedBays />
    </group>
  );
}

/** Carrier Strike: cones across the closed bay's door */
function ClosedBays() {
  return (
    <group>
      {S.tune.closedDocks.map((i) => (
        <group key={i} position={[19.2, 0, OUT_DOCKS[i].z]}>
          {[-1.1, 0, 1.1].map((dz) => (
            <mesh key={dz} position={[0, 0.35, dz]} material={mat('#f97316')} castShadow><coneGeometry args={[0.22, 0.7, 12]} /></mesh>
          ))}
          <Tag y={1.6}><Ban size={11} /> Bay {i + 1} closed · carrier strike</Tag>
        </group>
      ))}
    </group>
  );
}

function ChargePads() {
  return (
    <group>
      {S.forklifts.map((f) => (
        <mesh key={f.id} position={[f.home.x, 0.02, f.home.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, 2.6]} />
          <meshBasicMaterial color={C.glass} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}
