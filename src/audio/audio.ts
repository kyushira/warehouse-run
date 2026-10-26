/**
 * All audio is synthesized with WebAudio (no files):
 *  - SFX: short enveloped oscillators / filtered noise
 *  - Music: generative lo-fi loop (pad chords, bass, soft kick, hats, sparse arp),
 *    scheduled with a look-ahead timer so it stays tight even when frames drop.
 */
export type SfxName =
  | 'order' | 'drop' | 'clean' | 'ready' | 'ship' | 'alarm' | 'horn' | 'crack' | 'buy' | 'deny' | 'done' | 'end'
  | 'snip' | 'peel' | 'lift' | 'pop' | 'click' | 'layer' | 'scan' | 'scanBad' | 'seal';

const KEY = 'kitflow.settings';
export interface AudioSettings { music: boolean; sfx: boolean; musicVol: number }
const load = (): AudioSettings => {
  try {
    return { music: true, sfx: true, musicVol: 0.6, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { music: true, sfx: true, musicVol: 0.6 };
  }
};

// chord tones (MIDI) per bar: Fmaj7 · Em7 · Dm9 · Cmaj7/G
const CHORDS = [
  [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 64], [55, 59, 60, 64],
];
const BASS = [41, 40, 38, 43];
const BPM = 82;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  settings = load();
  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private last: Record<string, number> = {};

  /** Must be called from a user gesture (browser autoplay rules). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    this.ctx = ctx;
    const master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfx ? 0.55 : 0;
    this.sfxBus.connect(master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (this.settings.music) this.startMusic();
  }

  private save() {
    localStorage.setItem(KEY, JSON.stringify(this.settings));
  }

  setMusic(on: boolean) {
    this.settings.music = on;
    this.save();
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }
  setMusicVol(v: number) {
    this.settings.musicVol = v;
    this.save();
    if (this.ctx && this.settings.music) this.musicBus.gain.setTargetAtTime(v * 0.32, this.ctx.currentTime, 0.1);
  }
  setSfx(on: boolean) {
    this.settings.sfx = on;
    this.save();
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.02);
  }

  /* ------------------------------- music -------------------------------- */
  private startMusic() {
    const ctx = this.ctx!;
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVol * 0.32, ctx.currentTime, 0.6);
    if (this.timer !== null) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private stopMusic() {
    const ctx = this.ctx!;
    this.musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  private schedule() {
    const ctx = this.ctx!;
    const sixteenth = 60 / BPM / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }
  private playStep(step: number, t: number, s16: number) {
    const bar = Math.floor(step / 16), inBar = step % 16;
    const chord = CHORDS[bar];
    if (inBar === 0) for (const n of chord) this.pad(mtof(n), t, s16 * 16);
    if (inBar === 0 || inBar === 10) this.bass(mtof(BASS[bar]), t, s16 * (inBar === 0 ? 6 : 4));
    if (inBar === 0 || inBar === 7 || inBar === 10) this.kick(t);
    if (inBar === 4 || inBar === 12) this.snare(t);
    if (inBar % 2 === 1 || inBar % 4 === 2) this.hat(t, inBar % 4 === 2 ? 0.05 : 0.028);
    if (inBar % 2 === 0 && Math.random() < 0.32) this.arp(mtof(chord[Math.floor(Math.random() * 4)] + 12), t);
  }
  private env(g: GainNode, t: number, a: number, peak: number, r: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  }
  private pad(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
    lp.connect(g).connect(this.musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.5);
    g.gain.setValueAtTime(0.06, t + dur - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  }
  private bass(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.02, 0.22, dur);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.005, 0.32, 0.22);
    o.start(t);
    o.stop(t + 0.3);
  }
  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, dur: number, bus: GainNode, q = 0.7) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(g).connect(bus);
    this.env(g, t, 0.003, peak, dur);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return f;
  }
  private snare(t: number) {
    this.noiseHit(t, 'bandpass', 1800, 0.06, 0.16, this.musicBus);
  }
  private hat(t: number, v: number) {
    this.noiseHit(t, 'highpass', 7500, v, 0.04, this.musicBus);
  }
  private arp(f: number, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.01, 0.05, 0.5);
    o.start(t);
    o.stop(t + 0.6);
  }

  /* -------------------------------- sfx --------------------------------- */
  private tone(f: number, t: number, dur: number, type: OscillatorType, peak: number, slide = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    o.connect(g).connect(this.sfxBus);
    this.env(g, t, 0.006, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfx) return;
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < 45) return;
    this.last[name] = now;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'click': this.tone(900, t, 0.04, 'triangle', 0.08); break;
      case 'order': this.tone(660, t, 0.12, 'sine', 0.16); this.tone(880, t + 0.1, 0.18, 'sine', 0.14); break;
      case 'drop': this.tone(140, t, 0.12, 'sine', 0.3, -60); break;
      case 'done': this.tone(740, t, 0.1, 'triangle', 0.12); break;
      case 'ready': [784, 988, 1175].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, 'sine', 0.13)); break;
      case 'clean': [660, 830, 990, 1320].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 'triangle', 0.12)); break;
      case 'layer': this.tone(1046, t, 0.16, 'sine', 0.12); this.tone(1568, t + 0.05, 0.2, 'sine', 0.08); break;
      case 'ship':
        this.noiseHit(t, 'highpass', 5000, 0.12, 0.12, this.sfxBus);
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + 0.05 + i * 0.07, 0.3, 'triangle', 0.14));
        break;
      case 'alarm': [0, 0.22, 0.44].forEach((d) => { this.tone(880, t + d, 0.1, 'square', 0.07); this.tone(660, t + d + 0.11, 0.1, 'square', 0.07); }); break;
      case 'horn': this.tone(155, t, 0.45, 'sawtooth', 0.08); this.tone(196, t, 0.45, 'sawtooth', 0.06); break;
      case 'crack': this.noiseHit(t, 'bandpass', 900, 0.4, 0.18, this.sfxBus, 2); this.tone(180, t, 0.2, 'square', 0.12, -100); break;
      case 'buy': this.tone(520, t, 0.06, 'square', 0.06); this.tone(1040, t + 0.05, 0.1, 'triangle', 0.1); break;
      case 'deny': this.tone(200, t, 0.18, 'sawtooth', 0.08, -60); break;
      case 'end': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.11, 0.4, 'triangle', 0.13)); break;
      case 'snip':
        this.noiseHit(t, 'highpass', 6000, 0.25, 0.05, this.sfxBus);
        this.tone(1900, t, 0.05, 'square', 0.06, -900);
        break;
      case 'peel': {
        const f = this.noiseHit(t, 'bandpass', 2500, 0.22, 0.32, this.sfxBus, 1.4);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
        break;
      }
      case 'lift': this.tone(110, t, 0.2, 'sine', 0.3, 40); this.noiseHit(t, 'lowpass', 600, 0.15, 0.15, this.sfxBus); break;
      case 'pop': this.tone(420 + Math.random() * 160, t, 0.07, 'sine', 0.22, 500); break;
      case 'scan': this.tone(2093, t, 0.07, 'square', 0.07); this.tone(2637, t + 0.075, 0.09, 'square', 0.06); break;
      case 'scanBad': this.tone(1200, t, 0.08, 'square', 0.07); this.tone(600, t + 0.09, 0.18, 'square', 0.08); break;
      case 'seal': this.noiseHit(t, 'bandpass', 3000, 0.25, 0.06, this.sfxBus, 3); this.tone(1400, t + 0.04, 0.06, 'triangle', 0.1); break;
    }
  }
}

export const audio = new AudioEngine();
