// Gate of Phase 1: the manual's example (loan → oil well → freighter → first order) can be played
// against 3 AI companies by following only the in-game guide, using the same moves as the UI.
import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  company,
  creditLimit,
  facilitiesOf,
  run,
  startFacility,
  step,
  takeLoan,
  buyFacility,
  type World,
} from '../src/sim/index';
import {
  AI_DEFAULT,
  AI_MAX,
  AI_MIN,
  deliver,
  deliverableDemands,
  defaultChoice,
  guide,
  moveTransport,
  newGame,
  pendingAssets,
} from '../src/ui/play';
import { runUntil } from './helpers';

function playManualExample(seed: number, ai = AI_DEFAULT) {
  const w = newGame('Testfirma', 'med', seed, ai);
  const me = w.playerId!;
  const seen: string[] = [];
  const note = () => {
    const id = guide(w, me).id;
    if (seen[seen.length - 1] !== id) seen.push(id);
    return id;
  };

  expect(note()).toBe('loan');
  const term = CONFIG.credit.terms.length - 1;
  expect(takeLoan(w, me, creditLimit(w, me), term).ok).toBe(true);

  expect(note()).toBe('facility');
  const bought = buyFacility(w, me, 'oilwell', 'vesta-nova');
  if (!bought.ok) throw new Error(bought.error);

  expect(note()).toBe('asset-transport');
  const t = pendingAssets(w, me)[0]!.transport!;
  const choice = defaultChoice(w, me, t.cargo, t.amount, t.fromPlanet);
  expect(choice).toBe('buy:piece-a');
  const moved = moveTransport(w, me, t.id, choice);
  if (!moved.ok) throw new Error(moved.error);

  expect(note()).toBe('wait-flight');
  runUntil(w, () => note() !== 'wait-flight', 30);
  expect(note()).toBe('wait-build');
  runUntil(w, () => note() !== 'wait-build', 10);
  expect(note()).toBe('start');
  const well = facilitiesOf(w, me)[0]!;
  expect(startFacility(w, me, well.id).ok).toBe(true);

  // wait for stock and a matching demand, then deliver with a newly bought tanker
  runUntil(w, () => note() === 'deliver', 150);
  const option = deliverableDemands(w, me).find((o) => o.ready)!;
  const how = defaultChoice(w, me, 'tank', option.d.amount, well.planet);
  const done = deliver(w, me, option.d.id, option.facilities[0]!.id, how);
  if (!done.ok) throw new Error(done.error);

  expect(note()).toBe('wait-delivery');
  runUntil(w, () => note() === 'done', 60);
  return { w, me, seen };
}

describe('Phase 1: Handbuch-Beispiel gegen KI-Firmen', () => {
  const cases: [number, number][] = [
    [1, AI_DEFAULT],
    [2, AI_DEFAULT],
    [3, AI_DEFAULT],
    [4, AI_MIN],
    [5, AI_MAX],
  ];
  it.each(cases)('Seed %i, %i Gegner: die Anleitung im Spiel führt bis zum ersten bezahlten Auftrag', (seed, ai) => {
    const { w, me, seen } = playManualExample(seed, ai);
    expect(w.companies.filter((c) => !c.isPlayer)).toHaveLength(ai);
    expect(company(w, me).revenue).toBeGreaterThan(0);
    expect(company(w, me).bankrupt).toBe(false);
    expect(seen.slice(0, 7)).toEqual(['loan', 'facility', 'asset-transport', 'wait-flight', 'wait-build', 'start', 'wait-stock']);
    expect(seen.slice(-3)).toEqual(['deliver', 'wait-delivery', 'done']);
    // the whole example should fit into the first ~2 months of play
    expect(w.day).toBeLessThan(80);
  });

  it('ein Spieler, der danach nichts mehr tut, geht nicht pleite und die Wirtschaft hält 200 Tage', () => {
    const { w, me } = playManualExample(4);
    run(w, 200 - w.day);
    expect(w.collapsed).toBe(false);
    expect(company(w, me).bankrupt).toBe(false);
  });

  it('die Gegnerzahl bleibt zwischen 1 und 20', () => {
    const count = (n: number) => newGame('Testfirma', 'med', 1, n).companies.filter((c) => !c.isPlayer).length;
    expect(count(0)).toBe(AI_MIN);
    expect(count(7)).toBe(7);
    expect(count(99)).toBe(AI_MAX);
    expect(newGame('Testfirma', 'med', 1).companies.filter((c) => !c.isPlayer)).toHaveLength(10);
  });
});

describe('Liefern vor voller Produktion', () => {
  it('die Börse bietet eine Nachfrage schon an, bevor die Ware da ist, und „Liefern“ klappt', () => {
    const { w, me } = playManualExample(7);
    const well = facilitiesOf(w, me)[0]!;
    w.demands.push({
      id: 'early', requester: 'terra', good: 'oil', amount: 15000, toPlanet: 'terra', toFacility: null, pricePerFe: 20,
      own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: w.day,
      deadlineDay: w.day + 40, late: false,
    });
    const o = deliverableDemands(w, me).find((x) => x.d.id === 'early')!;
    expect(o.ready).toBe(false);
    expect(o.tooBig).toBe(false);
    expect(o.daysToReady).toBeGreaterThan(0);
    const r = deliver(w, me, 'early', well.id, 'public');
    expect(r.ok).toBe(true);
  });
});

describe('Spielstand', () => {
  it('ein gespeicherter und geladener Spielstand läuft genauso weiter', () => {
    const a = newGame('Testfirma', 'hard', 9);
    run(a, 40);
    const b: World = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 40; i++) {
      step(a);
      step(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
