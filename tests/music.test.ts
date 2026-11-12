import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_DEFAULTS, TRACKS, nextTrack, parseMusicSettings, trackCredit } from '../src/ui/music';

describe('soundtrack', () => {
  it('lists three tracks by Thamanoidis whose files exist', () => {
    expect(TRACKS).toHaveLength(3);
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
    expect(MUSIC_DEFAULTS).toEqual({ on: true, volume: 0.4 });
    expect(parseMusicSettings(null)).toEqual(MUSIC_DEFAULTS);
    expect(parseMusicSettings('{kaputt')).toEqual(MUSIC_DEFAULTS);
    expect(parseMusicSettings('{"on":false,"volume":0.7}')).toEqual({ on: false, volume: 0.7 });
    expect(parseMusicSettings('{"on":"ja","volume":5}')).toEqual({ on: true, volume: 1 });
  });
});
