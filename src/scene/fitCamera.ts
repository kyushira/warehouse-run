import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Controls extends THREE.EventDispatcher<{ start: object }> { update?: () => void }

/**
 * Frame a close-up 3D view once, then leave the camera alone.
 *
 * The fit used to re-run on every canvas resize. The kit prep canvas resizes
 * whenever the panel next to it changes height, e.g. when the ERP scan table
 * appears or grows on a phone, so each scan snapped the camera back to its
 * starting position and the player had to zoom in again. Now it refits on
 * resize only until the player has rotated or zoomed the view.
 *
 * @param dir    camera direction from the target (normalised internally)
 * @param target point the camera looks at
 * @param fitDist distance that keeps the subject in frame for an aspect ratio
 */
export function useFitCamera(dir: [number, number, number], target: [number, number, number], fitDist: (aspect: number) => number) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const touched = useRef(false);

  useEffect(() => {
    if (!controls?.addEventListener) return;
    const onStart = () => { touched.current = true; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  const [dx, dy, dz] = dir, [tx, ty, tz] = target;
  useEffect(() => {
    if (touched.current || !size.width || !size.height) return;
    const dist = fitDist(size.width / size.height);
    camera.position.copy(new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(dist)).add(new THREE.Vector3(tx, ty, tz));
    camera.lookAt(tx, ty, tz);
    controls?.update?.();
    // fitDist is a pure function of aspect; callers pass a new closure each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size.width, size.height, controls, dx, dy, dz, tx, ty, tz]);
}
