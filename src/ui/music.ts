/// <reference types="vite/client" />
// Soundtrack by Thamanoidis: tracks in random order, never the same one twice in a row. Group 1 belongs to
// world 1, group 2 to the later module worlds; the settings choose the world's music, world 1 only or all.
// Played with an <audio> element so the files stream (they start before they are fully loaded).
// Separate from the event cues in sound.ts; settings (on/off, volume) live in localStorage.

export interface Track {
  title: string;
  /** path below the site root (Vite copies public/ as is) */
  file: string;
  /** 1 = world 1, 2 = module worlds from world 2 on */
  group: 1 | 2;
}

export const ARTIST = 'Thamanoidis';

export const TRACKS: readonly Track[] = [
  { title: 'The Nu Jazz Klassik Experiment B', file: 'music/experiment-b.opus', group: 1 },
  { title: 'The Nu Jazz Klassik Experiment C Klassik', file: 'music/experiment-c-klassik.opus', group: 1 },
  { title: 'The Nu Jazz Klassik Experiment C XMAS', file: 'music/experiment-c-xmas.opus', group: 1 },
  { title: 'Iron Bullet Clash (Dubstep)', file: 'music/iron-bullet-clash.opus', group: 2 },
  { title: 'Iron Bullet Clash (Dubstep, Jazzy RnB Cover)', file: 'music/iron-bullet-clash-rnb.opus', group: 2 },
  { title: 'Is It Worth', file: 'music/is-it-worth.opus', group: 2 },
];

export const trackCredit = (t: Track) => `Musik: ${ARTIST} – ${t.title}`;

/** Silence between two tracks. */
const GAP_MS = 3000;

export interface MusicSettings {
  on: boolean;
  /** 0..1 */
  volume: number;
  /** the music of the running world, only world 1's, or all tracks mixed */
  choice: MusicChoice;
}

export type MusicChoice = 'world' | 'world1' | 'all';
const CHOICES: MusicChoice[] = ['world', 'world1', 'all'];

export const MUSIC_DEFAULTS: MusicSettings = { on: true, volume: 0.4, choice: 'world' };

/** Indices into TRACKS that may play for this choice in world `world`. */
export function playlist(choice: MusicChoice, world: number): number[] {
  const group = choice === 'all' ? null : choice === 'world1' || world <= 1 ? 1 : 2;
  return TRACKS.map((t, i) => (group === null || t.group === group ? i : -1)).filter((i) => i >= 0);
}
const KEY = 'dynacorp2092.music.v1';

/** Settings from storage; anything missing or broken falls back to the defaults. */
export function parseMusicSettings(raw: string | null): MusicSettings {
  try {
    const d = raw ? (JSON.parse(raw) as Partial<MusicSettings>) : {};
    const volume = typeof d.volume === 'number' && Number.isFinite(d.volume) ? Math.min(1, Math.max(0, d.volume)) : MUSIC_DEFAULTS.volume;
    const choice = CHOICES.includes(d.choice as MusicChoice) ? (d.choice as MusicChoice) : MUSIC_DEFAULTS.choice;
    return { on: typeof d.on === 'boolean' ? d.on : MUSIC_DEFAULTS.on, volume, choice };
  } catch {
    return { ...MUSIC_DEFAULTS };
  }
}

/** A random track index, never `current` (unless there is only one track). */
export function nextTrack(current: number | null, count: number, rnd: () => number): number {
  if (count <= 1) return 0;
  if (current === null) return Math.min(count - 1, Math.floor(rnd() * count));
  const pick = Math.min(count - 2, Math.floor(rnd() * (count - 1)));
  return pick >= current ? pick + 1 : pick;
}

// ---------- player (browser only) ----------

let settings: MusicSettings = { ...MUSIC_DEFAULTS };
try {
  settings = parseMusicSettings(localStorage.getItem(KEY));
} catch {
  // no storage: defaults
}

let audio: HTMLAudioElement | null = null;
let current: number | null = null;
let unlocked = false;
let failures = 0;
let gapTimer: ReturnType<typeof setTimeout> | undefined;
let world = 1;

export const musicSettings = (): MusicSettings => settings;
export const nowPlaying = (): Track | null => (current === null ? null : TRACKS[current]!);

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('ended', () => {
    clearTimeout(gapTimer);
    gapTimer = setTimeout(playNext, GAP_MS);
  });
  audio.addEventListener('playing', () => (failures = 0));
  audio.addEventListener('error', () => {
    // offline or a format the device can't play: try the next track, give up after a full round
    if (++failures < TRACKS.length) playNext();
  });
  return audio;
}

function playNext() {
  if (!settings.on || !unlocked) return;
  const a = element();
  const list = playlist(settings.choice, world);
  const at = current === null ? null : list.indexOf(current);
  current = list[nextTrack(at === null || at < 0 ? null : at, list.length, Math.random)]!;
  a.src = `${import.meta.env.BASE_URL}${TRACKS[current]!.file}`;
  a.volume = settings.volume;
  void a.play().catch(() => {
    // blocked or failed to load: stay silent, the error handler moves on
  });
}

function resume() {
  if (!settings.on || !unlocked) return;
  if (!audio || current === null) return playNext();
  if (audio.paused && !audio.ended) void audio.play().catch(() => {});
}

/** Call on the first tap: browsers only allow sound after one. */
export function startMusic() {
  if (unlocked) return;
  unlocked = true;
  resume();
}

export function setMusicSettings(next: MusicSettings) {
  const before = playlist(settings.choice, world).join();
  settings = parseMusicSettings(JSON.stringify(next));
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // no storage: keep the settings for this session
  }
  if (audio) audio.volume = settings.volume;
  if (settings.on && playlist(settings.choice, world).join() !== before && unlocked) skipTrack();
  else if (settings.on) resume();
  else {
    clearTimeout(gapTimer);
    audio?.pause();
  }
}

/** The running world changed (campaign): a different playlist starts right away. */
export function setMusicWorld(n: number) {
  const before = playlist(settings.choice, world).join();
  world = n;
  if (playlist(settings.choice, world).join() !== before && unlocked && settings.on) skipTrack();
}

/** Jump to another track right away. */
export function skipTrack() {
  clearTimeout(gapTimer);
  failures = 0;
  playNext();
}

// pause in the background (app switched, screen off) and go on where it stopped
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(gapTimer);
      audio?.pause();
    } else if (audio?.ended) {
      gapTimer = setTimeout(playNext, GAP_MS);
    } else resume();
  });
}
