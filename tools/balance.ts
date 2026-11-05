// Phase-2 balancing report: npm run balance -- [days] [seeds] [difficulty]
// e.g. npm run balance -- 1000 1,2,3 med
// Checks the target values from docs/konzept.md ("Balancing-Zielwerte") against the data and headless runs.

import { FACILITIES, GOODS, createWorld, good, planet, step, type Difficulty } from '../src/sim/index';
import {
  TARGETS,
  basePrices,
  facilityEconomics,
  loanShare,
  median,
  shareWithin,
  statsCollector,
  storageShare,
  type FacilityEconomics,
  type RunStats,
} from '../src/sim/metrics';

const days = Number(process.argv[2] ?? 1000);
const seeds = String(process.argv[3] ?? '1,2,3').split(',').map(Number);
const difficulty = (process.argv[4] ?? 'med') as Difficulty;

const n0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('de-DE') : '∞');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const mark = (ok: boolean) => (ok ? '✓' : '✗');

// ---------- 1. runs ----------

const runs: RunStats[] = [];
const avgPrices: Record<string, number> = Object.fromEntries(GOODS.map((g) => [g.id, 0]));
let samples = 0;
for (const seed of seeds) {
  const w = createWorld({ seed, difficulty });
  const stats = statsCollector(w);
  for (let d = 0; d < days && !w.collapsed; d++) {
    step(w);
    stats.observe();
    if (w.day >= 100) {
      for (const g of GOODS) avgPrices[g.id]! += w.prices[g.id] ?? 0;
      samples++;
    }
  }
  runs.push(stats.result());
}
for (const g of GOODS) avgPrices[g.id] = samples ? avgPrices[g.id]! / samples : g.basePrice;

console.log(`Balancing-Bericht · ${days} Tage · Seeds ${seeds.join(', ')} · Schwierigkeit ${difficulty} · 20 KI-Firmen\n`);
console.log('Läufe');
for (const [i, r] of runs.entries()) {
  console.log(
    `  Seed ${seeds[i]}: ${r.collapsed ? 'KOLLAPS' : 'stabil'} · Bankrott ${r.bankrupt}/${r.companies} · Preisindex ${r.priceIndexMin.toFixed(2)}–${r.priceIndexMax.toFixed(2)} · Anlagenarten ${r.typesPresent}/17 · Einheiten roh ${r.unitsByTier.raw} / zwischen ${r.unitsByTier.intermediate} / end ${r.unitsByTier.final}`,
  );
}

// ---------- 2. targets ----------

const all = runs.flatMap((r) => r.transportDays);
const tWithin = shareWithin(all, TARGETS.transportDays);
console.log('\nZielwerte');
console.log(`  ${mark(tWithin >= 0.5)} Transportdauer 3–9 Tage: Median ${median(all)} Tage, ${pct(tWithin)} im Ziel (${all.length} Transporte)`);

const loans = loanShare(basePrices());
const worstLoan = Math.max(...loans.map((l) => l.share));
console.log(
  `  ${mark(worstLoan <= TARGETS.loanShareOfIncome)} Kreditrate ≤ 60 % der Tageseinnahmen (1 Mio. Cr, längste Laufzeit, Basiskurs): ${loans.map((l) => `${l.name} ${pct(l.share)}`).join(', ')}`,
);

const storages = storageShare();
const worstStorage = storages.reduce((a, b) => (b.share > a.share ? b : a));
console.log(
  `  ${mark(worstStorage.share <= TARGETS.storageShareOfCosts)} Lagerkosten < 5 % der Anlagenkosten: schlimmster Fall ${worstStorage.name} an ${worstStorage.facility} = ${pct(worstStorage.share)}; ${storages.filter((s) => s.share > TARGETS.storageShareOfCosts).length} von ${storages.length} Lagern darüber`,
);

function amortizationTable(title: string, econ: FacilityEconomics[]) {
  console.log(`\n${title}`);
  console.log('  Anlage                  Planet         Stufe   Marge/Tag  Fracht/Tag  Amortisation  Ziel');
  for (const e of econ) {
    const target = TARGETS.amortizationDays[e.tier];
    const ok = target ? e.amortizationDays >= target[0] && e.amortizationDays <= target[1] : e.margin > 0;
    const tierName = { raw: 'roh', intermediate: 'zwischen', final: 'end' }[e.tier];
    console.log(
      `  ${mark(ok)} ${e.name.padEnd(22)} ${planet(e.planet).name.padEnd(14)} ${tierName.padEnd(8)}${n0(e.margin).padStart(9)} ${n0(e.freight).padStart(11)} ${`${n0(e.amortizationDays)} Tage`.padStart(13)}  ${target ? `${target[0]}–${target[1]}` : '> 0 Marge'}`,
    );
  }
}

amortizationTable('Amortisation bei Basiskursen (eine Einheit, volle Auslastung, Fracht eingerechnet)', facilityEconomics(basePrices()));
amortizationTable('Amortisation bei den Durchschnittskursen der Läufe (ab Tag 100)', facilityEconomics(avgPrices));

const losers = facilityEconomics(basePrices()).filter((e) => e.margin <= 0);
console.log(`\n  ${mark(losers.length === 0)} Kein Planet mit Dauerverlust bei Basiskursen: ${losers.length ? losers.map((l) => `${l.name} (${planet(l.planet).name})`).join(', ') : 'keiner'}`);

// ---------- 3. what Terra gets ----------

console.log('\nEndprodukte an Terra geliefert (FE, Summe aller Läufe)');
for (const g of GOODS.filter((x) => x.tier === 'final')) {
  const fe = runs.reduce((s, r) => s + (r.terraDeliveries[g.id] ?? 0), 0);
  console.log(`  ${good(g.id).name.padEnd(14)} ${n0(fe).padStart(10)}  Ø-Kurs ${avgPrices[g.id]!.toFixed(0).padStart(5)} (Basis ${g.basePrice})`);
}
console.log(`\n${FACILITIES.length} Anlagenarten, Zielwerte siehe docs/konzept.md → „Balancing-Zielwerte“.`);
