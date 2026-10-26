/** Low-poly models shared by the yard scene and the detrash close-up. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MODELS } from '../game/content';
import type { ModelId } from '../game/content';
import { KIT_CRATE } from '../game/sim';
import type { Kit, Part, Piece } from '../game/sim';
import { C, labelTexture, mat, wrapTexture } from './materials';

type V3 = [number, number, number];

export function Box({ p, s, c, m, cast = true, recv = true, ...rest }: { p: V3; s: V3; c?: string; m?: THREE.Material; cast?: boolean; recv?: boolean; rotation?: V3 }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow={recv} material={m ?? mat(c ?? '#ccc')} {...rest}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/* --------------------------------- pallet ---------------------------------- */
export function Pallet({ w = KIT_CRATE.w, d = KIT_CRATE.d }: { w?: number; d?: number }) {
  const boards = 5;
  return (
    <group>
      {Array.from({ length: boards }, (_, i) => (
        <Box key={i} p={[0, 0.215, -d / 2 + (d / boards) * (i + 0.5)]} s={[w, 0.05, d / boards - 0.05]} c={C.wood} />
      ))}
      {[-1, 0, 1].map((k) => (
        <Box key={k} p={[0, 0.11, k * (d / 2 - 0.1)]} s={[w, 0.16, 0.18]} c={C.woodDark} />
      ))}
      {[-1, 0, 1].map((k) => (
        <Box key={`b${k}`} p={[0, 0.02, k * (d / 2 - 0.12)]} s={[w, 0.04, 0.24]} c={C.wood} />
      ))}
    </group>
  );
}

/* ---------------------------------- kit ------------------------------------ */
const partColor = (model: ModelId, tone: Part['tone']) => (tone === 'm' ? MODELS[model].color : tone === 'g' ? C.steel : C.dark);

export function PartMesh({ part, model, material }: { part: Part; model: ModelId; material?: THREE.Material }) {
  const m = material ?? (part.damaged ? mat('#ef4444', { emissive: '#7f1d1d', ei: 0.6 }) : mat(partColor(model, part.tone), { rough: 0.5, metal: part.tone === 'g' ? 0.35 : 0.05 }));
  if (part.shape === 'box') {
    return (
      <mesh position={[part.x, part.y + part.h / 2, part.z]} material={m} castShadow receiveShadow>
        <boxGeometry args={[part.w, part.h, part.d]} />
      </mesh>
    );
  }
  if (part.axis === 'y') {
    return (
      <mesh position={[part.x, part.y + part.h / 2, part.z]} material={m} castShadow receiveShadow>
        <cylinderGeometry args={[part.w / 2, part.w / 2, part.h, 24]} />
      </mesh>
    );
  }
  return (
    <mesh position={[part.x, part.y + part.h / 2, part.z]} rotation={part.axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[part.w / 2, part.w / 2, part.d, 24]} />
    </mesh>
  );
}

