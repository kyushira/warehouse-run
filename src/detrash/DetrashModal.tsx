/**
 * Kit prep station: detrash layers, then an ERP goods receipt (scan every part
 * against the BOM, quarantine anything not on it, post the GR).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useFitCamera } from '../scene/fitCamera';
import { ArrowRight, CircleCheck, CircleX, Info, Recycle, ScanBarcode, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import { MODELS, TUNE } from '../game/content';
import {
  LAYERS, LAYER_HINT, LAYER_LABEL, S, currentLayer, emptySkip, grSummary, kitById, postGR, quarantinePart, removePiece,
  scanPart, shipmentById, touchPart, waitingKits,
} from '../game/sim';
import type { Kit, Part, Piece, TrashKind } from '../game/sim';
import { closeKit, openNextKit, sfx, useSim, useUi } from '../game/store';
import { dueText, money } from '../ui/format';
import { Bar, CANVAS_DPR, Chip, IS_TOUCH, useIsMobile } from '../ui/primitives';
import { Pallet, PartMesh, PieceGeom, sharedPieceMats } from '../scene/models';
import type { PieceMats } from '../scene/models';
import { barcodeTexture, mat } from '../scene/materials';

const SFX_FOR: Record<TrashKind, 'snip' | 'peel' | 'lift' | 'pop'> = { strap: 'snip', wrap: 'peel', card: 'lift', foam: 'pop' };

function cloneMats(): PieceMats {
  const b = sharedPieceMats();
  const c = (m: THREE.Material) => {
    const x = m.clone() as THREE.MeshStandardMaterial;
    x.transparent = true;
    return x;
  };
  return { strap: c(b.strap), buckle: c(b.buckle), wrap: c(b.wrap), card: c(b.card), tape: c(b.tape), sleeve: c(b.sleeve), foam: c(b.foam) };
}

type Feedback = (text: string, bad: boolean) => void;
const bump = () => useUi.getState().bump();

/* ------------------------------ trash pieces ------------------------------- */
function TrashPiece({ piece, kit, active, feedback }: { piece: Piece; kit: Kit; active: boolean; feedback: Feedback }) {
  const g = useRef<THREE.Group>(null);
  const mats = useMemo(cloneMats, []);
  const [gone, setGone] = useState(piece.removed);
  const [hl, setHl] = useState(false);
  const anim = useRef<{ t: number; v: THREE.Vector3; spin: THREE.Vector3 } | null>(null);

  useEffect(() => {
    for (const m of Object.values(mats) as THREE.MeshStandardMaterial[]) {
      m.emissive.set(hl ? '#3b82f6' : '#000000');
      m.emissiveIntensity = hl ? 0.45 : 0;
    }
  }, [hl, mats]);

  useFrame((_, dt) => {
    if (gone || !g.current) return;
    if (piece.removed && !anim.current) {
      const r = () => Math.random() - 0.5;
      const v =
        piece.kind === 'card' ? new THREE.Vector3(r() * 1.5, 4.5, -1.2)
          : piece.kind === 'strap' ? new THREE.Vector3(r() * 3, 3.5, r() * 3)
            : piece.kind === 'wrap' ? new THREE.Vector3(0, 1.2, 0)
              : new THREE.Vector3(r() * 4, 3.5, r() * 4);
      anim.current = { t: 0, v, spin: new THREE.Vector3(r() * 6, r() * 6, r() * 6) };
      setHl(false);
    }
    const a = anim.current;
    if (!a) return;
    a.t += dt / 0.6;
    const k = Math.min(1, a.t);
    g.current.position.set(a.v.x * k, a.v.y * k - 2.5 * k * k * (piece.kind === 'wrap' ? 0 : 1), a.v.z * k);
    if (piece.kind === 'wrap') g.current.scale.setScalar(1 + k * 0.35);
    else g.current.rotation.set(a.spin.x * k, a.spin.y * k, a.spin.z * k);
    for (const m of Object.values(mats) as THREE.MeshStandardMaterial[]) m.opacity = (piece.kind === 'wrap' ? 0.6 : 1) * (1 - k);
    if (a.t >= 1) setGone(true);
  });

  if (gone) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8 || piece.removed) return;
    e.stopPropagation();
    const res = removePiece(kit.id, piece.id);
    if (res.ok) {
      sfx(SFX_FOR[piece.kind]);
      if (res.layerDone && !res.cleared) sfx('layer');
      bump();
    } else if (res.hint) {
      sfx('deny');
      feedback(res.hint, true);
    }
  };
  return (
    <group
      ref={g}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); if (!piece.removed) { setHl(active); document.body.style.cursor = active ? 'pointer' : 'not-allowed'; } }}
      onPointerOut={() => { setHl(false); document.body.style.cursor = ''; }}
    >
      <PieceGeom piece={piece} mats={mats} />
    </group>
  );
}

