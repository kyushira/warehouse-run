/** Static scenery: ground, roads, warehouse shell, floor markings, decor. */
import type React from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  AISLE_Z, FORK_HOME, IN_DOORS, OUT_DOCKS, RECV_SLOTS, ROAD_BACK_Z, ROAD_RIGHT_X, STAGE_SLOTS,
} from '../game/layout';
import { Box, Tree, TruckModel } from './models';
import { C, claddingTexture, labelTexture, mat } from './materials';

const H = 5; // wall height

function FloorLabel({ text, p, w, h = w / 4, rot = 0, fg = '#64748b', size = 64 }: { text: string; p: [number, number]; w: number; h?: number; rot?: number; fg?: string; size?: number }) {
  const tex = useMemo(() => labelTexture(text, { fg, size, w: 1024, h: Math.round((1024 * h) / w) }), [text, fg, size, w, h]);
  return (
    <mesh position={[p[0], 0.025, p[1]]} rotation={[-Math.PI / 2, 0, rot]} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function Zone({ x0, x1, z0, z1, color, opacity = 0.12, border }: { x0: number; x1: number; z0: number; z1: number; color: string; opacity?: number; border?: string }) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, t = 0.09;
  const bm = mat(border ?? color);
  return (
    <group>
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      {border && (
        <>
          <mesh position={[cx, 0.016, z0]} material={bm}><boxGeometry args={[w, 0.01, t]} /></mesh>
          <mesh position={[cx, 0.016, z1]} material={bm}><boxGeometry args={[w, 0.01, t]} /></mesh>
          <mesh position={[x0, 0.016, cz]} material={bm}><boxGeometry args={[t, 0.01, d]} /></mesh>
          <mesh position={[x1, 0.016, cz]} material={bm}><boxGeometry args={[t, 0.01, d]} /></mesh>
        </>
      )}
    </group>
  );
}

function Road({ horizontal, at, from, to }: { horizontal: boolean; at: number; from: number; to: number }) {
  const len = to - from, mid = (from + to) / 2;
  const dash = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 8;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 32, 8);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(len / 4, 1);
    return t;
  }, [len]);
  return (
    <group position={horizontal ? [mid, 0, at] : [at, 0, mid]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[len, 7.4]} />
        <meshStandardMaterial color={C.asphalt} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.18]} />
        <meshBasicMaterial map={dash} transparent />
      </mesh>
      {[-3.5, 3.5].map((o) => (
        <mesh key={o} position={[0, 0.011, o]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[len, 0.12]} />
          <meshBasicMaterial color="#f1f5f9" />
        </mesh>
      ))}
    </group>
  );
}