/** Pure geometry of one trash piece (materials supplied by caller). */
export function PieceGeom({ piece, mats }: { piece: Piece; mats: PieceMats }) {
  const { w: W, d: D, base: B, h: H } = KIT_CRATE;
  const top = B + H;
  switch (piece.kind) {
    case 'strap': {
      const [axis, off] = piece.p;
      if (axis === 0)
        return (
          <group position={[0, 0, off]}>
            <mesh position={[0, top + 0.085, 0]} material={mats.strap} castShadow><boxGeometry args={[W + 0.14, 0.025, 0.08]} /></mesh>
            <mesh position={[W / 2 + 0.07, B + H / 2 + 0.04, 0]} material={mats.strap}><boxGeometry args={[0.025, H + 0.1, 0.08]} /></mesh>
            <mesh position={[-W / 2 - 0.07, B + H / 2 + 0.04, 0]} material={mats.strap}><boxGeometry args={[0.025, H + 0.1, 0.08]} /></mesh>
            <mesh position={[0.3, top + 0.1, 0]} material={mats.buckle}><boxGeometry args={[0.12, 0.03, 0.1]} /></mesh>
          </group>
        );
      return (
        <group position={[off, 0, 0]}>
          <mesh position={[0, top + 0.1, 0]} material={mats.strap} castShadow><boxGeometry args={[0.08, 0.025, D + 0.14]} /></mesh>
          <mesh position={[0, B + H / 2 + 0.04, D / 2 + 0.07]} material={mats.strap}><boxGeometry args={[0.08, H + 0.1, 0.025]} /></mesh>
          <mesh position={[0, B + H / 2 + 0.04, -D / 2 - 0.07]} material={mats.strap}><boxGeometry args={[0.08, H + 0.1, 0.025]} /></mesh>
          <mesh position={[0, top + 0.12, -0.25]} material={mats.buckle}><boxGeometry args={[0.1, 0.03, 0.12]} /></mesh>
        </group>
      );
    }
    case 'wrap': {
      const [i, n] = piece.p;
      const h = H / n, y = B + h * i + h / 2, o = 0.045;
      return (
        <group>
          <mesh position={[0, y, D / 2 + o]} material={mats.wrap}><boxGeometry args={[W + o * 2, h - 0.015, 0.01]} /></mesh>
          <mesh position={[0, y, -D / 2 - o]} material={mats.wrap}><boxGeometry args={[W + o * 2, h - 0.015, 0.01]} /></mesh>
          <mesh position={[W / 2 + o, y, 0]} material={mats.wrap}><boxGeometry args={[0.01, h - 0.015, D + o * 2]} /></mesh>
          <mesh position={[-W / 2 - o, y, 0]} material={mats.wrap}><boxGeometry args={[0.01, h - 0.015, D + o * 2]} /></mesh>
        </group>
      );
    }
    case 'card':
      if (piece.p[0] === 0)
        return (
          <group>
            <mesh position={[0, top + 0.035, 0]} material={mats.card} castShadow receiveShadow><boxGeometry args={[W + 0.06, 0.07, D + 0.06]} /></mesh>
            <mesh position={[0, top + 0.036, 0]} material={mats.tape}><boxGeometry args={[W + 0.07, 0.072, 0.14]} /></mesh>
          </group>
        );
      return (
        <group>
          <mesh position={[0, B + H / 2, D / 2 + 0.02]} material={mats.sleeve} castShadow receiveShadow><boxGeometry args={[W + 0.04, H, 0.035]} /></mesh>
          <mesh position={[0, B + H / 2, -D / 2 - 0.02]} material={mats.sleeve} castShadow receiveShadow><boxGeometry args={[W + 0.04, H, 0.035]} /></mesh>
          <mesh position={[W / 2 + 0.02, B + H / 2, 0]} material={mats.sleeve} castShadow receiveShadow><boxGeometry args={[0.035, H, D]} /></mesh>
          <mesh position={[-W / 2 - 0.02, B + H / 2, 0]} material={mats.sleeve} castShadow receiveShadow><boxGeometry args={[0.035, H, D]} /></mesh>
        </group>
      );
    case 'foam': {
      const [x, y, z, rot, s] = piece.p;
      return (
        <mesh position={[x, y + 0.07 * s, z]} rotation={[0, rot, 0]} material={mats.foam} castShadow>
          <boxGeometry args={[0.36 * s, 0.14 * s, 0.27 * s]} />
        </mesh>
      );
    }
  }
}

export interface PieceMats { strap: THREE.Material; buckle: THREE.Material; wrap: THREE.Material; card: THREE.Material; tape: THREE.Material; sleeve: THREE.Material; foam: THREE.Material }

let sharedWrap: THREE.MeshStandardMaterial | null = null;
export function baseWrapMat() {
  if (!sharedWrap) {
    sharedWrap = new THREE.MeshStandardMaterial({ color: '#ffffff', map: wrapTexture(), transparent: true, opacity: 0.6, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide });
  }
  return sharedWrap;
}
export const sharedPieceMats = (): PieceMats => ({
  strap: mat(C.yellow, { rough: 0.45 }),
  buckle: mat(C.dark),
  wrap: baseWrapMat(),
  card: mat(C.card),
  tape: mat(C.tape),
  sleeve: mat(C.sleeve),
  foam: mat(C.foam, { rough: 0.35, emissive: '#e2e8f0', ei: 0.15 }),
});