/* ---------------------------------- parts ---------------------------------- */
const onBom = (kit: Kit, p: Part) => kit.bom.some((l) => l.mat === p.mat);
/** quarantined parts sit in the red tote beside the pallet */
const QUAR = new THREE.Vector3(2.15, 0, -0.45);

function ClickPart({ part, kit, feedback }: { part: Part; kit: Kit; feedback: Feedback }) {
  const g = useRef<THREE.Group>(null);
  const shake = useRef(0);
  const flash = useRef(0);
  const scanning = kit.state === 'scan';
  const flashMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 1.5, transparent: true, opacity: 0 }), []);
  useFrame((_, dt) => {
    if (!g.current) return;
    shake.current = Math.max(0, shake.current - dt);
    flash.current = Math.max(0, flash.current - dt * 2.5);
    flashMat.opacity = flash.current * 0.55;
    const qx = part.quarantined ? QUAR.x - part.x : 0, qz = part.quarantined ? QUAR.z - part.z : 0;
    const target = new THREE.Vector3(qx, part.quarantined ? 0.2 - part.y + 0.05 : 0, qz);
    g.current.position.lerp(target, Math.min(1, dt * 8));
    g.current.position.x += shake.current > 0 ? Math.sin(shake.current * 80) * 0.03 : 0;
    const s = part.quarantined ? 0.55 : 1;
    g.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 8));
  });
  const top = part.y + part.h + 0.004;
  const tone = part.scanned ? (onBom(kit, part) ? 'good' : 'bad') : 'plain';
  const label = barcodeTexture(part.mat, tone);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    if (scanning) {
      const r = scanPart(kit.id, part.id);
      if (r.ok) {
        flash.current = 1;
        sfx(r.onBom ? 'scan' : 'scanBad');
        if (!r.onBom) feedback(`${r.mat} is not on the BOM. Quarantine it!`, true);
        bump();
      } else if (r.hint) feedback(r.hint, false);
      return;
    }
    if (touchPart(kit.id, part.id)) {
      shake.current = 0.35;
      feedback('Careful! That’s a machine part, not trash.', true);
      bump();
    }
  };
  return (
    <group
      ref={g}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = scanning ? 'crosshair' : 'not-allowed'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      <PartMesh part={part} model={kit.model} />
      {/* barcode sticker on top */}
      <mesh position={[part.x, top, part.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.min(0.42, part.w * 0.9), Math.min(0.21, part.w * 0.45)]} />
        <meshBasicMaterial map={label} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh position={[part.x, part.y + part.h / 2, part.z]} material={flashMat}>
        <boxGeometry args={[part.w + 0.04, part.h + 0.04, part.d + 0.04]} />
      </mesh>
    </group>
  );
}

/** Keep the whole kit in frame for any viewport shape (portrait phones need more distance). */
const FIT_T = Math.tan(THREE.MathUtils.degToRad(18));
function FitCamera() {
  useFitCamera([3.1, 2.8, 3.8], [0.3, 0.1, 0], (aspect) => Math.max(1.75 / FIT_T, 2.2 / (FIT_T * aspect)));
  return null;
}

