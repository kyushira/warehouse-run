import * as THREE from 'three';

/** raycast spacing along a stroke segment, px */
export const SWIPE_STEP = 4;

export interface ScreenPt { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Strap ids crossed by a swipe, in the order they are crossed.
 *
 * Samples every segment of the stroke every SWIPE_STEP px and raycasts each
 * sample, so a fast flick (few, far-apart pointer events) still registers a
 * thin strap that no single pointer event landed on. Objects are matched to a
 * strap through `userData.strapId` on the object or any ancestor.
 *
 * @param skip ids to ignore (already cut, or still flying away after a cut)
 */
export function strapsAlong(
  pts: ScreenPt[], rect: Rect, camera: THREE.Camera, targets: THREE.Object3D[],
  skip: (id: number) => boolean = () => false, ray = new THREE.Raycaster(),
): number[] {
  const out: number[] = [];
  if (pts.length < 2 || !targets.length) return out;
  const ndc = new THREE.Vector2();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SWIPE_STEP));
    for (let k = 1; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects(targets, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.strapId === undefined) o = o.parent;
        const id = o?.userData.strapId as number | undefined;
        if (id === undefined || out.includes(id) || skip(id)) continue;
        out.push(id);
        break;
      }
    }
  }
  return out;
}
