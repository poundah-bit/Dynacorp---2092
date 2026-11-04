// Headless balancing run: npm run sim -- [days] [seed] [difficulty]
import { createWorld, run } from '../src/sim/index';
import { formatReport, report } from '../src/sim/report';
import type { Difficulty } from '../src/sim/types';

const days = Number(process.argv[2] ?? 200);
const seed = Number(process.argv[3] ?? 1);
const difficulty = (process.argv[4] ?? 'med') as Difficulty;

const w = createWorld({ seed, difficulty });
const checkpoints = [25, 50, 100, 150, 200, 300, 400].filter((d) => d < days);
for (const cp of checkpoints) {
  run(w, cp - w.day);
  const r = report(w);
  console.log(`Tag ${r.day}: Preisindex ${r.priceIndex}, Bankrott ${r.bankrupt}, Anlagen ${Object.values(r.facilitiesByType).reduce((a, b) => a + b, 0)}, Schiffe ${r.ships}, erledigte Nachfragen ${r.doneDemands}`);
}
run(w, days - w.day);
console.log('\n' + formatReport(report(w)));