/** Static (non-interactive) kit for the yard. */
export function KitStatic({ kit }: { kit: Kit }) {
  const mats = useMemo(sharedPieceMats, []);
  return (
    <group>
      <Pallet />
      {kit.parts.map((p) => <PartMesh key={p.id} part={p} model={kit.model} />)}
      {kit.pieces.filter((p) => !p.removed).map((p) => <PieceGeom key={p.id} piece={p} mats={mats} />)}
    </group>
  );
}

/* -------------------------------- forklift --------------------------------- */
export function ForkliftModel({ forkRef, moving, accent = C.fork }: { forkRef?: React.Ref<THREE.Group>; moving?: () => boolean; accent?: string }) {
  const beacon = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (beacon.current) (beacon.current.material as THREE.MeshStandardMaterial).emissiveIntensity = moving?.() ? (Math.sin(clock.elapsedTime * 10) > 0 ? 2 : 0.2) : 0.2;
  });
  const beaconMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#f97316', emissiveIntensity: 0.2 }), []);
  return (
    <group>
      <Box p={[0, 0.55, -0.2]} s={[1.1, 0.62, 1.6]} c={accent} />
      <Box p={[0, 0.52, -1.08]} s={[1.12, 0.58, 0.36]} c="#b45309" />
      <Box p={[0, 0.98, -0.45]} s={[0.55, 0.3, 0.5]} c={C.dark} />
      {[[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.75], [0.5, -0.75]].map(([x, z], i) => (
        <Box key={i} p={[x, 1.45, z]} s={[0.06, 1.0, 0.06]} c="#111827" />
      ))}
      <Box p={[0, 1.97, -0.22]} s={[1.08, 0.06, 1.2]} c="#111827" />
      <mesh ref={beacon} position={[0, 2.06, -0.6]} material={beaconMat}><sphereGeometry args={[0.09, 12, 8]} /></mesh>
      <Box p={[0.36, 1.15, 0.68]} s={[0.09, 2.1, 0.1]} c="#475569" />
      <Box p={[-0.36, 1.15, 0.68]} s={[0.09, 2.1, 0.1]} c="#475569" />
      <Box p={[0, 2.15, 0.68]} s={[0.82, 0.08, 0.1]} c="#475569" />
      <group ref={forkRef} position={[0, 0.08, 0]}>
        <Box p={[0, 0.4, 0.78]} s={[0.92, 0.55, 0.06]} c="#64748b" />
        <Box p={[0.26, 0.03, 1.32]} s={[0.12, 0.05, 1.1]} c="#9ca3af" />
        <Box p={[-0.26, 0.03, 1.32]} s={[0.12, 0.05, 1.1]} c="#9ca3af" />
      </group>
      {[[0.56, 0.42], [-0.56, 0.42], [0.56, -0.78], [-0.56, -0.78]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.26, z]} rotation={[0, 0, Math.PI / 2]} material={mat(C.tire)} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.2, 16]} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------- trucks ---------------------------------- */
export const CARRIER_COLOR: Record<string, string> = {
  Bluepeak: '#2563eb', WareTrack: '#0ea5e9', Northline: '#16a34a', 'Swift Haul': '#f97316', Ironroad: '#475569',
};

