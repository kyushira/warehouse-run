import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { MODELS } from '../game/content';
import type { ModelId } from '../game/content';
import type { Status } from './status';

export const Chip = ({ s, children }: { s?: Status; children?: ReactNode }) => (
  <span className={`chip ${s?.tone ?? ''}`}>{children ?? s?.label}</span>
);

export const Bar = ({ v, tone }: { v: number; tone?: string }) => (
  <div className={`bar ${tone ?? ''}`}>
    <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
  </div>
);

export const Swatch = ({ model }: { model: ModelId }) => (
  <div className="swatch" style={{ background: MODELS[model].color }}>
    {MODELS[model].short.split('-')[0]}
  </div>
);

export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
/** Phone layout: narrow portrait, or a short landscape phone (desktop panels would cover the yard). */
export const MOBILE_QUERY = '(max-width: 819px), (max-height: 520px)';
export const useIsMobile = () => useMedia(MOBILE_QUERY);
