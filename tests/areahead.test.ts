import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AreaStats } from '../src/ui/play';
import { areaHead } from '../src/ui/views';

const base: AreaStats = {
  facilities: { total: 0, running: 0, stopped: 0, building: 0, pending: 0 },
  fleet: { total: 7, idle: 3, moving: 3, critical: 1 },
  market: { fitting: 0, transports: 0, big: 0 },
  orders: { promised: 0, unshipped: 0, nextDeadline: null, overdue: false, routes: 0 },
};

describe('area header', () => {
  it('fleet header shows counts and the critical chip', () => {
    const h = areaHead('fleet', base);
    for (const part of ['data-area="fleet"', '7 Schiffe', '3 frei', '3 unterwegs', '1 kritisch', 'class="chip bad"']) expect(h).toContain(part);
  });
  it('drops optional chips at zero and uses singular forms', () => {
    const h = areaHead('fleet', { ...base, fleet: { total: 1, idle: 1, moving: 0, critical: 0 } });
    expect(h).not.toContain('kritisch');
    expect(h).toContain('1 Schiff<');
  });
  it('orders header shows overdue deadlines and hides a missing one', () => {
    const over = areaHead('orders', { ...base, orders: { promised: 2, unshipped: 1, nextDeadline: -2, overdue: true, routes: 0 } });
    expect(over).toMatch(/class="chip bad"[^>]*>.*Frist überzogen/);
    expect(over).toContain('1 ohne Transport');
    const none = areaHead('orders', base);
    expect(none).not.toContain('Frist');
  });
  it('facilities and market headers', () => {
    const f = areaHead('facilities', { ...base, facilities: { total: 5, running: 4, stopped: 1, building: 0, pending: 0 } });
    for (const part of ['5 Anlagen', '4 in Betrieb', '1 Stillstand']) expect(f).toContain(part);
    expect(f).not.toContain('im Bau');
    const m = areaHead('market', { ...base, market: { fitting: 4, transports: 1, big: 2 } });
    for (const part of ['4 passen zu dir', '1 Transport<', '2 Großaufträge']) expect(m).toContain(part);
  });
  it('every guide target still has its marker in the markup', () => {
    const play = readFileSync('src/ui/play.ts', 'utf8');
    const markup = readFileSync('src/ui/views.ts', 'utf8') + readFileSync('index.html', 'utf8');
    const targets = [...play.matchAll(/target: '([a-z-]+)'/g)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(5);
    for (const t of new Set(targets)) expect(markup, t).toContain(`data-guide="${t}"`);
  });
});

describe('routes chip', () => {
  it('shows active Lieferrouten in the orders header', () => {
    expect(areaHead('orders', { ...base, orders: { ...base.orders, routes: 2 } })).toContain('2 Lieferrouten aktiv');
    expect(areaHead('orders', base)).not.toContain('Lieferroute');
  });
});