/** Local frame: trailer rear at z=0, cab toward +z. */
export function TruckModel({ carrier, open }: { carrier: string; open?: boolean }) {
  const col = CARRIER_COLOR[carrier] ?? '#2563eb';
  const logo = useMemo(() => labelTexture(carrier, { fg: col, w: 512, h: 128, size: 72, weight: 900 }), [carrier, col]);
  return (
    <group>
      <Box p={[0, 2.5, 4.2]} s={[2.5, 3.0, 8]} c="#f8fafc" />
      <Box p={[1.255, 1.35, 4.2]} s={[0.02, 0.22, 8]} c={col} cast={false} />
      <Box p={[-1.255, 1.35, 4.2]} s={[0.02, 0.22, 8]} c={col} cast={false} />
      <mesh position={[1.262, 2.7, 4.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[4.8, 1.2]} />
        <meshBasicMaterial map={logo} transparent />
      </mesh>
      <mesh position={[-1.262, 2.7, 3.8]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[4.8, 1.2]} />
        <meshBasicMaterial map={logo} transparent />
      </mesh>
      {/* rear doors */}
      <Box p={[0, 2.5, 0.19]} s={[2.42, 2.9, 0.04]} c={open ? '#0f172a' : '#e2e8f0'} cast={false} />
      <Box p={[0, 0.85, 4.2]} s={[1.6, 0.3, 7.8]} c={C.dark} />
      {[1.3, 2.5].map((z) => [-1, 1].map((sx) => (
        <mesh key={`${z}${sx}`} position={[sx * 1.0, 0.5, z]} rotation={[0, 0, Math.PI / 2]} material={mat(C.tire)} castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.45, 18]} />
        </mesh>
      )))}
      {/* cab */}
      <Box p={[0, 1.95, 9.55]} s={[2.4, 2.5, 2.0]} c={col} />
      <Box p={[0, 2.55, 10.56]} s={[2.1, 0.95, 0.04]} c="#1e293b" cast={false} />
      <Box p={[0, 3.3, 9.3]} s={[2.2, 0.35, 1.3]} c={col} />
      <Box p={[0, 0.95, 10.6]} s={[2.3, 0.4, 0.12]} c="#cbd5e1" />
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 1.05, 0.5, 9.9]} rotation={[0, 0, Math.PI / 2]} material={mat(C.tire)} castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.4, 18]} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------- machines --------------------------------- */
/** p: build progress 0..1; parts pop in by threshold. */
export function MachineModel({ model, p }: { model: ModelId; p: number }) {
  const col = MODELS[model].color;
  const show = (t: number) => Math.max(0, Math.min(1, (p - t) / 0.06));
  const S = (t: number, children: React.ReactNode) => {
    const k = show(t);
    return k > 0 ? <group key={t} scale={[1, k, 1]}>{children}</group> : null;
  };
  const steel = C.steel;
  switch (model) {
    case 'CX40':
      return (
        <group>
          {S(0.02, <><Box p={[0, 0.08, 0]} s={[3.4, 0.16, 1.2]} c={C.dark} /></>)}
          {S(0.12, <>{[-1.4, 1.4].map((x) => [-0.4, 0.4].map((z) => <Box key={`${x}${z}`} p={[x, 0.55, z]} s={[0.1, 0.8, 0.1]} c={steel} />))}</>)}
          {S(0.3, <><Box p={[0, 0.98, 0]} s={[3.3, 0.16, 1.0]} c={steel} /></>)}
          {S(0.48, <>{Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[-1.45 + i * 0.36, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat('#cbd5e1', { metal: 0.5, rough: 0.3 })}>
              <cylinderGeometry args={[0.07, 0.07, 0.95, 10]} />
            </mesh>
          ))}</>)}
          {S(0.66, <><Box p={[0, 1.18, 0]} s={[3.2, 0.03, 0.85]} c={col} /></>)}
          {S(0.8, <><Box p={[1.35, 0.6, 0.75]} s={[0.5, 0.5, 0.4]} c={col} /></>)}
          {S(0.92, <><Box p={[-1.45, 1.0, -0.72]} s={[0.35, 0.7, 0.12]} c={C.dark} /></>)}
        </group>
      );
    case 'FM200':
      return (
        <group>
          {S(0.02, <><Box p={[0, 0.08, 0]} s={[2.4, 0.16, 1.6]} c={C.dark} /></>)}
          {S(0.15, <><Box p={[0, 0.6, 0]} s={[2.2, 0.9, 1.4]} c={steel} /></>)}
          {S(0.38, <>
            <mesh position={[-0.45, 1.6, 0]} material={mat(col, { rough: 0.35, metal: 0.2 })} castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1.1, 24]} />
            </mesh>
          </>)}
          {S(0.56, <>
            <mesh position={[-0.45, 2.3, 0]} material={mat(steel, { metal: 0.4 })} castShadow>
              <coneGeometry args={[0.5, 0.35, 24]} />
            </mesh>
          </>)}
          {S(0.72, <><Box p={[0.6, 1.25, 0.3]} s={[0.9, 0.18, 0.5]} c={C.dark} /></>)}
          {S(0.84, <>{[0.3, 0.6, 0.9].map((x) => <Box key={x} p={[x, 1.05, 0.3]} s={[0.06, 0.25, 0.06]} c="#cbd5e1" />)}</>)}
          {S(0.93, <><Box p={[0.8, 1.55, -0.55]} s={[0.55, 0.45, 0.08]} c={col} /></>)}
        </group>
      );
    case 'PK9':
      return (
        <group>
          {S(0.02, <><Box p={[0, 0.08, 0]} s={[2.6, 0.16, 1.8]} c={C.dark} /></>)}
          {S(0.18, <><Box p={[-0.3, 1.0, 0]} s={[1.8, 1.7, 1.6]} c={col} /></>)}
          {S(0.45, <><Box p={[-0.3, 1.15, 0.81]} s={[1.3, 0.8, 0.02]} c={C.glass} /></>)}
          {S(0.62, <><Box p={[1.0, 0.7, 0]} s={[1.0, 0.12, 0.7]} c={steel} /></>)}
          {S(0.74, <>{[0.7, 1.3].map((x) => <Box key={x} p={[x, 0.38, 0]} s={[0.08, 0.6, 0.08]} c={steel} />)}</>)}
          {S(0.88, <><Box p={[-0.3, 2.0, -0.4]} s={[0.6, 0.3, 0.5]} c={steel} /></>)}
          {S(0.95, <>
            <mesh position={[-0.9, 2.05, 0.5]} material={mat('#22c55e', { emissive: '#22c55e', ei: 0.8 })}>
              <cylinderGeometry args={[0.08, 0.08, 0.35, 12]} />
            </mesh>
          </>)}
        </group>
      );
    case 'RB5':
      return (
        <group>
          {S(0.02, <><Box p={[0, 0.06, 0]} s={[2.6, 0.12, 2.2]} c={C.dark} /></>)}
          {S(0.18, <>{[[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]].map(([x, z], i) => <Box key={i} p={[x, 0.75, z]} s={[0.08, 1.4, 0.08]} c={C.safety} />)}</>)}
          {S(0.32, <><Box p={[0, 1.4, -1]} s={[2.4, 0.06, 0.04]} c={C.safety} /></>)}
          {S(0.44, <>
            <mesh position={[-0.2, 0.35, 0]} material={mat(steel, { metal: 0.3 })} castShadow><cylinderGeometry args={[0.45, 0.5, 0.45, 24]} /></mesh>
          </>)}
          {S(0.58, <><Box p={[-0.2, 1.05, 0]} s={[0.3, 1.0, 0.3]} c={col} /></>)}
          {S(0.72, <><Box p={[0.3, 1.55, 0]} s={[1.1, 0.25, 0.25]} c={col} /></>)}
          {S(0.86, <><Box p={[0.85, 1.35, 0]} s={[0.18, 0.35, 0.3]} c={C.dark} /></>)}
          {S(0.94, <><Box p={[0.8, 0.5, -0.75]} s={[0.6, 0.8, 0.4]} c={steel} /></>)}
        </group>
      );
  }
}

/* --------------------------------- scenery --------------------------------- */
export function Tree({ s = 1, tone = 0 }: { s?: number; tone?: number }) {
  const leaf = ['#4ade80', '#22c55e', '#86efac'][tone % 3];
  return (
    <group scale={s}>
      <mesh position={[0, 0.7, 0]} material={mat('#a16207')} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 1.4, 8]} />
      </mesh>
      <mesh position={[0, 2.0, 0]} material={mat(leaf, { rough: 0.9 })} castShadow>
        <icosahedronGeometry args={[1.05, 1]} />
      </mesh>
      <mesh position={[0.45, 1.55, 0.3]} material={mat(leaf, { rough: 0.9 })} castShadow>
        <icosahedronGeometry args={[0.6, 1]} />
      </mesh>
    </group>
  );
}
