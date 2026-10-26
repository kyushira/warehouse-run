import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import * as THREE from 'three';
import { camRef } from './cameraApi';
import { Entities } from './Entities';
import { World } from './World';
import { CANVAS_DPR, IS_TOUCH } from '../ui/primitives';

const { ACTION } = CameraControlsImpl;

/** Screen-space area not covered by HUD panels; the scene is centred in it. */
function freeArea(W: number, H: number) {
  if (H <= 520 && W >= 560) {
    // landscape phone: the panel is docked on the right (see styles.css --side)
    const right = Math.min(380, W * 0.46);
    return { left: 0, right, top: 56, bottom: 0, w: W - right, h: H - 56 };
  }
  const mobile = W < 820 || H <= 520;
  const left = mobile ? 0 : 56;
  const right = mobile ? 0 : 364;
  const top = mobile ? 72 : 80;
  const bottom = mobile ? H * 0.46 : 232;
  return { left, right, top, bottom, w: W - left - right, h: H - top - bottom };
}

function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const touched = useRef(false);
  const { size, camera } = useThree();

  useEffect(() => {
    const W = size.width, H = size.height, a = freeArea(W, H);
    const cx = a.left + a.w / 2, cy = a.top + a.h / 2;
    (camera as THREE.OrthographicCamera).setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    camera.updateProjectionMatrix();
  }, [size.width, size.height, camera]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    camRef.current = c;
    c.mouseButtons.left = ACTION.TRUCK;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.ZOOM;
    c.mouseButtons.middle = ACTION.ZOOM;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.TOUCH_ZOOM_TRUCK;
    c.touches.three = ACTION.TOUCH_ROTATE;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-30, -1, -28), new THREE.Vector3(38, 1, 24)));
    const onStart = () => { touched.current = true; };
    c.addEventListener('controlstart', onStart);
    return () => {
      c.removeEventListener('controlstart', onStart);
      camRef.current = null;
    };
  }, []);

  // fit the yard into the free area; re-fit on resize until the player moves the camera
  useEffect(() => {
    const c = ref.current;
    if (!c || touched.current) return;
    const a = freeArea(size.width, size.height);
    const zoom = THREE.MathUtils.clamp(Math.min(a.w / 44, a.h / 27), 6, 44);
    void c.setLookAt(38, 42, 38, 1, 0, -1.5, false);
    void c.zoomTo(zoom, false);
    c.saveState();
  }, [size.width, size.height]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minZoom={5}
      maxZoom={70}
      minPolarAngle={0.35}
      maxPolarAngle={1.2}
      dollyToCursor
      smoothTime={0.2}
    />
  );
}

export function SceneCanvas() {
  return (
    <div className="scene">
      <Canvas
        shadows
        flat
        dpr={CANVAS_DPR}
        orthographic
        camera={{ position: [38, 42, 38], zoom: 18, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => { document.body.style.cursor = ''; }}
      >
        <color attach="background" args={['#e8eef7']} />
        <hemisphereLight args={['#ffffff', '#b9c6d8', 1.05]} />
        <directionalLight
          position={[26, 44, 18]}
          intensity={1.55}
          castShadow
          shadow-mapSize={IS_TOUCH ? [1024, 1024] : [2048, 2048]}
          shadow-camera-left={-48}
          shadow-camera-right={48}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-camera-near={1}
          shadow-camera-far={140}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <CameraRig />
        <World />
        <Entities />
      </Canvas>
    </div>
  );
}
