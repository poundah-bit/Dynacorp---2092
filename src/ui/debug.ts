// Observation page (observe.html): runs the economy core with 20 AI companies and shows what happens.
// Not the game UI (see game.ts). Useful for checking balancing on the tablet.

import { FACILITIES, GOODS, createWorld, marketBalance, priceIndex, ranking, run, type World } from '../sim/index';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let w: World = createWorld({ seed: Date.now() % 100000 });
let timer: number | null = null;

function render() {
  $('day').textContent = `Tag ${w.day}`;
  const status = $('status');
  status.className = w.collapsed ? 'status bad' : 'status';
  const bankrupt = w.companies.filter((c) => c.bankrupt).length;
  status.textContent = w.collapsed
    ? 'Die Wirtschaft ist zusammengebrochen.'
    : `Preisindex ${fmt2.format(priceIndex(w))} · ${w.companies.length - bankrupt} von ${w.companies.length} Firmen aktiv · ${w.ships.length} Schiffe · ${w.demands.filter((d) => d.status === 'open').length} offene Nachfragen`;

  $('ranking').innerHTML =
    '<tr><th>#</th><th>Firma</th><th class="n">Index</th><th class="n">Bar (Cr)</th><th class="n">Schulden</th></tr>' +
    ranking(w)
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.name}${r.bankrupt ? ' ✝' : ''}</td><td class="n">${fmt.format(r.index)}</td><td class="n ${r.cash < 0 ? 'down' : ''}">${fmt.format(r.cash)}</td><td class="n">${fmt.format(r.debt)}</td></tr>`,
      )
      .join('');

  $('prices').innerHTML =
    '<tr><th>Ware</th><th class="n">Kurs</th><th class="n">Basis</th><th class="n">Angebot</th><th class="n">Nachfrage</th></tr>' +
    GOODS.map((g) => {
      const p = w.prices[g.id] ?? g.basePrice;
      const m = marketBalance(w, g.id);
      const cls = p > g.basePrice * 1.05 ? 'up' : p < g.basePrice * 0.95 ? 'down' : '';
      return `<tr><td>${g.name}</td><td class="n ${cls}">${fmt2.format(p)}</td><td class="n">${g.basePrice}</td><td class="n">${fmt.format(m.supply)}</td><td class="n">${fmt.format(m.demand)}</td></tr>`;
    }).join('');

  const units = (type: string) => w.facilities.filter((f) => f.type === type).reduce((s, f) => s + f.units, 0);
  $('facilities').innerHTML =
    '<tr><th>Anlage</th><th class="n">Einheiten</th></tr>' +
    FACILITIES.map((f) => `<tr><td>${f.name}</td><td class="n">${units(f.id)}</td></tr>`).join('');

  $('ticker').innerHTML = w.log
    .filter((l) => l.priority >= 2)
    .slice(-40)
    .reverse()
    .map((l) => `<li class="p${l.priority}"><span class="d">Tag ${l.day}</span>${l.text}</li>`)
    .join('');
}

document.querySelectorAll<HTMLButtonElement>('button[data-days]').forEach((b) =>
  b.addEventListener('click', () => {
    run(w, Number(b.dataset.days));
    render();
  }),
);

$('auto').addEventListener('click', () => {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
    $('auto').textContent = 'Auto ▶';
  } else {
    timer = window.setInterval(() => {
      run(w, 1);
      render();
      if (w.collapsed && timer !== null) clearInterval(timer);
    }, 250);
    $('auto').textContent = 'Pause ❚❚';
  }
});

$('reset').addEventListener('click', () => {
  w = createWorld({ seed: Date.now() % 100000 });
  render();
});

render();
