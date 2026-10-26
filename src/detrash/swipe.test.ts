import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { strapsAlong } from './swipe';

/** Camera looking straight down at two thin straps lying across the crate. */
function scene() {
  const camera = new THREE.PerspectiveCamera(36, 400 / 300, 0.1, 50);
  camera.position.set(0, 6, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const strap = (id: number, z: number) => {
    const g = new THREE.Group();
    g.userData.strapId = id;
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.06), new THREE.MeshBasicMaterial());
    m.position.set(0, 0.5, z);
    g.add(m);
    g.updateMatrixWorld(true);
    return g;
  };
  return { camera, targets: [strap(1, -0.5), strap(2, 0.5)] };
}
const rect = { left: 0, top: 0, width: 400, height: 300 };

describe('swipe to cut', () => {
  it('a fast vertical flick with only two pointer samples crosses both straps, in order', () => {
    const { camera, targets } = scene();
    // the endpoints are far from both straps; only the interpolated samples cross them
    expect(strapsAlong([{ x: 200, y: 20 }, { x: 200, y: 280 }], rect, camera, targets)).toEqual([1, 2]);
  });

  it('a swipe along a strap (never across the other) only cuts that one', () => {
    const { camera, targets } = scene();
    const v = new THREE.Vector3(0, 0.5, -0.5).project(camera);
    const y = (-v.y + 1) / 2 * rect.height;
    expect(strapsAlong([{ x: 60, y }, { x: 340, y }], rect, camera, targets)).toEqual([1]);
  });

  it('a swipe beside the straps cuts nothing', () => {
    const { camera, targets } = scene();
    expect(strapsAlong([{ x: 5, y: 5 }, { x: 395, y: 8 }], rect, camera, targets)).toEqual([]);
  });

  it('a single point (a tap) never cuts', () => {
    const { camera, targets } = scene();
    expect(strapsAlong([{ x: 200, y: 150 }], rect, camera, targets)).toEqual([]);
  });

  it('skips straps that are already cut', () => {
    const { camera, targets } = scene();
    expect(strapsAlong([{ x: 200, y: 20 }, { x: 200, y: 280 }], rect, camera, targets, (id) => id === 1)).toEqual([2]);
  });
});