function KitView({ kit, feedback }: { kit: Kit; feedback: Feedback }) {
  useSim();
  const cur = currentLayer(kit);
  const anyQ = kit.parts.some((p) => p.quarantined);
  return (
    <group position={[0, -0.75, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[3.4, 48]} />
        <meshStandardMaterial color="#dbe4f0" />
      </mesh>
      <Pallet />
      {(kit.state === 'scan' || anyQ) && (
        <group position={[QUAR.x, 0, QUAR.z]}>
          <mesh position={[0, 0.1, 0]} material={mat('#ef4444')} castShadow receiveShadow><boxGeometry args={[1.25, 0.2, 1.0]} /></mesh>
          <mesh position={[0, 0.205, 0]} material={mat('#7f1d1d')}><boxGeometry args={[1.1, 0.01, 0.85]} /></mesh>
        </group>
      )}
      {kit.parts.map((p) => <ClickPart key={p.id} part={p} kit={kit} feedback={feedback} />)}
      {kit.pieces.map((p) => <TrashPiece key={p.id} piece={p} kit={kit} active={!!cur && p.kind === cur} feedback={feedback} />)}
    </group>
  );
}

/* ---------------------------------- ERP ------------------------------------ */
function ErpPanel({ kit, compact }: { kit: Kit; compact: boolean }) {
  useSim();
  const scanning = kit.state === 'scan';
  const done = kit.state !== 'waiting' && kit.state !== 'scan';
  const g = grSummary(kit);
  const quarantined = kit.parts.filter((p) => p.quarantined);
  if (compact && !scanning && !done) {
    return <div className="erp compact muted"><ScanBarcode size={13} /> ERP: {kit.bom.length} BOM lines · unpack the kit to scan</div>;
  }
  const post = () => {
    postGR(kit.id);
    bump();
  };
  return (
    <div className={`erp ${compact ? 'compact' : ''}`}>
      <div className="erp-h">
        <span className="erp-logo">ERP</span>
        <div className="grow">
          <b>Goods receipt · MIGO</b>
          <div className="sub mono">PO {kit.po} · Kitwell Supply</div>
        </div>
        {kit.grDoc && <Chip s={{ label: `GR ${kit.grDoc}`, tone: 'good' }} />}
      </div>
      <table className="erp-t">
        <thead>
          <tr><th>Material</th>{!compact && <th>Description</th>}<th>Exp</th><th>Scan</th></tr>
        </thead>
        <tbody>
          {g.lines.map((l) => (
            <tr key={l.mat} className={l.got >= l.qty ? 'ok' : ''}>
              <td className="mono">{l.mat}</td>
              {!compact && <td>{l.desc}</td>}
              <td className="mono">{l.qty}</td>
              <td className="mono">{l.got >= l.qty ? <CircleCheck size={13} /> : `${l.got}`}</td>
            </tr>
          ))}
          {g.offBom.map((p) => (
            <tr key={`x${p.id}`} className="bad">
              <td className="mono">{p.mat}</td>
              {!compact && <td>Not on BOM</td>}
              <td colSpan={2}>
                <button className="btn sm danger" onClick={() => { quarantinePart(kit.id, p.id); sfx('buy'); bump(); }}>Quarantine</button>
              </td>
            </tr>
          ))}
          {quarantined.map((p) => (
            <tr key={`q${p.id}`} className="q">
              <td className="mono">{p.mat}</td>
              {!compact && <td>Quarantined · NCR</td>}
              <td colSpan={2} className="mono">QI</td>
            </tr>
          ))}
        </tbody>
      </table>
      {scanning && (
        <div className="erp-f">
          <div className="sub">
            {g.offBom.length ? `${g.offBom.length} exception to resolve` : g.unscanned ? `${g.unscanned} part${g.unscanned > 1 ? 's' : ''} not scanned yet` : g.missing ? `${g.missing} short. Supplier will expedite` : 'All lines matched'}
          </div>
          <button
            className={`btn ${g.ready ? 'go' : g.offBom.length || g.unscanned ? '' : 'pri'}`}
            onClick={post}
            title={g.unscanned ? `Posting now books unscanned parts as short (−${money(TUNE.falseShortCost)} each)` : undefined}
          >
            {g.ready ? 'Post GR' : g.offBom.length ? 'Post anyway' : g.missing && !g.unscanned ? 'Post with shortage' : 'Post GR early'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Latest floor update, shown below the 3D view instead of floating over it. */
export function FloorFeed() {
  const last = useUi((s) => s.toasts[s.toasts.length - 1]);
  const Icon = !last ? Info : last.tone === 'good' ? CircleCheck : last.tone === 'bad' ? CircleX : last.tone === 'warn' ? TriangleAlert : Info;
  return (
    <div className={`dt-feed ${last?.tone ?? 'idle'}`} aria-live="polite">
      <Icon size={13} />
      <span>{last ? last.text : 'Floor updates appear here while you work'}</span>
    </div>
  );
}

/* --------------------------------- modal ----------------------------------- */
export function DetrashModal() {
  useSim();
  const kitId = useUi((s) => s.detrashKit);
  const kit = useMemo(() => kitById(kitId), [kitId]);
  const compact = useIsMobile();
  const [msg, setMsg] = useState<{ text: string; bad: boolean; n: number } | null>(null);
  const timer = useRef<number>(0);
  const feedback: Feedback = (text, bad) => {
    setMsg((m) => ({ text, bad, n: (m?.n ?? 0) + 1 }));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 1800);
  };
  useEffect(() => {
    setMsg(null);
  }, [kitId]);
  const done = !!kit && kit.state !== 'waiting' && kit.state !== 'scan';
  useEffect(() => {
    if (!kitId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeKit();
      if (e.key.toLowerCase() === 'n' && done) openNextKit();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [kitId, done]);

  if (!kitId || !kit) return null;
  const sh = shipmentById(kit.shipmentId);
  const scanning = kit.state === 'scan';
  const cur = currentLayer(kit);
  const others = waitingKits().filter((k) => k.id !== kit.id).length;
  const { count, cap, emptyT } = S.skip;
  const full = count >= cap || emptyT > 0;
  const hint = msg?.text ?? (done ? '' : scanning ? 'Click each part to scan its barcode into ERP. Quarantine anything not on the BOM.' : full ? 'Compactor is full. Empty it to keep going.' : cur ? LAYER_HINT[cur] : '');

  return (
    <div className="dt-wrap" onPointerDown={(e) => e.target === e.currentTarget && closeKit()}>
      <div className="dt wide" role="dialog" aria-label="Kit prep station">
        <div className="dt-h">
          <div className="swatch" style={{ background: MODELS[kit.model].color }}>{MODELS[kit.model].short.split('-')[0]}</div>
          <div className="grow">
            <b>Kit prep · {kit.id} <span className="ops-tag mono" title="Ops sequence">Op {kit.ops}</span></b>
            <div className="sub">{MODELS[kit.model].name} kit · {sh?.id} · {sh && dueText(sh.due)}{sh?.rush ? ' · RUSH' : ''}</div>
          </div>
          {kit.damage > 0 && <Chip s={{ label: `${kit.damage} part${kit.damage > 1 ? 's' : ''} damaged`, tone: 'bad' }} />}
          <button className="btn icon" aria-label="Close" onClick={closeKit}><X size={16} /></button>
        </div>
        <div className="layers">
          {LAYERS.map((l) => {
            const total = kit.pieces.filter((p) => p.kind === l).length;
            const left = kit.pieces.filter((p) => p.kind === l && !p.removed).length;
            const cls = left === 0 ? 'done' : l === cur ? 'cur' : '';
            return (
              <span key={l} className={`layer ${cls}`}>
                {left === 0 ? <CircleCheck size={13} /> : null}
                {LAYER_LABEL[l]} <span className="mono">{total - left}/{total}</span>
              </span>
            );
          })}
          <span className={`layer ${done ? 'done' : scanning ? 'cur' : ''}`}>
            {done ? <CircleCheck size={13} /> : <ScanBarcode size={13} />}ERP scan
          </span>
        </div>
        <div key={msg?.n ?? 0} className={`dt-hint ${msg?.bad ? 'shake' : ''}`}>
          {msg?.bad && <ShieldAlert size={15} />}{hint}
        </div>
        <div className="dt-body">
          <div className="dt-view">
            <Canvas shadows flat dpr={CANVAS_DPR} camera={{ position: [3.1, 2.8, 3.8], fov: 36 }}>
              <color attach="background" args={['#eef3fa']} />
              <hemisphereLight args={['#ffffff', '#b9c6d8', 1.1]} />
              <directionalLight position={[4, 8, 5]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
              <KitView kit={kit} feedback={feedback} />
              <OrbitControls makeDefault enablePan={false} target={[0.3, 0.1, 0]} minDistance={3} maxDistance={13} maxPolarAngle={1.38} rotateSpeed={0.7} />
              <FitCamera />
            </Canvas>
            {done && (
              <div className="clean-badge">
                <CircleCheck size={15} /> GR {kit.grDoc} posted · queued for the next free workcentre
              </div>
            )}
            <div className="corner">{IS_TOUCH ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom'}</div>
          </div>
          <ErpPanel kit={kit} compact={compact} />
        </div>
        <FloorFeed />
        <div className="dt-f">
          <div className="skip">
            <Recycle size={15} />
            <span className="mono">Compactor {count}/{cap}</span>
            <Bar v={emptyT > 0 ? emptyT / TUNE.skipEmptySec : count / cap} tone={count / cap > 0.85 ? 'bad' : count / cap > 0.6 ? 'warn' : 'good'} />
            <button className={`btn sm ${full && emptyT <= 0 ? 'danger' : ''}`} disabled={emptyT > 0 || count === 0} onClick={() => emptySkip()}>
              {emptyT > 0 ? 'Emptying…' : 'Empty'}
            </button>
          </div>
          {done ? (
            others > 0
              ? <button className="btn pri" onClick={() => openNextKit()}>Next kit ({others}) <ArrowRight size={14} /></button>
              : <button className="btn pri" onClick={closeKit}>Done</button>
          ) : (
            others > 0 && <button className="btn" onClick={() => openNextKit()}>Switch kit <ArrowRight size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
