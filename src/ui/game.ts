// Phase-1 game page: one human company against 3 AI companies, plain list UI for the tablet.
// Rendering is plain HTML strings; every button carries data-act and is handled in ACTS below.

import {
  assignShip,
  buyFacility,
  buyShip,
  cancelDemand,
  cancelTransport,
  company,
  debt,
  facilityDef,
  repairFacility,
  repairShip,
  scrapFacility,
  sellShip,
  sendShipToTerra,
  shipDef,
  startFacility,
  step,
  stopFacility,
  type Difficulty,
  type Result,
  type World,
} from '../sim/index';
import { cr, esc, logText } from './format';
import { guide, newGame, type GuideTab } from './play';
import { clearSave, loadGame, saveGame } from './save';
import * as S from './sheets';
import * as V from './views';

type Tab = GuideTab;

const TABS: { id: Tab; label: string; icon: string; badge?: keyof ReturnType<typeof V.badges> }[] = [
  { id: 'terra', label: 'Terra', icon: '◉' },
  { id: 'facilities', label: 'Anlagen', icon: '⚙', badge: 'facilities' },
  { id: 'fleet', label: 'Flotte', icon: '➤', badge: 'fleet' },
  { id: 'market', label: 'Börse', icon: '⇄', badge: 'market' },
  { id: 'orders', label: 'Aufträge', icon: '☰', badge: 'orders' },
  { id: 'stats', label: 'Statistik', icon: '▤' },
];

const VIEWS: Record<Tab, (ctx: V.ViewCtx) => string> = {
  terra: V.terraView,
  facilities: V.facilitiesView,
  fleet: V.fleetView,
  market: V.marketView,
  orders: V.ordersView,
  stats: V.statsView,
};

/** Game days per real second at 1×, 2×, 4×. */
const DAYS_PER_SECOND: Record<number, number> = { 1: 0.5, 2: 1, 4: 2 };

const DIFFICULTIES: { id: Difficulty; name: string; text: string }[] = [
  { id: 'easy', name: 'Leicht', text: 'günstigere Kredite, lange Fristen, die KI reagiert langsam' },
  { id: 'med', name: 'Mittel', text: 'normale Kredite und Fristen' },
  { id: 'hard', name: 'Schwer', text: 'teurere Kredite, knappe Fristen, schnelle KI' },
  { id: 'prof', name: 'Profi', text: 'kleiner Kreditrahmen, höchste Zinsen, sehr schnelle KI' },
];

// ---------- state ----------

let w: World | null = null;
let me = '';
let tab: Tab = 'terra';
let speed = 0;
let guideHidden = false;
let marketAll = false;
let sheet: S.Sheet | null = null;
let gameOverShown = false;
const priceHistory: Record<string, number>[] = [];
let pointerDown = false;
let dirty = false;

const $ = (id: string) => document.getElementById(id)!;

// ---------- start screen ----------

function showStart() {
  w = null;
  speed = 0;
  closeSheet();
  $('game').hidden = true;
  const start = $('start');
  start.hidden = false;
  const save = loadGame();
  const saved = save ? company(save.world, save.world.playerId!) : null;
  start.innerHTML = `
    <div class="start-card">
      <h1>Dynacorp 2092</h1>
      <p class="sub">Weltraum-Wirtschaftsspiel · inspiriert von Dynatech (1992)</p>
      ${save && saved && !saved.bankrupt && !save.world.collapsed ? `<button class="primary big" data-act="continue">Weiterspielen – ${esc(saved.name)}, Tag ${save.world.day}</button>` : ''}
      <form id="new-game">
        <h2>Neues Spiel</h2>
        <label class="field">Name deiner Firma <input name="name" maxlength="28" value="${esc(saved?.name ?? 'Meine Firma')}" autocomplete="off"></label>
        <div class="opts">${DIFFICULTIES.map(
          (d) => `<label class="opt"><input type="radio" name="diff" value="${d.id}" ${d.id === 'med' ? 'checked' : ''}><span><b>${d.name}</b> – ${d.text}</span></label>`,
        ).join('')}</div>
        <button type="submit" class="primary big">Spiel starten</button>
      </form>
      <p class="small muted">Du spielst gegen 3 KI-Firmen. Das Spiel beginnt pausiert; ein Hinweiskasten führt dich durch die ersten Schritte. Der Spielstand wird automatisch gespeichert.</p>
      <p class="small"><a href="./observe.html">Beobachtungsmodus: 20 KI-Firmen spielen allein</a></p>
    </div>`;
  start.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    if (save && !confirm('Der gespeicherte Spielstand wird dabei überschrieben. Neues Spiel starten?')) return;
    begin(newGame(String(data.get('name') ?? ''), String(data.get('diff') ?? 'med') as Difficulty, Date.now() % 1_000_000), false);
  });
}

