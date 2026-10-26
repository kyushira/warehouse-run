/**
 * Dock dispatch: ERP goods issue. Scan the machine serial, scan the trailer,
 * apply the seal, then post GI. The forklift loads after posting.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useFitCamera } from '../scene/fitCamera';
import { CircleCheck, Lock, ScanBarcode, Send, ShieldAlert, Truck, X } from 'lucide-react';
import { MODELS } from '../game/content';
import { canShip, giReady, giStep, machineById, shipOut, shipmentById, truckById } from '../game/sim';
import type { GiStep, Shipment } from '../game/sim';
import { closeDispatch, sfx, useSim, useUi } from '../game/store';
import { dueText, money } from '../ui/format';
import { CANVAS_DPR, Chip } from '../ui/primitives';
import { MachineModel, Pallet, TruckModel } from '../scene/models';
import { FloorFeed } from './DetrashModal';
import { barcodeTexture, labelTexture, mat } from '../scene/materials';

type Feedback = (text: string, bad: boolean) => void;

function Target({ pos, size, tex, step, sh, feedback, done }: {
  pos: [number, number, number]; size: [number, number]; tex: THREE.Texture; step: GiStep; sh: Shipment; feedback: Feedback; done: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const [hl, setHl] = useState(false);
  useFrame(({ clock }) => {
    if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = done ? 0 : 0.35 + Math.sin(clock.elapsedTime * 5) * 0.25;
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8 || done) return;
    e.stopPropagation();
    const r = giStep(sh.id, step);
    if (r.ok) {
      sfx(step === 'seal' ? 'seal' : 'scan');
      useUi.getState().bump();
    } else if (r.hint) {
      sfx('deny');
      feedback(r.hint, true);
    }
  };
  return (
    <group
      position={pos}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); setHl(!done); document.body.style.cursor = done ? '' : 'crosshair'; }}
      onPointerOut={() => { setHl(false); document.body.style.cursor = ''; }}
    >
      <mesh scale={hl ? 1.06 : 1}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh ref={ring} position={[0, 0, -0.005]}>
        <planeGeometry args={[size[0] + 0.14, size[1] + 0.14]} />
        <meshBasicMaterial color="#2563eb" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

const FIT_T = Math.tan(THREE.MathUtils.degToRad(19));
function FitCamera() {
  useFitCamera([2.6, 1.7, 4.2], [0, 1.3, 0], (aspect) => Math.max(2.9 / FIT_T, 3.1 / (FIT_T * aspect)));
  return null;
}

function DockView({ sh, feedback }: { sh: Shipment; feedback: Feedback }) {
  useSim();
  const m = machineById(sh.machineId);
  const tr = truckById(sh.truckId);
  const serialTex = useMemo(() => barcodeTexture(m?.serial ?? 'SN', sh.gi.serial ? 'good' : 'plain'), [m?.serial, sh.gi.serial]);
  const trailerTex = useMemo(() => barcodeTexture(tr?.trailer ?? 'TRL', sh.gi.trailer ? 'good' : 'plain'), [tr?.trailer, sh.gi.trailer]);
  const sealTex = useMemo(
    () => labelTexture(sh.gi.seal ?? 'APPLY SEAL', { fg: sh.gi.seal ? '#14532d' : '#7c2d12', bg: sh.gi.seal ? '#bbf7d0' : '#fde68a', w: 256, h: 128, size: sh.gi.seal ? 34 : 38, border: '#a16207' }),
    [sh.gi.seal],
  );
  if (!m || !tr) return null;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {/* dock leveller + yellow edge */}
      <mesh position={[0, 0.02, -1.2]} material={mat('#facc15')}><boxGeometry args={[3, 0.04, 0.25]} /></mesh>
      <group position={[0, 0, -1.25]} rotation={[0, Math.PI, 0]}>
        <TruckModel carrier={tr.carrier} open={false} />
      </group>
      {/* trailer number plate on the rear door */}
      <Target pos={[0.62, 2.55, -1.2]} size={[0.9, 0.45]} tex={trailerTex} step="trailer" sh={sh} feedback={feedback} done={sh.gi.trailer} />
      {/* seal on the door latch */}
      <mesh position={[-0.05, 1.55, -1.19]} material={mat('#475569', { metal: 0.6, rough: 0.3 })}><boxGeometry args={[0.16, 0.5, 0.06]} /></mesh>
      <Target pos={[-0.05, 1.05, -1.17]} size={[0.62, 0.31]} tex={sealTex} step="seal" sh={sh} feedback={feedback} done={!!sh.gi.seal} />
      {/* machine on its skid */}
      <group position={[0, 0, 1.3]} scale={0.7}>
        <group scale={[1.5, 1, 1.25]}><Pallet /></group>
        <group position={[0, 0.26, 0]}><MachineModel model={m.model} p={1} /></group>
      </group>
      <Target pos={[0, 0.42, 2.12]} size={[0.8, 0.4]} tex={serialTex} step="serial" sh={sh} feedback={feedback} done={sh.gi.serial} />
    </group>
  );
}

