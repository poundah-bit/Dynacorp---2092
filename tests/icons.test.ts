import { describe, expect, it } from 'vitest';
import { FACILITIES, type Cargo } from '../src/sim/index';
import { ICONS, cargoIconName, facilityIcon, icon } from '../src/ui/icons';

describe('icon set', () => {
  it('every facility type has an icon', () => {
    for (const f of FACILITIES) expect(ICONS[facilityIcon(f.id)].length, f.id).toBeGreaterThan(0);
  });
  it('every facility type has its own icon', () => {
    for (const f of FACILITIES) expect(facilityIcon(f.id), f.id).toBe(f.id);
  });
  it('every cargo has an icon', () => {
    for (const c of ['tank', 'bulk', 'piece', 'cooled', 'live'] as Cargo[]) expect(ICONS[cargoIconName(c)].length).toBeGreaterThan(0);
  });
  it('icon() renders accessible line svg', () => {
    const s = icon('fleet');
    for (const part of ['viewBox="0 0 24 24"', 'aria-hidden="true"', 'fill="none"', 'stroke="currentColor"', 'stroke-width="2"']) expect(s).toContain(part);
    expect(s.split('<path').length - 1).toBe(ICONS.fleet.length);
  });
  it('all path data is drawable', () => {
    for (const [name, paths] of Object.entries(ICONS)) {
      for (const d of paths) {
        expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
        expect(d.trim()[0], name).toBe('M');
      }
    }
  });
});