function begin(world: World, hideGuide: boolean) {
  w = world;
  me = world.playerId!;
  guideHidden = hideGuide;
  tab = hideGuide ? 'stats' : guide(w, me).tab;
  speed = 0;
  gameOverShown = false;
  priceHistory.length = 0;
  $('start').hidden = true;
  $('game').hidden = false;
  persist();
  render();
}

// ---------- rendering ----------

function priceTrend(goodId: string): -1 | 0 | 1 {
  const old = priceHistory[0]?.[goodId];
  const now = w!.prices[goodId];
  if (old === undefined || now === undefined) return 0;
  if (now > old * 1.01) return 1;
  if (now < old * 0.99) return -1;
  return 0;
}

function render() {
  if (!w) return;
  dirty = false;
  const c = company(w, me);
  $('firm').textContent = c.name;
  $('day').textContent = `Tag ${w.day}`;
  $('cash').textContent = cr(c.cash);
  $('cash').className = c.cash < 0 ? 'bad' : '';
  $('debt').textContent = cr(debt(w, me));
  document.querySelectorAll<HTMLButtonElement>('[data-act="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.a) === speed));

  const news = w.log.filter((l) => l.company === me || l.priority === 3).slice(-1)[0];
  $('ticker').innerHTML = news ? `<span class="muted">Tag ${news.day}</span> ${logText(news.text)}` : '<span class="muted">Noch keine Meldungen.</span>';

  const step = guide(w, me);
  const g = $('guide');
  g.hidden = guideHidden;
  if (!guideHidden) {
    const waitBtn = step.wait && speed === 0 ? `<button class="primary" data-act="speed" data-a="1">▶ Zeit laufen lassen</button>` : '';
    const showBtn = !step.wait && step.target ? `<button class="primary" data-act="guide-go">Zeigen</button>` : '';
    const doneBtn = step.id === 'done' ? `<button data-act="guide-hide">Hilfe ausblenden</button>` : `<button class="ghost" data-act="guide-hide">Ausblenden</button>`;
    g.innerHTML = `<div class="guide-card ${step.id === 'done' ? 'done' : ''}"><span class="label">${step.id === 'done' ? 'Geschafft' : 'Nächster Schritt'}</span>
      <h2>${esc(step.title)}</h2><p>${esc(step.text)}</p><div class="acts">${showBtn}${waitBtn}${doneBtn}</div></div>`;
  }
  $('help').hidden = !guideHidden;

  const b = V.badges(w, me);
  $('nav').innerHTML = TABS.map((t) => {
    const n = t.badge ? b[t.badge] : 0;
    const hot = !guideHidden && step.tab === t.id && t.id !== tab;
    return `<button data-act="tab" data-a="${t.id}" class="${t.id === tab ? 'on' : ''} ${hot ? 'hot' : ''}"><span class="ic">${t.icon}</span>${t.label}${n ? `<span class="count ${t.badge === 'fleet' ? 'soft' : ''}">${n}</span>` : ''}</button>`;
  }).join('');

  $('view').innerHTML = VIEWS[tab]({ w, me, marketAll, priceTrend });

  // the header is not re-rendered, so clear old highlights before setting the current one
  document.querySelectorAll('.pulse').forEach((el) => el.classList.remove('pulse'));
  if (!guideHidden && step.target) {
    document.querySelectorAll(`[data-guide="${step.target}"]`).forEach((el) => el.classList.add('pulse'));
  }
  checkGameOver();
}

function checkGameOver() {
  if (!w || gameOverShown) return;
  const c = company(w, me);
  if (!c.bankrupt && !w.collapsed) return;
  gameOverShown = true;
  speed = 0;
  clearSave();
  openSheet({
    title: c.bankrupt ? 'Konkurs' : 'Wirtschaftskrise',
    body: c.bankrupt
      ? `<p>${esc(c.name)} ist am Tag ${w.day} bankrott gegangen. Das Barkapital lag unter dem Limit der Bank.</p>`
      : `<p>Die Wirtschaft ist am Tag ${w.day} zusammengebrochen.</p>`,
    confirm: 'Neues Spiel',
    run: () => {
      showStart();
      return {};
    },
  });
}

// ---------- time ----------

let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (w && speed > 0 && !gameOverShown) {
    acc += dt * DAYS_PER_SECOND[speed]!;
    if (acc >= 1) {
      acc -= 1;
      advance();
    }
  }
  requestAnimationFrame(frame);
}