export function DispatchModal() {
  useSim();
  const id = useUi((s) => s.dispatch);
  const sh = shipmentById(id);
  const [msg, setMsg] = useState<{ text: string; bad: boolean; n: number } | null>(null);
  const timer = useRef<number>(0);
  const feedback: Feedback = (text, bad) => {
    setMsg((m) => ({ text, bad, n: (m?.n ?? 0) + 1 }));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 1800);
  };
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDispatch();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [id]);
  if (!id || !sh) return null;
  const m = machineById(sh.machineId);
  const tr = truckById(sh.truckId);
  const ok = canShip(sh);
  const steps: { k: string; label: string; done: boolean }[] = [
    { k: 'serial', label: 'Scan serial', done: sh.gi.serial },
    { k: 'trailer', label: 'Scan trailer', done: sh.gi.trailer },
    { k: 'seal', label: 'Apply seal', done: !!sh.gi.seal },
    { k: 'post', label: 'Post GI', done: false },
  ];
  const curIdx = steps.findIndex((s) => !s.done);
  const hint = msg?.text ?? (!ok ? 'This shipment is no longer at the dock.'
    : !sh.gi.serial ? 'Scan the serial label on the machine skid'
      : !sh.gi.trailer ? `Scan the trailer plate on ${tr?.id}`
        : !sh.gi.seal ? 'Click the latch to apply a security seal' : 'Post the goods issue to release the load');
  const post = () => {
    if (shipOut(sh.id)) {
      closeDispatch();
      useUi.getState().bump();
    }
  };
  return (
    <div className="dt-wrap" onPointerDown={(e) => e.target === e.currentTarget && closeDispatch()}>
      <div className="dt wide" role="dialog" aria-label="Dock dispatch">
        <div className="dt-h">
          <div className="icon-tile good"><Truck size={18} /></div>
          <div className="grow">
            <b>Dispatch · {sh.id} → {sh.city}</b>
            <div className="sub">{MODELS[sh.model].name} · {sh.customer} · {dueText(sh.due)} · Bay {tr ? tr.dock + 1 : '—'}</div>
          </div>
          <button className="btn icon" aria-label="Close" onClick={closeDispatch}><X size={16} /></button>
        </div>
        <div className="layers">
          {steps.map((s, i) => (
            <span key={s.k} className={`layer ${s.done ? 'done' : i === curIdx ? 'cur' : ''}`}>
              {s.done ? <CircleCheck size={13} /> : s.k === 'seal' ? <Lock size={13} /> : s.k === 'post' ? <Send size={13} /> : <ScanBarcode size={13} />}
              {s.label}
            </span>
          ))}
        </div>
        <div key={msg?.n ?? 0} className={`dt-hint ${msg?.bad ? 'shake' : ''}`}>
          {msg?.bad && <ShieldAlert size={15} />}{hint}
        </div>
        <div className="dt-body">
          <div className="dt-view">
            {ok && (
              <Canvas shadows flat dpr={CANVAS_DPR} camera={{ position: [2.6, 3, 4.2], fov: 38 }}>
                <color attach="background" args={['#eef3fa']} />
                <hemisphereLight args={['#ffffff', '#b9c6d8', 1.1]} />
                <directionalLight position={[5, 9, 6]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
                <DockView sh={sh} feedback={feedback} />
                <OrbitControls makeDefault enablePan={false} target={[0, 1.3, 0]} minDistance={3.5} maxDistance={14} maxPolarAngle={1.4} minAzimuthAngle={-1.1} maxAzimuthAngle={1.1} />
                <FitCamera />
              </Canvas>
            )}
          </div>
          <div className="erp">
            <div className="erp-h">
              <span className="erp-logo">ERP</span>
              <div className="grow">
                <b>Goods issue · VL02N</b>
                <div className="sub mono">Delivery 80{sh.id.replace('SHP-', '')} · {sh.customer}</div>
              </div>
            </div>
            <table className="erp-t">
              <tbody>
                <tr className={sh.gi.serial ? 'ok' : ''}><td>Serial</td><td className="mono">{m?.serial}</td><td>{sh.gi.serial && <CircleCheck size={13} />}</td></tr>
                <tr className={sh.gi.trailer ? 'ok' : ''}><td>Trailer</td><td className="mono">{tr?.trailer} · {tr?.carrier}</td><td>{sh.gi.trailer && <CircleCheck size={13} />}</td></tr>
                <tr className={sh.gi.seal ? 'ok' : ''}><td>Seal</td><td className="mono">{sh.gi.seal ?? '—'}</td><td>{sh.gi.seal && <CircleCheck size={13} />}</td></tr>
                <tr><td>Ship-to</td><td colSpan={2}>{sh.city}</td></tr>
                <tr><td>Value</td><td colSpan={2} className="mono">{money(sh.value)}{sh.rush ? ' · rush' : ''}</td></tr>
              </tbody>
            </table>
            <div className="erp-f">
              <div className="sub">{giReady(sh) ? 'Ready to post' : `${steps.filter((s) => s.done).length}/3 checks`}</div>
              <button className={`btn ${giReady(sh) ? 'go pulse' : ''}`} disabled={!giReady(sh) || !ok} onClick={post}>
                <Send size={14} /> Post GI
              </button>
            </div>
            {!ok && <Chip s={{ label: 'Truck not at dock', tone: 'bad' }} />}
          </div>
        </div>
        <FloorFeed />
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}
