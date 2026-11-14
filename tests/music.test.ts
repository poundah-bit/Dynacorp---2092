import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_DEFAULTS, TRACKS, nextTrack, parseMusicSettings, trackCredit } from '../src/ui/music';

describe('soundtrack', () => {
  it('lists six tracks by Thamanoidis whose files exist', () => {
    expect(TRACKS).toHaveLength(6);
    for (const t of TRACKS) expect(existsSync(`public/${t.file}`), t.file).toBe(true);
    expect(trackCredit(TRACKS[0]!)).toBe('Musik: Thamanoidis – The Nu Jazz Klassik Experiment B');
  });
  it('never repeats the track that just played', () => {
    for (let cur = 0; cur < 3; cur++) {
      for (const r of [0, 0.34, 0.5, 0.67, 0.999]) {
        const n = nextTrack(cur, 3, () => r);
        expect(n).not.toBe(cur);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(3);
      }
    }
  });
  it('reaches every track', () => {
    const seen = new Set<number>();
    let cur: number | null = null;
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 30; i++) seen.add((cur = nextTrack(cur, 3, rnd)));
    expect(seen.size).toBe(3);
  });
  it('first track can be any, one track repeats itself', () => {
    expect(nextTrack(null, 3, () => 0.99)).toBe(2);
    expect(nextTrack(0, 1, () => 0.5)).toBe(0);
  });
  it('settings fall back to defaults on missing or broken storage', () => {
    expect(MUSIC_DEFAULTS).toEqual({ on: true, volume: 0.4, choice: 'world' });
    expect(parseMusicSettings(null)).toEqual(MUSIC_DEFAULTS);
    expect(parseMusicSettings('{kaputt')).toEqual(MUSIC_DEFAULTS);
    expect(parseMusicSettings('{"on":false,"volume":0.7}')).toEqual({ on: false, volume: 0.7, choice: 'world' });
    expect(parseMusicSettings('{"on":"ja","volume":5}')).toEqual({ on: true, volume: 1, choice: 'world' });
  });
});

// ---------- Musik pro Welt ----------

import { TRACKS as ALL, playlist } from '../src/ui/music';

describe('Musik pro Welt', () => {
  const group = (g: 1 | 2) => ALL.map((t, i) => (t.group === g ? i : -1)).filter((i) => i >= 0);

  it('Musik der Welt: Welt 1 die alten Stücke, ab Welt 2 die neuen', () => {
    expect(group(1)).toHaveLength(3);
    expect(group(2)).toHaveLength(3);
    expect(playlist('world', 1)).toEqual(group(1));
    expect(playlist('world', 2)).toEqual(group(2));
    expect(playlist('world', 5)).toEqual(group(2));
  });

  it('Nur Welt 1 und alle Stücke gemischt', () => {
    expect(playlist('world1', 3)).toEqual(group(1));
    expect(playlist('all', 1)).toEqual(ALL.map((_, i) => i));
  });

  it('alte Einstellungen bekommen „Musik der Welt“', () => {
    expect(parseMusicSettings('{"on":true,"volume":0.5}').choice).toBe('world');
    expect(parseMusicSettings('{"choice":"all"}').choice).toBe('all');
    expect(parseMusicSettings('{"choice":"quatsch"}').choice).toBe('world');
  });

  it('die neuen Stücke nennen Thamanoidis', () => {
    for (const i of group(2)) expect(trackCredit(ALL[i]!)).toContain('Thamanoidis');
  });
});