function Walls() {
  const clad = useMemo(() => {
    const t = claddingTexture(C.wall, C.wallDark).clone();
    t.needsUpdate = true;
    t.repeat.set(24, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }, []);
  const cladSide = useMemo(() => {
    const t = claddingTexture(C.wall, C.wallDark).clone();
    t.needsUpdate = true;
    t.repeat.set(16, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }, []);
  const sign = useMemo(() => labelTexture('KITFLOW · RIVERSIDE HUB', { fg: '#ffffff', bg: '#1d4ed8', w: 1024, h: 128, size: 70, weight: 900 }), []);
  // back wall segments around inbound door openings (4 wide)
  const gaps = IN_DOORS.map((d) => [d.x - 2, d.x + 2]);
  const segs: [number, number][] = [];
  let x = -20;
  for (const [a, b] of gaps) {
    segs.push([x, a]);
    x = b;
  }
  segs.push([x, 20]);
  return (
    <group>
      {segs.map(([a, b]) => (
        <mesh key={a} position={[(a + b) / 2, H / 2, -12.15]} material={clad} castShadow receiveShadow>
          <boxGeometry args={[b - a, H, 0.3]} />
        </mesh>
      ))}
      {gaps.map(([a, b]) => (
        <group key={a}>
          <mesh position={[(a + b) / 2, H - 0.5, -12.15]} material={clad} castShadow><boxGeometry args={[b - a, 1, 0.3]} /></mesh>
          <Box p={[(a + b) / 2, H - 1.05, -11.95]} s={[b - a + 0.3, 0.12, 0.18]} c={C.safety} />
          <Box p={[a - 0.08, (H - 1) / 2, -11.95]} s={[0.16, H - 1, 0.18]} c={C.safety} />
          <Box p={[b + 0.08, (H - 1) / 2, -11.95]} s={[0.16, H - 1, 0.18]} c={C.safety} />
        </group>
      ))}
      <mesh position={[-20.15, H / 2, 0]} material={cladSide} castShadow receiveShadow><boxGeometry args={[0.3, H, 24.6]} /></mesh>
      <Box p={[0, H + 0.12, -12.15]} s={[40.6, 0.24, 0.5]} c={C.trim} />
      <Box p={[-20.15, H + 0.12, 0]} s={[0.5, 0.24, 24.6]} c={C.trim} />
      {/* low front + right walls (cutaway) */}
      <Box p={[0, 0.45, 12.15]} s={[40.6, 0.9, 0.3]} c={C.wallLight} />
      {(() => {
        const out: React.JSX.Element[] = [];
        let z = -12;
        for (const d of OUT_DOCKS) {
          out.push(<Box key={z} p={[20.15, 0.45, (z + d.z - 1.7) / 2]} s={[0.3, 0.9, d.z - 1.7 - z]} c={C.wallLight} />);
          z = d.z + 1.7;
        }
        out.push(<Box key="last" p={[20.15, 0.45, (z + 12) / 2]} s={[0.3, 0.9, 12 - z]} c={C.wallLight} />);
        return out;
      })()}
      {OUT_DOCKS.map((d, i) => (
        <group key={i} position={[20.15, 0, d.z]}>
          <Box p={[0, 2.2, -1.65]} s={[0.4, 4.4, 0.3]} c={C.wallDark} />
          <Box p={[0, 2.2, 1.65]} s={[0.4, 4.4, 0.3]} c={C.wallDark} />
          <Box p={[0, 4.3, 0]} s={[0.5, 0.4, 3.6]} c={C.trim} />
          <Box p={[0.35, 4.0, 0]} s={[0.3, 0.25, 3.2]} c="#111827" />
          <Box p={[0.6, 0.6, 0]} s={[1.0, 0.12, 2.8]} c="#64748b" />
          <mesh position={[-0.6, 3.2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[1.4, 0.7]} />
            <meshBasicMaterial map={labelTexture(`BAY ${i + 1}`, { fg: '#fff', bg: '#16a34a', w: 256, h: 128, size: 64 })} transparent />
          </mesh>
        </group>
      ))}
      {[[-20.15, -12.15], [20.15, -12.15], [-20.15, 12.15], [20.15, 12.15]].map(([cx, cz], i) => (
        <Box key={i} p={[cx, (i < 2 ? H + 0.3 : 1.4) / 2, cz]} s={[0.6, i < 2 ? H + 0.3 : 1.4, 0.6]} c={C.trim} />
      ))}
      <mesh position={[4, 3.4, -11.98]}>
        <planeGeometry args={[12, 1.5]} />
        <meshBasicMaterial map={sign} transparent />
      </mesh>
    </group>
  );
}

function Racks() {
  const rows = [5.4, 9.6];
  const out: React.JSX.Element[] = [];
  for (const z of rows) {
    for (let i = 0; i < 4; i++) {
      const x = 4.2 + i * 2.6;
      out.push(<Box key={`u${z}${i}`} p={[x - 1.2, 1.5, z]} s={[0.1, 3, 1.1]} c="#1d4ed8" />);
      for (const y of [0.15, 1.35, 2.55]) {
        out.push(<Box key={`b${z}${i}${y}`} p={[x, y, z]} s={[2.5, 0.08, 1.1]} c="#f97316" />);
        const n = (i * 3 + y * 10 + z) % 3;
        for (let k = 0; k < 2 + (n > 1 ? 1 : 0); k++)
          out.push(<Box key={`c${z}${i}${y}${k}`} p={[x - 0.75 + k * 0.75, y + 0.33, z]} s={[0.66, 0.5, 0.8]} c={k % 2 ? C.card : C.sleeve} />);
      }
    }
    out.push(<Box key={`e${z}`} p={[4.2 + 3 * 2.6 + 1.3, 1.5, z]} s={[0.1, 3, 1.1]} c="#1d4ed8" />);
  }
  return <group>{out}</group>;
}

function Office() {
  const win = mat(C.glass, { rough: 0.1, metal: 0.2 });
  return (
    <group position={[-13.6, 0, 9.4]}>
      <Box p={[0, 1.4, 0]} s={[5, 2.8, 3.4]} c="#f8fafc" />
      <Box p={[0, 2.86, 0]} s={[5.2, 0.12, 3.6]} c={C.trim} />
      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.6, 1.71]} material={win}><boxGeometry args={[1.2, 1.0, 0.02]} /></mesh>
      ))}
      <mesh position={[0, 2.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 1]} />
        <meshBasicMaterial map={labelTexture('OPS OFFICE', { fg: '#ffffff', size: 80, w: 512, h: 128 })} transparent />
      </mesh>
    </group>
  );
}

