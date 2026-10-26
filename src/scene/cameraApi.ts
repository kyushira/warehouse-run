import type { CameraControlsImpl } from '@react-three/drei';

/** Bridge so DOM buttons can drive the R3F CameraControls instance. */
export const camRef: { current: CameraControlsImpl | null } = { current: null };

export function zoomCam(f: number) {
  const c = camRef.current;
  if (c) void c.zoomTo(c.camera.zoom * f, true);
}
export function rotateCam(a: number) {
  void camRef.current?.rotate(a, 0, true);
}
export function resetCam() {
  void camRef.current?.reset(true);
}
export function focusCam(x: number, z: number) {
  void camRef.current?.moveTo(x, 0, z, true);
}
