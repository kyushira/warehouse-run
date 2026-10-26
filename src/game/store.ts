import { useEffect } from 'react';
import { create } from 'zustand';
import { audio } from '../audio/audio';
import { admin, adminTick } from './admin';
import type { SfxName } from '../audio/audio';
import { S, drainEvents, openDetrash, closeDetrash, setPaused, startShift, tick, waitingKits } from './sim';
import type { Tone } from './sim';
import { rollModifiers } from './modifiers';
import type { ModifierId } from './modifiers';
import { randomSeed, todaySeed } from './rng';

export type Phase = 'title' | 'briefing' | 'playing' | 'over';
/** what a shift will be: replaying a plan replays the same orders and conditions */
export interface ShiftPlan { seed: number; daily: boolean; mods: ModifierId[] }
export type MobileTab = 'orders' | 'floor' | 'yard' | 'shop';
export type SideTab = 'floor' | 'yard' | 'shop';
export interface Toast { id: number; text: string; tone: Tone }

interface UiState {
  /** bumps ~10x/s so DOM panels re-read the mutable sim */
  v: number;
  phase: Phase;
  plan: ShiftPlan | null;
  selected: string | null;
  detrashKit: string | null;
  /** shipment whose goods-issue (dispatch) modal is open */
  dispatch: string | null;
  sideTab: SideTab;
  settingsOpen: boolean;
  helpOpen: boolean;
  mobileTab: MobileTab;
  sheetOpen: boolean;
  toasts: Toast[];
  bump: () => void;
  select: (id: string | null) => void;
  setMobileTab: (t: MobileTab) => void;
  setSheet: (o: boolean) => void;
  setSettings: (o: boolean) => void;
  setHelp: (o: boolean) => void;
  setSideTab: (t: SideTab) => void;
}

export const useUi = create<UiState>()((set) => ({
  v: 0,
  phase: 'title',
  plan: null,
  selected: null,
  detrashKit: null,
  dispatch: null,
  sideTab: 'floor',
  settingsOpen: false,
  helpOpen: false,
  mobileTab: 'orders',
  sheetOpen: true,
  toasts: [],
  bump: () => set((s) => ({ v: s.v + 1 })),
  select: (id) => set({ selected: id }),
  setMobileTab: (t) => set({ mobileTab: t, sheetOpen: true }),
  setSheet: (o) => set({ sheetOpen: o }),
  setSettings: (o) => set({ settingsOpen: o }),
  setHelp: (o) => set({ helpOpen: o }),
  setSideTab: (t) => set({ sideTab: t }),
}));

/** Subscribe a component to sim refreshes. */
export const useSim = () => useUi((s) => s.v);

let toastId = 0;
export function toast(text: string, tone: Tone = 'info') {
  const id = ++toastId;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3400);
}

export const sfx = (n: SfxName) => audio.play(n);

/* ----------------------------- flow actions ----------------------------- */

export function makePlan(daily: boolean, seed = daily ? todaySeed() : randomSeed()): ShiftPlan {
  return { seed, daily, mods: rollModifiers(seed) };
}

/** Roll a shift and show its briefing; the clock starts on beginShift(). */
export function planShift(daily = false) {
  audio.init();
  closeDetrash();
  useUi.setState({ phase: 'briefing', plan: makePlan(daily), helpOpen: false, settingsOpen: false, detrashKit: null, dispatch: null });
}

export function beginShift(plan = useUi.getState().plan ?? makePlan(false)) {
  audio.init();
  startShift(plan.seed, plan.mods, plan.daily);
  useUi.setState({ phase: 'playing', plan, selected: S.shipments[0]?.id ?? null, detrashKit: null, dispatch: null, settingsOpen: false, toasts: [] });
}

/** Same seed and modifiers, from 06:00. */
export function restartShift() {
  closeDetrash();
  beginShift();
}

export function openKit(kitId: string | null | undefined) {
  if (!kitId || !openDetrash(kitId)) return;
  const k = S.kits.find((x) => x.id === kitId);
  useUi.setState({ detrashKit: kitId, selected: k?.shipmentId ?? useUi.getState().selected });
  sfx('click');
}

export function openNextKit() {
  const cur = useUi.getState().detrashKit;
  const next = waitingKits().find((k) => k.id !== cur && k.by !== 'operator') ?? waitingKits().find((k) => k.id !== cur);
  if (next) openKit(next.id);
  else closeKit();
}

export function openDispatch(shipmentId: string) {
  closeDetrash();
  useUi.setState({ dispatch: shipmentId, detrashKit: null, selected: shipmentId });
  sfx('click');
}
export function closeDispatch() {
  useUi.setState({ dispatch: null });
}

export function closeKit() {
  closeDetrash();
  useUi.setState({ detrashKit: null });
}

export function togglePause(force?: boolean) {
  const p = force ?? !S.paused;
  setPaused(p);
  useUi.getState().bump();
}

/* ------------------------------- game loop ------------------------------ */

export function useGameLoop() {
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw);
      last = now;
      if (raw > 0) admin.fps += (1 / raw - admin.fps) * 0.05;
      // admin speed: run the sim in <=50ms steps so fast-forward stays stable
      let left = dt * (admin.unlocked ? admin.flags.speed : 1);
      while (left > 1e-6) {
        const step = Math.min(0.05, left);
        tick(step);
        adminTick(step);
        left -= step;
      }
      const evs = drainEvents();
      for (const e of evs) {
        if (e.text) toast(e.text, e.tone);
        if (e.sfx) audio.play(e.sfx);
      }
      acc += dt;
      if (acc > 0.1 || evs.length) {
        acc = 0;
        const st = useUi.getState();
        if (S.over && st.phase === 'playing') {
          closeDetrash();
          useUi.setState({ phase: 'over', detrashKit: null, dispatch: null });
        }
        st.bump();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.hidden && S.running) togglePause(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
