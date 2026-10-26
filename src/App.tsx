import { useEffect } from 'react';
import { DetrashModal } from './detrash/DetrashModal';
import { DispatchModal } from './detrash/DispatchModal';
import { S } from './game/sim';
import { openNextKit, togglePause, useGameLoop, useUi } from './game/store';
import { SceneCanvas } from './scene/SceneCanvas';
import { SettingsMenu, ShiftBriefing, ShiftReport, TitleScreen, Toasts } from './ui/Chrome';
import { DesktopHud, MobileHud } from './ui/Hud';
import { useIsMobile } from './ui/primitives';
import { TopBar } from './ui/TopBar';
import { AdminLayer } from './ui/AdminPanel';

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
      <SceneCanvas />
      <TopBar />
      {mobile ? <MobileHud /> : <DesktopHud />}
      <Toasts />
      <DetrashModal />
      <DispatchModal />
      <SettingsMenu />
      <TitleScreen />
      <ShiftBriefing />
      <ShiftReport />
      <AdminLayer />
    </>
  );
}
