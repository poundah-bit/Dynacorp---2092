// Overdue deliveries: a promised delivery that never comes is cancelled 30 days after its deadline (or earlier
// by the buyer); the supplier frees the reserved goods and pays the buyer 20 % of the missing goods' value.
import { describe, expect, it } from 'vitest';
import { CONFIG, acceptDemand, cancelOverdue, company, step, type Demand, type World } from '../src/sim/index';
import { player, soloWorld } from './helpers';

const plant = (w: World, owner: string, type: string, planet: string, stock: Record<string, number> = {}) => {
  const reserved: Record<string, number> = {};
  const f = { id: `f-${type}-${owner}`, owner, type, planet, units: 1, status: 'running' as const, buildDaysLeft: 0, condition: 100, stock, reserved, storages: [], idleDays: 0 };
  w.facilities.push(f);
  return f;
};

/** The player's refinery ordered 5,000 l oil; an AI well with nothing on stock promised it. */
function setup() {
  const w = soloWorld();
  const me = player(w);
  const ai = 'c-ai';
  w.companies.push({ ...company(w, me), id: ai, name: 'Cygnus', isPlayer: false, cash: 1_000_000, reputation: 50 });
  const refinery = plant(w, me, 'refinery', 'pyros');
  const well = plant(w, ai, 'oilwell', 'vesta-nova');
  const d: Demand = { id: 'd-own', requester: me, good: 'oil', amount: 5000, toPlanet: 'pyros', toFacility: refinery.id, pricePerFe: 20, own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: 0, deadlineDay: 40, late: false };
  w.demands = [d];
  const r = acceptDemand(w, ai, d.id, well.id);
  if (!r.ok) throw new Error(r.error);
  return { w, me, ai, d, well };
}

describe('Überfällige Lieferungen', () => {
  it('vor Fristende kann der Käufer nicht stornieren', () => {
    const { w, me, d } = setup();
    expect(cancelOverdue(w, me, d.id).ok).toBe(false);
  });

  it('nach Fristende: Stornieren gibt die Ware frei, der Lieferant zahlt 20 % Entschädigung', () => {
    const { w, me, ai, d, well } = setup();
    expect(well.reserved.oil).toBe(5000);
    d.deadlineDay = w.day - 1;
    d.late = true;
    const mine = company(w, me).cash;
    const theirs = company(w, ai).cash;
    const rep = company(w, ai).reputation;
    expect(cancelOverdue(w, ai, d.id).ok).toBe(false); // only the buyer
    expect(cancelOverdue(w, me, d.id).ok).toBe(true);
    const comp = Math.round(5000 * 20 * CONFIG.orders.overdueCompensation);
    expect(comp).toBe(20_000);
    expect(d.status).toBe('cancelled');
    expect(well.reserved.oil).toBe(0);
    expect(company(w, me).cash).toBe(mine + comp);
    expect(company(w, ai).cash).toBe(theirs - comp);
    expect(company(w, ai).reputation).toBeLessThan(rep);
  });

  it('ohne Zutun: 30 Tage nach der Frist storniert', () => {
    const { w, d } = setup();
    expect(CONFIG.orders.overdueCancelDays).toBe(30);
    d.deadlineDay = w.day - 29;
    step(w); // 30 days over: not yet
    expect(d.status).toBe('accepted');
    step(w);
    expect(d.status).toBe('cancelled');
  });

  it('Ware schon unterwegs: kein Storno', () => {
    const { w, me, ai, d } = setup();
    d.deadlineDay = w.day - 1;
    w.transports.push({ id: 't-x', kind: 'goods', issuer: ai, carrier: ai, demand: d.id, good: 'oil', cargo: 'tank', amount: 5000, fromPlanet: 'vesta-nova', toPlanet: 'pyros', fromFacility: 'f-oilwell-c-ai', toFacility: null, fee: 0, own: true, status: 'loaded', ship: null, deadlineDay: d.deadlineDay, late: false, createdDay: 0 } as never);
    expect(cancelOverdue(w, me, d.id)).toEqual({ ok: false, error: expect.stringContaining('unterwegs') });
  });
});

import { ordersView } from '../src/ui/views';

describe('Überfällige Lieferung in der Oberfläche', () => {
  it('zeigt „Frist überzogen“, den Tag der automatischen Stornierung und den Knopf', () => {
    const { w, me, d } = setup();
    const view = () => ordersView({ w, me } as Parameters<typeof ordersView>[0]);
    expect(view()).not.toContain('cancel-overdue');
    d.deadlineDay = w.day - 10;
    const html = view();
    expect(html).toContain('Frist überzogen');
    expect(html).toContain('automatisch storniert in 21 Tagen');
    expect(html).toContain('data-act="cancel-overdue"');
    expect(html).toContain('20.000 Cr Entschädigung');
  });
});
