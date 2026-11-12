// Screenshots of the four area tabs (Anlagen, Flotte, Börse, Aufträge) on a tablet and a phone, for the
// visual check of the UI. Builds a game state with a critical ship, a stopped plant and an overdue order,
// puts it into the autosave and opens it in a local Chrome.
//   npx tsx tools/screens.ts [chrome-path]   → screens/*.png
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { acceptDemand, assignShip, buyFacility, buyShip, facilitiesOf, run, shipsOf, startFacility, takeLoan, type World } from '../src/sim/index';
import { newGame } from '../src/ui/play';

function scene(): World {
  const w = newGame('Testfirma', 'easy', 3, 3);
  const me = w.playerId!;
  const loan = takeLoan(w, me, 1_000_000, 2);
  if (!loan.ok) throw new Error(loan.error);
  const t = buyFacility(w, me, 'oilwell', 'vesta-nova');
  const s = buyShip(w, me, 'piece-a');
  if (!t.ok) throw new Error(t.error);
  if (!s.ok) throw new Error(s.error);
  assignShip(w, me, s.value.id, t.value.id);
  for (let i = 0; i < 60 && !facilitiesOf(w, me).some((f) => f.status === 'stopped'); i++) run(w, 1);
  const well = facilitiesOf(w, me)[0]!;
  startFacility(w, me, well.id);
  buyShip(w, me, 'tank-a');
  buyShip(w, me, 'tank-a');
  run(w, 25);
  const oil = w.demands.find((d) => d.status === 'open' && d.good === 'oil');
  if (oil) {
    acceptDemand(w, me, oil.id, well.id);
    oil.deadlineDay = w.day - 2; // overdue
  }
  const tanker = shipsOf(w, me).find((x) => x.model === 'tank-a');
  if (tanker) tanker.condition = 24; // critical
  const big = w.demands.find((d) => d.status === 'open' && d.requester === 'terra' && d.good === 'oil');
  if (big) big.big = true;
  return w;
}

const chrome = process.argv[2] ?? '/usr/bin/google-chrome';
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: chrome });
mkdirSync('screens', { recursive: true });
const save = JSON.stringify({ version: 1, world: scene(), guideHidden: true });
for (const [name, vp] of [['tablet', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  await page.addInitScript((s) => localStorage.setItem('dynacorp2092.save.v1', s), save);
  await page.goto('http://localhost:5199/');
  await page.click('[data-act="continue"]');
  if (name === 'tablet') {
    await page.locator('.map-card').screenshot({ path: 'screens/tablet-map.png' });
    await page.click('[data-zoom="1.4"]');
    await page.click('[data-zoom="1.4"]');
    await page.waitForTimeout(100);
    await page.locator('.map-card canvas').screenshot({ path: 'screens/tablet-map-zoom.png' });
    await page.click('[data-zoom="0"]');
  }
  for (const tab of [...(name === 'phone' ? ['map'] : []), 'facilities', 'fleet', 'market', 'orders']) {
    await page.click(`#nav [data-a="${tab}"]`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `screens/${name}-${tab}.png`, fullPage: name === 'phone' });
  }
  await page.close();
}
await browser.close();
await server.close();
