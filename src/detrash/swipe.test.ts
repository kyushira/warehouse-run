import { describe, expect, it } from 'vitest';
import { crossesPolyline, segmentsCross, strapPolyline } from './swipe';
import type { Piece } from '../game/sim';

const crate = { w: 2.4, d: 1.8, base: 0.24, h: 1.3 };
const strap = (axis: number, off: number): Piece => ({ id: 1, kind: 'strap', layer: 0, removed: false, p: [axis, off] });

describe('swipe geometry', () => {
  it('detects a stroke crossing a segment', () => {
    expect(segmentsCross({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 })).toBe(true);
  });
  it('ignores strokes that stop short, run parallel or run along the strap', () => {
    expect(segmentsCross({ x: 0, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 })).toBe(false);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 0 }, { x: 8, y: 0 })).toBe(false);
  });
  it('checks every edge of a polyline', () => {
    const loop = [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(crossesPolyline({ x: 5, y: -1 }, { x: 5, y: 1 }, loop)).toBe(true); // across the top
    expect(crossesPolyline({ x: 9, y: 5 }, { x: 11, y: 5 }, loop)).toBe(true); // across a side
    expect(crossesPolyline({ x: 2, y: 2 }, { x: 8, y: 8 }, loop)).toBe(false); // inside the loop
  });
  it('builds strap loops in the strap plane, over the crate', () => {
    const a = strapPolyline(strap(0, 0.4), crate);
    expect(a.every((p) => p[2] === 0.4)).toBe(true);
    expect(Math.max(...a.map((p) => p[1]))).toBeGreaterThan(crate.base + crate.h);
    const b = strapPolyline(strap(1, -0.3), crate);
    expect(b.every((p) => p[0] === -0.3)).toBe(true);
    expect(Math.abs(b[1][2])).toBeGreaterThan(crate.d / 2);
  });
});
