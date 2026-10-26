import { Suspense, lazy, useEffect } from 'react';
import { S } from './game/sim';
import { openNextKit, togglePause, useGameLoop, useUi } from './game/store';
import { SettingsMenu, ShiftBriefing, ShiftReport, TitleScreen, Toasts } from './ui/Chrome';
import { DesktopHud, MobileHud } from './ui/Hud';
import { useIsMobile } from './ui/primitives';
import { TopBar } from './ui/TopBar';
import { AdminLayer } from './ui/AdminPanel';

// three.js / R3F code is split into separate chunks so the dashboard and title
// screen paint first; the yard and the 3D modals stream in right after.
const SceneCanvas = lazy(() => import('./scene/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));
const DetrashModal = lazy(() => import('./detrash/DetrashModal').then((m) => ({ default: m.DetrashModal })));
const DispatchModal = lazy(() => import('./detrash/DispatchModal').then((m) => ({ default: m.DispatchModal })));

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const ui = useUi.getState();
      if (e.key === 'Escape') {
        if (ui.settingsOpen) ui.setSettings(false);
        return;
      }
      if (ui.phase !== 'playing' || ui.helpOpen) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key.toLowerCase() === 'd' && !ui.detrashKit && !ui.dispatch && !S.paused) {
        openNextKit();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useGameLoop();
  useShortcuts();
  const mobile = useIsMobile();
  return (
    <>
      <Suspense fallback={<div className="scene" />}>
        <SceneCanvas />
      </Suspense>
      <TopBar />
      {mobile ? <MobileHud /> : <DesktopHud />}
      <Toasts />
      <Suspense fallback={null}>
        <DetrashModal />
        <DispatchModal />
      </Suspense>
      <SettingsMenu />
      <TitleScreen />
      <ShiftBriefing />
      <ShiftReport />
      <AdminLayer />
    </>
  );
}
