// Soft sound cues, made in the browser with the Web Audio API – no sound files. Each cue is a few sine or
// triangle notes with a gentle attack, a slow fade, muted highs and a little room echo, so it sounds like glass,
// marimba or a small bell rather than a beep. Settings (volume, on/off per cue) live in localStorage.

import { CUE_ORDER, type Cue } from './cues';

export interface SoundSettings {
  on: boolean;
  /** 0..1 */
  volume: number;
  cues: Record<Cue, boolean>;
}

export const CUE_INFO: Record<Cue, { name: string; text: string }> = {
  big: { name: 'Großauftrag', text: 'Terra bietet einen seltenen Großauftrag für eine Ware an, die du herstellst.' },
  stall: { name: 'Anlage steht', text: 'Eine laufende Anlage produziert nichts mehr: Rohstoffe fehlen oder das Lager ist voll.' },
  critical: { name: 'Schiff kritisch', text: 'Ein Schiff ist in kritischem Zustand und fliegt nur noch langsam.' },
  built: { name: 'Anlage fertig', text: 'Eine Anlage ist fertig gebaut und kann gestartet werden.' },
  idle: { name: 'Schiff frei', text: 'Ein Schiff hat seinen Auftrag beendet und ist wieder frei.' },
  repair: { name: 'Reparatur', text: 'Du hast eine Reparatur beauftragt oder vorgemerkt.' },
};

const KEY = 'dynacorp2092.sound.v1';
const DEFAULTS: SoundSettings = {
  on: true,
  volume: 0.6,
  cues: { big: true, stall: true, critical: true, built: true, idle: true, repair: true },
};

let settings: SoundSettings = load();

function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      on: s.on ?? DEFAULTS.on,
      volume: Math.max(0, Math.min(1, Number(s.volume ?? DEFAULTS.volume))),
      cues: { ...DEFAULTS.cues, ...(s.cues ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const soundSettings = (): SoundSettings => settings;

export function setSoundSettings(next: SoundSettings) {
  settings = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private mode or full storage: the setting just isn't remembered
  }
  if (master && ctx) master.gain.setTargetAtTime(settings.volume * MASTER, ctx.currentTime, 0.05);
}

// ---------- audio graph ----------

/** overall loudness; the cues are meant to sit quietly under whatever else is playing */
const MASTER = 0.35;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: AudioNode | null = null;

/** Browsers allow sound only after a user gesture: call this from a tap. */
export function unlockSound() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume * MASTER;
    // muted highs: nothing sharp
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    tone.Q.value = 0.5;
    // a little room: short generated echo tail mixed in quietly
    const room = ctx.createConvolver();
    room.buffer = roomTail(ctx, 1.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    tone.connect(master);
    tone.connect(room).connect(wet).connect(master);
    master.connect(ctx.destination);
    bus = tone;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function roomTail(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

interface Note {
  /** Hz */
  f: number;
  /** start offset in seconds */
  at: number;
  /** fade-out time in seconds */
  len: number;
  /** 0..1 */
  vol: number;
  wave?: OscillatorType;
  /** attack in seconds */
  attack?: number;
  /** quiet overtones as frequency ratios, for bell or marimba colour */
  partials?: [ratio: number, vol: number][];
}

function note(n: Note, t0: number) {
  if (!ctx || !bus) return;
  const voices: [number, number][] = [[1, 1], ...(n.partials ?? [])];
  for (const [ratio, rel] of voices) {
    const osc = ctx.createOscillator();
    osc.type = ratio === 1 ? (n.wave ?? 'sine') : 'sine';
    osc.frequency.value = n.f * ratio;
    const g = ctx.createGain();
    const start = t0 + n.at;
    const attack = n.attack ?? 0.008;
    // overtones fade faster than the fundamental, like a struck bar
    const len = ratio === 1 ? n.len : n.len * 0.45;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(n.vol * rel, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + len);
    osc.connect(g).connect(bus);
    osc.start(start);
    osc.stop(start + attack + len + 0.05);
  }
}

const MARIMBA: [number, number][] = [[4, 0.18], [10, 0.04]];
const BELL: [number, number][] = [[2.01, 0.35], [2.76, 0.18], [5.4, 0.06]];
const GLASS: [number, number][] = [[3, 0.12]];

/** The sound of each cue. Pitches stay in a calm major / pentatonic range. */
const CUES: Record<Cue, Note[]> = {
  // a small bell, two notes a fifth apart: rare and pleasant
  big: [
    { f: 783.99, at: 0, len: 1.6, vol: 0.5, partials: BELL },
    { f: 1174.66, at: 0.16, len: 1.8, vol: 0.38, partials: BELL },
  ],
  // two soft notes going down: something stopped
  stall: [
    { f: 523.25, at: 0, len: 0.55, vol: 0.55, attack: 0.02, partials: GLASS },
    { f: 392.0, at: 0.2, len: 0.8, vol: 0.55, attack: 0.02, partials: GLASS },
  ],
  // a low, quiet double pulse
  critical: [
    { f: 196.0, at: 0, len: 0.35, vol: 0.75, wave: 'triangle', attack: 0.03 },
    { f: 196.0, at: 0.26, len: 0.5, vol: 0.6, wave: 'triangle', attack: 0.03 },
  ],
  // three notes going up: ready to start
  built: [
    { f: 523.25, at: 0, len: 0.5, vol: 0.4, partials: MARIMBA },
    { f: 659.25, at: 0.1, len: 0.5, vol: 0.4, partials: MARIMBA },
    { f: 783.99, at: 0.2, len: 0.9, vol: 0.45, partials: MARIMBA },
  ],
  // one short wooden note: a ship is free again
  idle: [{ f: 659.25, at: 0, len: 0.4, vol: 0.45, partials: MARIMBA }],
  // a light "pling" upwards: order confirmed
  repair: [
    { f: 880.0, at: 0, len: 0.25, vol: 0.32, partials: GLASS },
    { f: 1318.51, at: 0.08, len: 0.5, vol: 0.32, partials: GLASS },
  ],
};

// ---------- playing ----------

/** real seconds a cue stays quiet after it played, so fast game speeds don't turn into chimes */
const COOLDOWN: Record<Cue, number> = { big: 4, stall: 8, critical: 8, built: 4, idle: 5, repair: 0.3 };
/** at most this many cues per game day */
const MAX_PER_DAY = 2;
/** gap between two cues of the same day */
const GAP = 0.45;

const lastPlayed: Partial<Record<Cue, number>> = {};

/** Plays one cue now, if sound and that cue are on and it didn't just play. */
export function play(cue: Cue) {
  playDay([cue]);
}

/** Plays the cues of one game day: most important first, at most two, slightly apart. */
export function playDay(cues: readonly Cue[]) {
  if (!settings.on || !cues.length) return;
  unlockSound();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  let offset = 0;
  let n = 0;
  for (const cue of CUE_ORDER) {
    if (!cues.includes(cue) || !settings.cues[cue]) continue;
    if (now - (lastPlayed[cue] ?? -Infinity) < COOLDOWN[cue]) continue;
    lastPlayed[cue] = now;
    for (const nt of CUES[cue]) note(nt, now + 0.02 + offset);
    offset += GAP;
    if (++n >= MAX_PER_DAY) break;
  }
}

/** Plays a cue for the listening test in the settings, ignoring on/off and cooldown. */
export function preview(cue: Cue) {
  unlockSound();
  if (!ctx) return;
  const t = ctx.currentTime + 0.03;
  for (const nt of CUES[cue]) note(nt, t);
}
