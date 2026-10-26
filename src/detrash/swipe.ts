/**
 * Swipe-to-cut geometry for the strap layer. Pure functions (no React/DOM) so
 * they can be unit tested.
 *
 * A strap is cut when the swipe stroke crosses the strap's centreline in screen
 * space. Crossing is exact segment intersection, so how thin the strap looks on
 * screen doesn't matter, and a tap or a drag along the strap never cuts it.
 */
import type { Piece } from '../game/sim';

export type P2 = { x: number; y: number };
export type P3 = [number, number, number];
export interface Crate { w: number; d: number; base: number; h: number }

/** Do segments a-b and c-d properly cross? (Touching endpoints count; collinear overlap doesn't.) */
export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  if (d1 === 0 && d2 === 0) return false;
  return ((d1 <= 0 && d2 >= 0) || (d1 >= 0 && d2 <= 0)) && ((d3 <= 0 && d4 >= 0) || (d3 >= 0 && d4 <= 0));
}

/** Does the segment a-b cross any edge of the polyline? */
export function crossesPolyline(a: P2, b: P2, line: P2[]): boolean {
  for (let i = 1; i < line.length; i++) if (segmentsCross(a, b, line[i - 1], line[i])) return true;
  return false;
}

/**
 * Centreline of a strap loop in kit-local coordinates: up one side, across the
 * top and down the other side. Mirrors the strap geometry in PieceGeom.
 */
export function strapPolyline(piece: Piece, c: Crate): P3[] {
  const [axis, off] = piece.p;
  const top = c.base + c.h;
  if (axis === 0) {
    const x = c.w / 2 + 0.07, y = top + 0.085;
    return [[-x, c.base, off], [-x, y, off], [x, y, off], [x, c.base, off]];
  }
  const z = c.d / 2 + 0.07, y = top + 0.1;
  return [[off, c.base, -z], [off, y, -z], [off, y, z], [off, c.base, z]];
}

/** Below this much pointer travel (px) a gesture is a tap, not a swipe. */
export const MIN_SWIPE_PX = 18;
