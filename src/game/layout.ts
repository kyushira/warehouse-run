/**
 * Floor plan shared by the sim (forklift routes) and the 3D scene.
 * World units ~ metres. +x = east (outbound side), +z = south (front, toward camera).
 *
 *   back road (inbound trucks)  z=-24
 *   ┌──────────────── back wall z=-12 ── IN-A IN-B ─────────────────┐
 *   │ RECEIVING/DETRASH │ WC-1 │ WC-2 │ WC-3 │ STAGING │▐ OUT docks │ right road x=34
 *   │═══════════════════ main aisle z=0.5 ═════════════════════════│
 *   │ compactor  office   forklift chargers    racks                │
 *   └──────────────────────── front wall z=12 ──────────────────────┘
 */
export type Vec = { x: number; z: number };

export const BUILDING = { minX: -20, maxX: 20, minZ: -12, maxZ: 12 };
export const AISLE_Z = 0.5;
export const BACK_LANE_Z = -10.2;

export const IN_DOORS: Vec[] = [{ x: -15.5, z: -12 }, { x: -9.5, z: -12 }];
export const inPick = (i: number): Vec => ({ x: IN_DOORS[i].x, z: -10.8 });

export const RECV_SLOTS: Vec[] = [];
for (const z of [-7.6, -4.0]) for (const x of [-17.4, -14.0, -10.6, -7.2]) RECV_SLOTS.push({ x, z });

export const WC_POS: Vec[] = [{ x: -0.5, z: -6.4 }, { x: 5.5, z: -6.4 }, { x: 11.5, z: -6.4 }];
export const WC_SIZE = { w: 5, d: 7 };
export const wcIn = (i: number): Vec => ({ x: WC_POS[i].x - 1.5, z: -2.2 });
/** finished machine is collected where it was built */
export const wcOut = (i: number): Vec => ({ x: WC_POS[i].x, z: WC_POS[i].z });

export const STAGE_SLOTS: Vec[] = [
  { x: 16.8, z: -8.2 }, { x: 16.8, z: -4.6 }, { x: 16.8, z: 4.0 }, { x: 16.8, z: 7.6 },
];

export const OUT_DOCKS: Vec[] = [{ x: 20, z: -6.5 }, { x: 20, z: -0.5 }, { x: 20, z: 5.5 }];
export const dockDrop = (i: number): Vec => ({ x: 19.0, z: OUT_DOCKS[i].z });

export const FORK_HOME: Vec[] = [{ x: -9, z: 8.6 }, { x: -6, z: 8.6 }, { x: -3, z: 8.6 }, { x: 0, z: 8.6 }];
export const SKIP_POS: Vec = { x: -17.4, z: 6.8 };

export const ROAD_BACK_Z = -24;
export const ROAD_RIGHT_X = 34;

/** Manhattan route through a lane; good enough for the toy forklifts. */
export function route(from: Vec, to: Vec, laneZ = AISLE_Z): Vec[] {
  const pts: Vec[] = [];
  if (Math.abs(from.z - laneZ) > 0.05) pts.push({ x: from.x, z: laneZ });
  if (Math.abs(from.x - to.x) > 0.05) pts.push({ x: to.x, z: laneZ });
  pts.push({ x: to.x, z: to.z });
  return pts;
}

/* ---------- truck choreography: keyframes of trailer-rear position + yaw ---------- */
export interface Pose { x: number; z: number; yaw: number }
type Key = Pose & { u: number };
const PI = Math.PI;

export function truckKeys(kind: 'in' | 'out', dock: number, leaving: boolean): Key[] {
  if (kind === 'in') {
    const dx = IN_DOORS[dock].x;
    return leaving
      ? [
          { u: 0, x: dx, z: -12.2, yaw: PI },
          { u: 0.3, x: dx, z: -17, yaw: PI },
          { u: 0.55, x: dx - 5, z: ROAD_BACK_Z, yaw: PI * 1.5 },
          { u: 1, x: -70, z: ROAD_BACK_Z, yaw: PI * 1.5 },
        ]
      : [
          { u: 0, x: -70, z: ROAD_BACK_Z, yaw: PI / 2 },
          { u: 0.55, x: dx + 9, z: ROAD_BACK_Z, yaw: PI / 2 },
          { u: 0.82, x: dx, z: -17.5, yaw: PI },
          { u: 1, x: dx, z: -12.2, yaw: PI },
        ];
  }
  const dz = OUT_DOCKS[dock].z;
  return leaving
    ? [
        { u: 0, x: 20.2, z: dz, yaw: PI / 2 },
        { u: 0.3, x: 26, z: dz, yaw: PI / 2 },
        { u: 0.55, x: ROAD_RIGHT_X, z: dz - 6, yaw: PI },
        { u: 1, x: ROAD_RIGHT_X, z: -70, yaw: PI },
      ]
    : [
        { u: 0, x: ROAD_RIGHT_X, z: 70, yaw: PI },
        { u: 0.55, x: ROAD_RIGHT_X, z: dz - 9, yaw: PI },
        { u: 0.82, x: 27, z: dz, yaw: PI / 2 },
        { u: 1, x: 20.2, z: dz, yaw: PI / 2 },
      ];
}

export function poseAt(keys: Key[], u: number): Pose {
  const t = Math.min(1, Math.max(0, u));
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.u) {
      const k = (t - a.u) / (b.u - a.u || 1);
      const s = k * k * (3 - 2 * k);
      return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s, yaw: a.yaw + (b.yaw - a.yaw) * s };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l.x, z: l.z, yaw: l.yaw };
}