function advance() {
  if (!w) return;
  priceHistory.push({ ...w.prices });
  if (priceHistory.length > 6) priceHistory.shift();
  step(w);
  persist();
  // don't swap the buttons away under a finger that is just tapping
  if (pointerDown) dirty = true;
  else render();
}

function persist() {
  if (w && !gameOverShown) saveGame({ version: 1, world: w, guideHidden });
}

// ---------- sheets and toasts ----------

function openSheet(s: S.Sheet) {
  sheet = s;
  const el = $('sheet');
  el.innerHTML = `<form class="sheet-card" novalidate>
    <h2>${s.title}</h2><div class="sheet-body">${s.body}</div>
    <p class="sheet-error bad" hidden></p>
    <div class="acts end"><button type="button" class="ghost" data-act="sheet-close">${s.run ? 'Abbrechen' : 'Schließen'}</button>${s.run ? `<button type="submit" class="primary">${s.confirm ?? 'OK'}</button>` : ''}</div>
  </form>`;
  el.hidden = false;
  const form = el.querySelector('form')!;
  if (s.live) {
    s.live(form);
    form.addEventListener('input', () => s.live!(form));
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!s.run) return;
    const r = s.run(form);
    if (r.error) {
      const err = form.querySelector<HTMLElement>('.sheet-error')!;
      err.textContent = r.error;
      err.hidden = false;
      return;
    }
    if (r.message) toast(r.message);
    if (r.next) openSheet(r.next);
    else if (sheet === s) closeSheet();
    persist();
    render();
  });
}

function closeSheet() {
  sheet = null;
  const el = $('sheet');
  el.hidden = true;
  el.innerHTML = '';
}

let toastTimer = 0;
function toast(text: string, bad = false) {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast ${bad ? 'bad' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), bad ? 4500 : 2500);
}

function result(r: Result<unknown>, message: string) {
  if (r.ok) toast(message);
  else toast(r.error, true);
  persist();
  render();
}

// ---------- actions ----------

