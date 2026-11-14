// Late deliveries: the penalty grows with every day late (difficulty rate + 2 % per day, at most 50 %),
// deducted from the payment on arrival.
import { describe, expect, it } from 'vitest';
import { CONFIG, acceptDemand, company, deliverDemandPart, run, type Demand } from '../src/sim/index';
import { latePenalty } from '../src/ui/play';
import { oilWellWithTanker, player, soloWorld, terraOilDemand } from './helpers';

function lateDelivery(daysLate: number) {
  const w = soloWorld(); // difficulty med: 10 %
  const me = player(w);
  const well = oilWellWithTanker(w);
  well.stock.oil = 20_000;
  w.demands = w.demands.filter((d) => d.good !== 'oil');
  const d: Demand = terraOilDemand(w, 10_000);
  const r = acceptDemand(w, me, d.id, well.id);
  if (!r.ok) throw new Error(r.error);
  d.deadlineDay = w.day - daysLate;
  const before = company(w, me).cash;
  deliverDemandPart(w, d, d.amount);
  return { paid: company(w, me).cash - before, value: 10_000 * d.pricePerFe, w, me, d };
}

describe('Strafen für Fristüberschreitung', () => {
  it('pünktlich: volle Bezahlung', () => {
    const { paid, value } = lateDelivery(0);
    expect(paid).toBe(Math.round(value));
  });

  it('1 Tag zu spät: 10 % Abzug, 6 Tage: 20 %, 40 Tage: höchstens 50 %', () => {
    expect(CONFIG.orders.latePenaltyPerDay).toBe(0.02);
    for (const [days, cut] of [[1, 0.1], [6, 0.2], [40, 0.5]] as const) {
      const { paid, value } = lateDelivery(days);
      expect(paid, `${days} Tage`).toBe(Math.round(value) - Math.round(Math.round(value) * cut));
    }
  });

  it('beim Reißen der Frist: Meldung und weniger Ruf, aber noch keine Zahlung', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const d = terraOilDemand(w, 10_000);
    expect(acceptDemand(w, me, d.id, well.id).ok).toBe(true);
    d.deadlineDay = w.day;
    const rep = company(w, me).reputation;
    const revenue = company(w, me).revenue;
    const expenses = company(w, me).expenses;
    run(w, 1);
    expect(d.late).toBe(true);
    expect(company(w, me).reputation).toBe(rep - 3);
    expect(company(w, me).revenue).toBe(revenue);
    expect(w.log.some((l) => l.company === me && l.text.includes('Frist'))).toBe(true);
    // what a day costs otherwise (maintenance etc.) is not a penalty: no payment to Terra was booked
    expect(company(w, me).expenses - expenses).toBeLessThan(Math.round(10_000 * d.pricePerFe * 0.1));
  });

  it('der Dialog nennt die Strafe am ersten Tag', () => {
    const { w, d } = lateDelivery(0);
    expect(latePenalty(w, d)).toBe(Math.round(d.amount * (w.prices.oil ?? 0) * 0.1));
  });
});