function Outside() {
  const trees: [number, number, number, number][] = [
    [-28, -30, 1.1, 0], [-22, -31, 0.9, 1], [-6, -31, 1.2, 2], [8, -30.5, 1, 0], [20, -31, 1.15, 1],
    [42, -30, 1.1, 2], [42, -14, 0.9, 0], [42, 2, 1.2, 1], [42, 16, 1, 2], [41, 28, 1.1, 0],
    [-28, 18, 1.2, 1], [-23, 21, 0.9, 2], [-10, 21, 1.1, 0], [4, 21.5, 1, 1], [16, 21, 1.2, 2],
    [-30, -6, 1, 0], [-31, 6, 1.15, 1], [27, 18, 0.85, 2],
  ];
  return (
    <group>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={C.ground} />
      </mesh>
      <mesh position={[5, -0.005, -4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[64, 50]} />
        <meshStandardMaterial color={C.slab} />
      </mesh>
      {[[-34, -40, 20, 30], [52, 0, 18, 70], [-36, 26, 26, 20], [8, 30, 50, 12]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={C.grass} />
        </mesh>
      ))}
      <Road horizontal at={ROAD_BACK_Z} from={-140} to={140} />
      <Road horizontal={false} at={ROAD_RIGHT_X} from={-140} to={140} />
      {trees.map(([x, z, s, t], i) => (
        <group key={i} position={[x, 0, z]}><Tree s={s} tone={t} /></group>
      ))}
      {/* neighbouring buildings */}
      {[[-46, -44, 14, 7, 12], [58, -40, 12, 9, 14], [-50, 30, 16, 6, 10], [60, 34, 14, 11, 12], [24, -46, 18, 6, 10]].map(([x, z, w, h, d], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, h / 2, 0]} s={[w, h, d]} c="#dbe4ef" />
          <Box p={[0, h + 0.1, 0]} s={[w + 0.3, 0.2, d + 0.3]} c="#c7d2e0" />
          {Array.from({ length: Math.floor(h / 2.4) }, (_, k) => (
            <Box key={k} p={[0, 1.6 + k * 2.4, d / 2 + 0.01]} s={[w - 1.6, 0.7, 0.02]} c="#a9c4ea" cast={false} />
          ))}
        </group>
      ))}
      {/* parked trailers in the yard */}
      {[16, 20].map((z, i) => (
        <group key={z} position={[23.5, 0, z]} rotation={[0, Math.PI / 2, 0]}>
          <TruckModel carrier={i ? 'Northline' : 'Bluepeak'} />
        </group>
      ))}
      {/* yard striping for truck aprons */}
      {OUT_DOCKS.map((d, i) => (
        <group key={i}>
          {[-1.6, 1.6].map((o) => (
            <mesh key={o} position={[26, 0.012, d.z + o]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[11, 0.12]} />
              <meshBasicMaterial color="#facc15" />
            </mesh>
          ))}
        </group>
      ))}
      {IN_DOORS.map((d, i) => (
        <group key={i}>
          {[-1.6, 1.6].map((o) => (
            <mesh key={o} position={[d.x + o, 0.012, -17.5]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.12, 10]} />
              <meshBasicMaterial color="#facc15" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Markings() {
  return (
    <group>
      <Zone x0={-19.2} x1={-5.6} z0={-9.6} z1={-2.3} color="#f59e0b" opacity={0.09} border="#fbbf24" />
      <FloorLabel text="RECEIVING · DETRASH" p={[-12.4, -1.65]} w={7} fg="#b45309" />
      {RECV_SLOTS.map((s, i) => (
        <Zone key={i} x0={s.x - 1.1} x1={s.x + 1.1} z0={s.z - 0.85} z1={s.z + 0.85} color="#ffffff" opacity={0.6} border="#fcd34d" />
      ))}
      <FloorLabel text="WORKCENTRES" p={[5.5, -1.65]} w={5.2} fg="#475569" />
      <Zone x0={15} x1={18.7} z0={-10} z1={9.6} color="#22c55e" opacity={0.06} />
      {STAGE_SLOTS.map((s, i) => (
        <group key={i}>
          <Zone x0={s.x - 1.5} x1={s.x + 1.5} z0={s.z - 1.5} z1={s.z + 1.5} color="#ffffff" opacity={0.5} border="#4ade80" />
          <FloorLabel text={`L${i + 1}`} p={[s.x - 1.15, s.z + 1.15]} w={0.9} h={0.45} fg="#16a34a" size={90} />
        </group>
      ))}
      <FloorLabel text="STAGING" p={[16.85, 1.9]} w={3.2} fg="#15803d" rot={Math.PI / 2} />
      {/* main aisle */}
      {[AISLE_Z - 1.6, AISLE_Z + 1.6].map((z) => (
        <mesh key={z} position={[-0.5, 0.014, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[38.6, 0.14]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}
      <Zone x0={FORK_HOME[0].x - 1.4} x1={FORK_HOME[3].x + 1.4} z0={7.3} z1={10} color="#3b82f6" opacity={0.07} border="#93c5fd" />
      <FloorLabel text="FORKLIFT CHARGING" p={[-4.5, 10.6]} w={5.6} fg="#2563eb" />
      <FloorLabel text="OUTBOUND →" p={[18.9, 10.4]} w={3.4} fg="#15803d" />
      <FloorLabel text="↑ INBOUND" p={[-12.5, -11.1]} w={3.2} fg="#b45309" />
    </group>
  );
}

export function World() {
  return (
    <group>
      <Outside />
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[40.6, 0.3, 24.6]} />
        <meshStandardMaterial color={C.floor} />
      </mesh>
      <Markings />
      <Walls />
      <Racks />
      <Office />
    </group>
  );
}
