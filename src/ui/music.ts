/// <reference types="vite/client" />
// Soundtrack by Thamanoidis: three tracks in random order, never the same one twice in a row.
// Played with an <audio> element so the files stream (they start before they are fully loaded).
// Separate from the event cues in sound.ts; settings (on/off, volume) live in localStorage.

export interface Track {
  title: string;
  /** path below the site root (Vite copies public/ as is) */
  file: string;
}

export const ARTIST = 'Thamanoidis';

export const TRACKS: readonly Track[] = [
  { title: 'The Nu Jazz Klassik Experiment B', file: 'music/experiment-b.opus' },
  { title: 'The Nu Jazz Klassik Experiment C Klassik', file: 'music/experiment-c-klassik.opus' },
  { title: 'The Nu Jazz Klassik Experiment C XMAS', file: 'music/experiment-c-xmas.opus' },
];

export const trackCredit = (t: Track) => `Musik: ${ARTIST} – ${t.title}`;

/** Silence between two tracks. */
const GAP_MS = 3000;

export interface MusicSettings {
  on: boolean;
  /** 0..1 */
  volume: number;
}

export const MUSIC_DEFAULTS: MusicSettings = { on: true, volume: 0.4 };
const KEY = 'dynacorp2092.music.v1';

/** Settings from storage; anything missing or broken falls back to the defaults. */
export function parseMusicSettings(raw: string | null): MusicSettings {
  try {
    const d = raw ? (JSON.parse(raw) as Partial<MusicSettings>) : {};
    const volume = typeof d.volume === 'number' && Number.isFinite(d.volume) ? Math.min(1, Math.max(0, d.volume)) : MUSIC_DEFAULTS.volume;
    return { on: typeof d.on === 'boolean' ? d.on : MUSIC_DEFAULTS.on, volume };
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
  current = nextTrack(current, TRACKS.length, Math.random);
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
  settings = parseMusicSettings(JSON.stringify(next));
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // no storage: keep the settings for this session
  }
  if (audio) audio.volume = settings.volume;
  if (settings.on) resume();
  else {
    clearTimeout(gapTimer);
    audio?.pause();
  }
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