const ACTS: Record<string, (a: string) => void> = {
  tab(a) {
    tab = a as Tab;
    render();
    window.scrollTo({ top: 0 });
  },
  speed(a) {
    speed = Number(a);
    acc = speed ? 1 : 0; // the first day passes right away, so ▶ visibly does something
    render();
  },
  'step-day'() {
    speed = 0;
    advance();
    render();
  },
  'guide-go'() {
    const step = guide(w!, me);
    tab = step.tab;
    render();
    const el = step.target ? document.querySelector(`[data-guide="${step.target}"]`) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  'guide-hide'() {
    guideHidden = true;
    persist();
    render();
  },
  'guide-show'() {
    guideHidden = false;
    persist();
    render();
  },
  'market-all'(a) {
    marketAll = a === '1';
    render();
  },
  menu() {
    openSheet({
      title: 'Menü',
      body: `<p>Das Spiel wird automatisch gespeichert.</p><div class="acts col">
        <button type="button" data-act="guide-show">Hilfe einblenden</button>
        <button type="button" data-act="to-start">Zum Startbildschirm</button></div>`,
    });
  },
  'to-start'() {
    persist();
    showStart();
  },
  continue() {
    const save = loadGame();
    if (save) begin(save.world, save.guideHidden);
  },
  'sheet-close'() {
    closeSheet();
  },

  // Terra
  loan: () => openSheet(S.loanSheet(w!, me)),
  repay: (id) => openSheet(S.repaySheet(w!, me, id)),
  'buy-facility'(a) {
    const [type, planet] = a.split('|') as [string, string];
    const r = buyFacility(w!, me, type, planet);
    if (!r.ok) return result(r, '');
    toast(`${facilityDef(type).name} gekauft. Jetzt muss sie noch hingeflogen werden.`);
    openSheet(S.moveSheet(w!, me, r.value.id));
    persist();
    render();
  },
  'buy-ship'(model) {
    result(buyShip(w!, me, model), `${shipDef(model).name} gekauft – er wartet auf Terra.`);
  },

  // facilities
  move: (id) => openSheet(S.moveSheet(w!, me, id)),
  unrelease: (id) => result(cancelTransport(w!, me, id), 'Ausschreibung zurückgezogen.'),
  start: (id) => result(startFacility(w!, me, id), 'Die Anlage läuft.'),
  stop: (id) => result(stopFacility(w!, me, id), 'Die Anlage ist stillgelegt.'),
  'repair-facility': (id) => result(repairFacility(w!, me, id), 'Ein DYNATECH-Wartungsschiff hat die Anlage repariert.'),
  scrap(id) {
    if (confirm('Anlage wirklich verschrotten? Das lässt sich nicht rückgängig machen.')) result(scrapFacility(w!, me, id), 'Verschrottet.');
  },
  order: (id) => openSheet(S.orderSheet(w!, me, id)),

  // fleet
  assign(a) {
    const [s, t] = a.split('|') as [string, string];
    result(assignShip(w!, me, s, t), 'Das Schiff ist unterwegs.');
  },
  'to-terra': (id) => result(sendShipToTerra(w!, me, id), 'Das Schiff fliegt nach Terra.'),
  'repair-ship': (id) => result(repairShip(w!, me, id), 'Das Schiff ist in der Werft.'),
  'sell-ship'(id) {
    if (!confirm('Schiff wirklich verkaufen?')) return;
    const r = sellShip(w!, me, id);
    result(r, r.ok ? `Verkauft für ${cr(r.value)}.` : '');
  },

  // market and orders
  deliver: (id) => openSheet(S.deliverSheet(w!, me, id)),
  carry: (id) => openSheet(S.carrySheet(w!, me, id)),
  arrange: (id) => openSheet(S.arrangeSheet(w!, me, id)),
  'cancel-demand': (id) => result(cancelDemand(w!, me, id), 'Nachfrage storniert.'),
};

// sheet buttons that switch state should also close the sheet
const CLOSES_SHEET = new Set(['guide-show', 'to-start']);

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.id === 'sheet') return closeSheet(); // tap on the dimmed background
  const el = target.closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = ACTS[el.dataset.act!];
  if (!act) return;
  const needsWorld = !['continue', 'sheet-close'].includes(el.dataset.act!);
  if (needsWorld && !w) return;
  if (CLOSES_SHEET.has(el.dataset.act!)) closeSheet();
  act(el.dataset.a ?? '');
});

document.addEventListener('pointerdown', () => (pointerDown = true), true);
const release = () => {
  pointerDown = false;
  if (dirty) setTimeout(() => dirty && render(), 80);
};
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);
document.addEventListener('visibilitychange', () => document.hidden && persist());

showStart();
requestAnimationFrame(frame);
