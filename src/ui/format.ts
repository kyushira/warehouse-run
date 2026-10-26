import { clockStr } from '../game/content';
import { S } from '../game/sim';

export const money = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
export const at = (t: number) => clockStr(t);
/** mm:ss countdown */
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** due in/over text from shift seconds */
export const dueText = (due: number) => {
  const d = due - S.t;
  return d >= 0 ? `due ${at(due)}` : `${mmss(-d)} late`;
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
