// The game page: one human company against 1–20 AI companies. Tabs with lists, a star map (side column on a
// tablet in landscape, its own tab otherwise), a chain graph, notifications, long-press help and ten save slots.
// Rendering is plain HTML strings; every button carries data-act and is handled in ACTS below.

import {
  assignShip,
  automationName,
  buyAutomation,
  removeRoute,
  setRouteActive,
  buyFacility,
  buyShip,
  cancelDemand,
  abortProject,
  cancelTransport,
  company,
  ensureQuark,
  good,
  projectDef,
  repairShipOnSite,
  startProject,
  unitOf,
  debt,
  facilityDef,
  repairFacility,
  repairShip,
  scrapFacility,
  sellShip,
  sendShipToTerra,
  setRepairAtTerra,
  shipDef,
  startFacility,
  step,
  stopFacility,
  type Difficulty,
  type Result,
  type World,
} from '../sim/index';
import { cueTracker, type Cue, type CueTracker } from './cues';
import { cr, esc, isCriticalShip, logText, num } from './format';
import { icon, type IconName } from './icons';
import { AI_DEFAULT, AI_MAX, AI_MIN, areaStats, clampAi, ensureStories, fittingOffers, guide, newGame, newOffers, startedStories, type GuideTab } from './play';
import { clearSave, loadGame, saveGame, type SaveData } from './save';
import { enableDrag } from './drag';
import { emptyOrder, parseOrder, reorderVisible, type ListOrder } from './order';
import { SLOT_COUNT, deleteSlot, listSlots, loadSlot, saveSlot, type SlotMeta } from './slots';
import { createStarMap } from './starmap';
import * as S from './sheets';
import { mapEvents } from './mapfx';
import { musicSettings, nowPlaying, setMusicSettings, skipTrack, startMusic, trackCredit } from './music';
import { CUE_INFO, play, playDay, preview, setSoundSettings, soundSettings, unlockSound } from './sound';
import * as V from './views';

type Tab = GuideTab | 'map';

const TABS: { id: Tab; label: string; icon: IconName; tip: string; badge?: keyof ReturnType<typeof V.badges> }[] = [
  { id: 'terra', label: 'Terra', icon: 'terra', tip: 'Bank (Kredite), Dynacore (Anlagen und Lager kaufen) und Werft (Schiffe kaufen).' },
  { id: 'map', label: 'Karte', icon: 'map', tip: 'Sternkarte mit allen Planeten, deinen Anlagen und Schiffen.' },
  { id: 'facilities', label: 'Anlagen', icon: 'facilities', badge: 'facilities', tip: 'Deine Anlagen: Lager, Betrieb, Ware bestellen, Lager erweitern. Die Zahl zählt stillgelegte Anlagen und wartende Transporte.' },
  { id: 'fleet', label: 'Flotte', icon: 'fleet', badge: 'fleet', tip: 'Deine Schiffe: zuweisen, nach Terra schicken, reparieren. Die Zahl zählt freie Schiffe.' },
  { id: 'market', label: 'Börse', icon: 'market', badge: 'market', tip: 'Nachfragen nach deinen Waren und Transportaufträge anderer Firmen. Blinkt, wenn ein neuer Auftrag zu einem freien Schiff passt.' },
  { id: 'orders', label: 'Aufträge', icon: 'orders', badge: 'orders', tip: 'Was du zugesagt hast und was unterwegs ist. Die Zahl zählt Aufträge, denen noch ein Transport fehlt.' },
  { id: 'stats', label: 'Statistik', icon: 'stats', tip: 'Warenketten, Rangliste, Kurse und alle Meldungen.' },
];

const isArea = (t: Tab): t is V.Area => (V.AREAS as readonly string[]).includes(t);

const VIEWS: Record<Tab, (ctx: V.ViewCtx) => string> = {
  terra: V.terraView,
  map: () => '<div id="map-slot" class="map-slot"></div>',
  facilities: V.facilitiesView,
  fleet: V.fleetView,
  market: V.marketView,
  orders: V.ordersView,
  stats: V.statsView,
};

/** Game days per real second at 1×, 2×, 4×: 1× is one day every 6 seconds. */
const DAYS_PER_SECOND: Record<number, number> = { 1: 1 / 6, 2: 2 / 6, 4: 4 / 6 };

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
/** the player's own order of facilities and cargo groups, saved with the game */
let listOrder: ListOrder = emptyOrder();
let marketAll = false;
let marketGood = '';
let marketSort: V.MarketSort = 'ready';
let chainGood = '';
/** offers the player was already told about; new fitting ones make the exchange tab blink */
const seenOffers = new Set<string>();
let marketAlert = 0;
/** finds the sound cues of each game day */
let cues: CueTracker | null = null;
const map = createStarMap();
/** tablet in landscape: the map sits in the side column next to the lists */
const wide = window.matchMedia('(min-width: 1100px) and (orientation: landscape)');
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
        <div class="field">Gegner: <output name="aiOut">${AI_DEFAULT} KI-Firmen</output>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Ein Gegner weniger">−</button>
            <input type="range" name="ai" min="${AI_MIN}" max="${AI_MAX}" step="1" value="${AI_DEFAULT}" aria-label="Anzahl der KI-Firmen">
            <button type="button" data-step="1" aria-label="Ein Gegner mehr">+</button>
          </div>
          <span class="small muted">${AI_MIN} bis ${AI_MAX}. Mehr Gegner heißt mehr Nachfrage und mehr Konkurrenz um Aufträge.</span>
        </div>
        <div class="field">Quark-Modus <span class="chip warn">Test</span>
          <div class="opts">
            <label class="opt"><input type="radio" name="quark" value="trend" checked><span><b>Trend</b> – alles, was deine Welt liefert, prägt ihr Quark; der Balken kann auch wieder sinken.</span></label>
            <label class="opt"><input type="radio" name="quark" value="project"><span><b>Projekt</b> – das laufende Großprojekt bestimmt das Quark; der Balken zeigt seinen Fortschritt.</span></label>
          </div></div>
        <label class="opt"><input type="checkbox" name="stories" checked><span><b>Ereignisse mit Geschichten</b><br><small>Booms, Krisen und Notlagen verändern zeitweise die Nachfrage. Jedes Spiel erzählt andere Geschichten.</small></span></label>
        <button type="submit" class="primary big">Spiel starten</button>
      </form>
      <p class="small muted">Das Spiel beginnt pausiert; ein Hinweiskasten führt dich durch die ersten Schritte. Der Spielstand wird automatisch gespeichert.</p>
      <button type="button" data-act="slots-load">Spielstand laden…</button>
      <p class="small"><a href="./observe.html">Beobachtungsmodus: 20 KI-Firmen spielen allein</a></p>
    </div>`;
  const form = start.querySelector('form')!;
  const ai = form.elements.namedItem('ai') as HTMLInputElement;
  const showAi = () => {
    const n = clampAi(Number(ai.value));
    (form.elements.namedItem('aiOut') as HTMLOutputElement).value = n === 1 ? '1 KI-Firma' : `${n} KI-Firmen`;
  };
  ai.addEventListener('input', showAi);
  form.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      ai.value = String(clampAi(Number(ai.value) + Number(b.dataset.step)));
      showAi();
    }),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (save && !confirm('Der gespeicherte Spielstand wird dabei überschrieben. Neues Spiel starten?')) return;
    const difficulty = String(data.get('diff') ?? 'med') as Difficulty;
    begin(newGame(String(data.get('name') ?? ''), difficulty, Date.now() % 1_000_000, clampAi(Number(data.get('ai'))), data.get('stories') === 'on', data.get('quark') === 'project' ? 'project' : 'trend'), false);
    openSheet(introSheet());
  });
}

function begin(world: World, hideGuide: boolean, order?: unknown) {
  ensureStories(world);
  ensureQuark(world);
  w = world;
  listOrder = parseOrder(order);
  me = world.playerId!;
  guideHidden = hideGuide;
  tab = hideGuide ? 'stats' : guide(w, me).tab;
  speed = 0;
  gameOverShown = false;
  priceHistory.length = 0;
  marketGood = '';
  marketSort = 'ready';
  chainGood = '';
  map.reset();
  map.select('');
  // what is on the exchange at the start is not news
  seenOffers.clear();
  for (const o of fittingOffers(world, me)) seenOffers.add(o.id);
  marketAlert = 0;
  cues = cueTracker(world, me);
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
  $('quark').innerHTML = V.quarkChip(w);
  document.querySelectorAll<HTMLButtonElement>('[data-act="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.a) === speed));

  const news = w.log.filter((l) => l.company === me || l.priority === 3).slice(-1)[0];
  $('ticker').innerHTML = news ? `<span class="muted">Tag ${news.day}</span> ${logText(news.text)}` : '<span class="muted">Noch keine Meldungen.</span>';

  const step = guide(w, me);
  const g = $('guide');
  g.hidden = guideHidden;
  $('game').classList.toggle('no-guide', guideHidden);
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
    const blink = t.id === 'market' && marketAlert > 0 && tab !== 'market';
    return `<button data-act="tab" data-a="${t.id}" data-tip="${esc(t.tip)}" ${isArea(t.id) ? `data-area="${t.id}" ` : ''}class="tab-${t.id} ${t.id === tab ? 'on' : ''} ${hot ? 'hot' : ''} ${blink ? 'blink' : ''}">${icon(t.icon)}${t.label}${n ? `<span class="count ${t.badge === 'fleet' ? 'soft' : ''}">${n}</span>` : ''}</button>`;
  }).join('');

  const view = $('view');
  if (isArea(tab)) view.dataset.area = tab;
  else delete view.dataset.area;
  view.innerHTML = (isArea(tab) ? V.areaHead(tab, areaStats(w, me)) : '') + VIEWS[tab]({ w, me, marketAll, marketGood, marketSort, priceTrend, chainGood, order: listOrder });
  placeMap();

  // the header is not re-rendered, so clear old highlights before setting the current one
  document.querySelectorAll('.pulse').forEach((el) => el.classList.remove('pulse'));
  if (!guideHidden && step.target) {
    document.querySelectorAll(`[data-guide="${step.target}"]`).forEach((el) => el.classList.add('pulse'));
  }
  // mouse users get the long-press help as a hover title
  document.querySelectorAll<HTMLElement>('[data-tip]:not([title])').forEach((el) => (el.title = el.dataset.tip!));
  checkGameOver();
}

/** Puts the one map element where it belongs: the Karte tab, the side column on wide screens, or nowhere. */
function placeMap() {
  const slot = document.getElementById('map-slot');
  const dock = $('map-dock');
  const host = slot ?? (wide.matches ? dock : null);
  dock.hidden = !wide.matches || !!slot;
  if (!host) {
    map.el.remove();
    return;
  }
  if (map.el.parentElement !== host) host.appendChild(map.el);
  map.draw(w!, me, acc, true, speed > 0);
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
let lastBlink = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (w && speed > 0 && !gameOverShown) {
    acc += dt * DAYS_PER_SECOND[speed]!;
    if (acc >= 1) {
      acc -= 1;
      advance();
    } else if (map.el.isConnected) map.draw(w, me, acc, false, true);
  } else if (w && map.el.isConnected) {
    // paused: let running effects end, keep critical ships blinking – otherwise don't redraw
    const blink = now - lastBlink > 175 && w.ships.some((s) => s.owner === me && isCriticalShip(s));
    if (map.busy() || blink) {
      if (blink) lastBlink = now;
      map.draw(w, me, acc);
    }
  }
  requestAnimationFrame(frame);
}

function advance() {
  if (!w) return;
  priceHistory.push({ ...w.prices });
  if (priceHistory.length > 6) priceHistory.shift();
  const finished = (w.projects ?? []).filter((p) => p.status === 'done').length;
  step(w);
  if ((w.projects ?? []).filter((p) => p.status === 'done').length > finished) play('automation');
  map.dayEvents(mapEvents(w, me));
  if (cues) playDay(cues.next(w));
  notifyOffers();
  const fresh = startedStories(w, w.day);
  if (fresh.length && !sheet) toast(`Neue Lage: ${fresh.map((e) => e.title).join(' · ')}`);
  persist();
  // don't swap the buttons away under a finger that is just tapping
  if (pointerDown) dirty = true;
  else render();
}

/** A new order at the exchange fits a free own ship: the tab blinks and a toast says what it is. */
function notifyOffers() {
  if (!w) return;
  const fresh = newOffers(w, me, seenOffers);
  for (const o of fresh) seenOffers.add(o.id);
  if (!fresh.length || tab === 'market') return;
  marketAlert += fresh.length;
  if (!sheet) toast(`Neu an der Börse: ${fresh[0]!.text}${fresh.length > 1 ? ` und ${fresh.length - 1} weitere` : ''}`);
}

function persist() {
  if (w && !gameOverShown) saveGame({ version: 1, world: w, guideHidden, order: listOrder });
}

// ---------- sheets and toasts ----------

function openSheet(s: S.Sheet) {
  sheet = s;
  const el = $('sheet');
  el.innerHTML = `<form class="sheet-card" novalidate>
    <h2>${s.title}</h2><div class="sheet-body">${s.body}</div>
    <p class="sheet-error bad" hidden></p>
    <div class="acts end"><button type="button" class="ghost" data-act="sheet-close">${s.run ? 'Abbrechen' : 'Schließen'}</button>${s.run ? `<button type="submit" class="primary">${s.confirm ?? 'OK'}</button>` : ''}${s.alt ? `<button type="submit" data-alt${s.alt.tip ? ` data-tip="${s.alt.tip}"` : ''}>${s.alt.label}</button>` : ''}</div>
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
    const alt = (e as SubmitEvent).submitter?.hasAttribute('data-alt') && s.alt;
    const r = alt ? alt.run(form) : s.run(form);
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

function result(r: Result<unknown>, message: string, cue?: Cue) {
  if (r.ok) {
    toast(message);
    if (cue) play(cue);
  }
  else toast(r.error, true);
  persist();
  render();
}

// ---------- actions ----------

const ACTS: Record<string, (a: string) => void> = {
  tab(a) {
    tab = a as Tab;
    if (tab === 'market') marketAlert = 0;
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
  'market-good'(a) {
    marketGood = a;
    render();
  },
  'market-sort'(a) {
    marketSort = a as V.MarketSort;
    render();
  },
  'chain-good'(a) {
    chainGood = chainGood === a ? '' : a;
    render();
  },
  'slots-save'() {
    void slotsSheet('save');
  },
  'slots-load'() {
    void slotsSheet('load');
  },
  'slot-save'(a) {
    const n = Number(a);
    const occupied = document.querySelector(`[data-slot="${n}"]`)?.getAttribute('data-used') === '1';
    if (occupied && !confirm(`Platz ${n} überschreiben?`)) return;
    const data: SaveData = { version: 1, world: w!, guideHidden, order: listOrder };
    saveSlot(n, data, company(w!, me).name)
      .then(() => {
        closeSheet();
        toast(`Gespeichert auf Platz ${n}.`);
      })
      .catch((e: Error) => toast(e.message || 'Speichern fehlgeschlagen.', true));
  },
  'slot-load'(a) {
    const n = Number(a);
    if (w && !confirm('Das laufende Spiel wird durch den Spielstand ersetzt (das Autosave bleibt bis dahin erhalten). Laden?')) return;
    loadSlot(n)
      .then((data) => {
        if (!data) return toast('Dieser Platz ist leer oder beschädigt.', true);
        closeSheet();
        begin(data.world, data.guideHidden, data.order);
        toast(`Platz ${n} geladen – Tag ${data.world.day}.`);
      })
      .catch((e: Error) => toast(e.message || 'Laden fehlgeschlagen.', true));
  },
  'slot-delete'(a) {
    const n = Number(a);
    if (!confirm(`Platz ${n} löschen?`)) return;
    deleteSlot(n)
      .then(() => slotsSheet(document.querySelector('[data-slots-mode="save"]') ? 'save' : 'load'))
      .catch((e: Error) => toast(e.message || 'Löschen fehlgeschlagen.', true));
  },
  menu() {
    openSheet({
      title: 'Menü',
      body: `<p>Das Spiel wird automatisch gespeichert. Dazu gibt es ${SLOT_COUNT} Speicherplätze für eigene Spielstände.</p><div class="acts col">
        <button type="button" data-act="slots-save">Spiel speichern…</button>
        <button type="button" data-act="slots-load">Spielstand laden…</button>
        <button type="button" data-act="sound">Musik und Töne…</button>
        <button type="button" data-act="guide-show">Hilfe einblenden</button>
        <button type="button" data-act="intro">Einführung zeigen</button>
        <button type="button" data-act="to-start">Zum Startbildschirm</button></div>`,
    });
  },
  intro() {
    openSheet(introSheet());
  },
  sound() {
    openSheet(soundSheet());
  },
  'sound-test'(cue) {
    preview(cue as Cue);
  },
  'music-next'() {
    skipTrack();
    openSheet(soundSheet());
  },
  'to-start'() {
    persist();
    showStart();
  },
  continue() {
    const save = loadGame();
    if (save) begin(save.world, save.guideHidden, save.order);
  },
  'sheet-close'() {
    closeSheet();
  },

  // Terra
  loan: () => openSheet(S.loanSheet(w!, me)),
  'project-start'(id) {
    const def = projectDef(id);
    openSheet({
      title: `Großprojekt ${def.name}`,
      body: `<p>Preis <b>${cr(def.price)}</b> aus Barkapital, dann bestellt die Baustelle im Orbit von Terra: ${Object.entries(def.materials).map(([g, n]) => `${num(n)} ${unitOf(g)} ${good(g).name}`).join(', ')}.</p>
        <p>Fertig bringt es <b>${num(def.prestige)} Prestige</b> im Firmenindex und: ${def.effect}</p>
        <p class="small muted">Aus eigenen Anlagen lieferst du kostenlos; liefert eine andere Firma, zahlst du den Marktpreis. Neue Bestellungen gehen nur raus, wenn dein Barkapital sie deckt.</p>`,
      confirm: 'Starten',
      run: () => {
        const r = startProject(w!, me, id);
        return r.ok ? { message: `${def.name}: Baustelle eröffnet.` } : { error: r.error };
      },
    });
  },
  'project-abort'() {
    if (!confirm('Großprojekt abbrechen? Bezahltes Geld und gelieferte Waren sind verloren.')) return;
    result(abortProject(w!, me), 'Großprojekt abgebrochen.');
  },
  'repair-onsite': (id) => result(repairShipOnSite(w!, me, id), 'Das Schiff wird vor Ort repariert.', 'repair'),
  'buy-automation'() {
    const r = buyAutomation(w!, me);
    result(r, r.ok ? `${automationName(r.value)} eröffnet!` : '', 'automation');
    // the first level comes with its first route right away
    if (r.ok && r.value === 1) openSheet(S.routeSheet(w!, me));
  },
  'route-new': () => openSheet(S.routeSheet(w!, me)),
  'route-service': (id) => openSheet(S.serviceSheet(w!, me, id)),
  'route-pause': (id) => result(setRouteActive(w!, me, id, false), 'Lieferroute pausiert – das Linienschiff ist frei.'),
  'route-resume': (id) => result(setRouteActive(w!, me, id, true), 'Lieferroute läuft wieder.'),
  'route-delete'(id) {
    if (!confirm('Lieferroute löschen? Eine laufende Fahrt wird noch zu Ende gebracht.')) return;
    result(removeRoute(w!, me, id), 'Lieferroute gelöscht.');
  },
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
  unrelease: (id) => result(cancelTransport(w!, me, id), 'Ausschreibung zurückgezogen – weise jetzt ein eigenes Schiff zu.'),
  start: (id) => result(startFacility(w!, me, id), 'Die Anlage läuft.'),
  stop: (id) => result(stopFacility(w!, me, id), 'Die Anlage ist stillgelegt.'),
  'repair-facility': (id) => result(repairFacility(w!, me, id), 'Ein Dynacore-Wartungsschiff hat die Anlage repariert.', 'repair'),
  scrap(id) {
    if (confirm('Anlage wirklich verschrotten? Das lässt sich nicht rückgängig machen.')) result(scrapFacility(w!, me, id), 'Verschrottet.');
  },
  order: (id) => openSheet(S.orderSheet(w!, me, id)),
  storage: (id) => openSheet(S.storageSheet(w!, me, id)),

  // fleet
  assign(a) {
    const [s, t] = a.split('|') as [string, string];
    result(assignShip(w!, me, s, t), 'Das Schiff ist unterwegs.');
  },
  'to-terra': (id) => result(sendShipToTerra(w!, me, id), 'Das Schiff fliegt nach Terra.'),
  'repair-ship': (id) => result(repairShip(w!, me, id), 'Das Schiff ist in der Werft.', 'repair'),
  'repair-mark'(a) {
    const [id, on] = a.split('|') as [string, string];
    const r = setRepairAtTerra(w!, me, id, on === '1');
    result(r, r.ok ? { now: 'Das Schiff ist in der Werft.', marked: 'Reparatur vorgemerkt – beim nächsten Stopp auf Terra.', off: 'Vormerkung aufgehoben.' }[r.value] : '', r.ok && r.value !== 'off' ? 'repair' : undefined);
  },
  'repair-trip'(id) {
    const r = sendShipToTerra(w!, me, id);
    if (r.ok) setRepairAtTerra(w!, me, id, true);
    result(r, 'Das Schiff fliegt zur Reparatur nach Terra.', 'repair');
  },
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
const CLOSES_SHEET = new Set(['guide-show', 'guide-hide', 'to-start', 'intro']);
/** actions that also work on the start screen, without a running game */
const NO_WORLD = new Set(['sound', 'sound-test', 'music-next', 'continue', 'sheet-close', 'slots-load', 'slot-load', 'slot-delete']);

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.id === 'sheet') return closeSheet(); // tap on the dimmed background
  const el = target.closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = ACTS[el.dataset.act!];
  if (!act) return;
  if (!NO_WORLD.has(el.dataset.act!) && !w) return;
  // 'intro' opens a new sheet itself, so the menu sheet must close first
  if (CLOSES_SHEET.has(el.dataset.act!)) closeSheet();
  act(el.dataset.a ?? '');
});

document.addEventListener(
  'pointerdown',
  () => {
    pointerDown = true;
    // browsers allow sound only after a tap
    unlockSound();
    startMusic();
  },
  true,
);
const release = () => {
  pointerDown = false;
  if (dirty) setTimeout(() => dirty && render(), 80);
};
document.addEventListener('pointerup', release, true);

// drag a facility card or a cargo group by its grip to another place
enableDrag($('view'), (kind, ids) => {
  if (kind === 'facility') listOrder = { ...listOrder, facilities: ids };
  else listOrder = { ...listOrder, cargo: reorderVisible(listOrder.cargo, ids as ListOrder['cargo']) };
  persist();
  render();
});
document.addEventListener('pointercancel', release, true);
document.addEventListener('visibilitychange', () => document.hidden && persist());

// ---------- sound settings ----------

/** Volume, on/off per cue and a listening test; changes apply and are saved right away. */
function soundSheet(): S.Sheet {
  const s = soundSettings();
  const rows = (Object.keys(CUE_INFO) as Cue[])
    .map(
      (c) => `<div class="sound-row"><label class="check"><input type="checkbox" name="cue-${c}" ${s.cues[c] ? 'checked' : ''}> <b>${CUE_INFO[c].name}</b></label>
      <button type="button" class="ghost" data-act="sound-test" data-a="${c}" aria-label="${CUE_INFO[c].name} anhören">▶ Anhören</button>
      <p class="muted">${CUE_INFO[c].text}</p></div>`,
    )
    .join('');
  const m = musicSettings();
  const track = nowPlaying();
  return {
    title: 'Musik und Töne',
    body: `<h3>Musik</h3>
      <label class="check"><input type="checkbox" name="music-on" ${m.on ? 'checked' : ''}> Musik an</label>
      <label class="field">Lautstärke Musik <input type="range" name="music-volume" min="0" max="100" step="5" value="${Math.round(m.volume * 100)}"></label>
      <div class="sound-row"><span class="muted">${esc(track ? trackCredit(track) : 'Musik: Thamanoidis')}</span>
      <button type="button" class="ghost" data-act="music-next">Nächstes Stück</button></div>
      <h3>Töne</h3>
      <label class="check"><input type="checkbox" name="on" ${s.on ? 'checked' : ''}> Töne an</label>
      <label class="field">Lautstärke Töne <input type="range" name="volume" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}"></label>
      <p class="muted">Dezente Töne für wenige, wichtige Ereignisse. Neue Börsenangebote bleiben still – nur seltene Großaufträge von Terra klingen. Bei hoher Geschwindigkeit werden Töne zusammengefasst.</p>
      <div class="sound-list">${rows}</div>`,
    live(form) {
      const data = new FormData(form);
      const next = { on: data.has('on'), volume: Number(data.get('volume') ?? 60) / 100, cues: { ...s.cues } };
      for (const c of Object.keys(CUE_INFO) as Cue[]) next.cues[c] = data.has(`cue-${c}`);
      setSoundSettings(next);
      setMusicSettings({ on: data.has('music-on'), volume: Number(data.get('music-volume') ?? 40) / 100 });
    },
  };
}

// ---------- intro and save slots ----------

function introSheet(): S.Sheet {
  return {
    title: 'Willkommen bei Dynacorp 2092',
    body: `<p>Die Erde ist ausgebeutet. Du kaufst bei Dynacore Förderanlagen und Fabriken, bringst sie mit Frachtern zu den Kolonien und verdienst an der Frachtbörse – ohne Kampf, mit Handel als Kern.</p>
      <ul class="plain">
        <li><b>Ziel:</b> den höchsten Firmenindex erreichen, ohne pleitezugehen.</li>
        <li><b>Zeit:</b> das Spiel beginnt pausiert. ▶ lässt die Tage laufen, ❚❚ hält an.</li>
        <li><b>Hilfe:</b> der Kasten „Nächster Schritt“ führt dich vom ersten Kredit bis zum ersten bezahlten Auftrag.</li>
        <li><b>Erklärungen:</b> halte einen Knopf oder Tab lange gedrückt – dann erscheint, was er tut.</li>
        <li><b>Karte:</b> Planeten, Anlagen und Schiffe. Tippe einen Planeten an für Details.</li>
      </ul>
      <div class="acts"><button type="button" data-act="guide-hide" class="ghost">Ohne Hilfe spielen</button></div>`,
    confirm: 'Mit Hilfe loslegen',
    run: () => {
      guideHidden = false;
      return {};
    },
  };
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

async function slotsSheet(mode: 'save' | 'load') {
  let list: (SlotMeta | null)[];
  try {
    list = await listSlots();
  } catch (e) {
    toast((e as Error).message || 'Speicher nicht verfügbar.', true);
    return;
  }
  const rows = list
    .map((m, i) => {
      const n = i + 1;
      const label = m ? `<b>${esc(m.firm)}</b> · Tag ${m.day}<div class="small muted">gespeichert ${dateFmt.format(m.savedAt)}</div>` : '<span class="muted">leer</span>';
      const main =
        mode === 'save'
          ? `<button type="button" class="primary" data-act="slot-save" data-a="${n}">Hier speichern</button>`
          : `<button type="button" class="primary" data-act="slot-load" data-a="${n}" ${m ? '' : 'disabled'}>Laden</button>`;
      const del = m ? `<button type="button" class="ghost" data-act="slot-delete" data-a="${n}" aria-label="Platz ${n} löschen">Löschen</button>` : '';
      return `<div class="row" data-slot="${n}" data-used="${m ? 1 : 0}"><div class="grow"><span class="muted">Platz ${n}</span> ${label}</div><div class="acts">${main}${del}</div></div>`;
    })
    .join('');
  openSheet({ title: mode === 'save' ? 'Spiel speichern' : 'Spielstand laden', body: `<div data-slots-mode="${mode}">${rows}</div>` });
}

// ---------- long press: explanation instead of action ----------

let tipTimer = 0;
let tipFrom: { x: number; y: number } | null = null;
let tipShown = false;

function showTip(el: HTMLElement) {
  const tip = $('tip');
  tip.textContent = el.dataset.tip!;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const above = r.top - t.height - 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${above > 8 ? above : r.bottom + 10}px`;
  navigator.vibrate?.(15);
}
const hideTip = () => ($('tip').hidden = true);

document.addEventListener(
  'pointerdown',
  (e) => {
    hideTip();
    tipShown = false;
    const el = (e.target as Element).closest<HTMLElement>('[data-tip]');
    if (!el || e.pointerType === 'mouse') return;
    tipFrom = { x: e.clientX, y: e.clientY };
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      tipShown = true;
      showTip(el);
    }, 550);
  },
  true,
);
document.addEventListener(
  'pointermove',
  (e) => {
    if (tipFrom && Math.hypot(e.clientX - tipFrom.x, e.clientY - tipFrom.y) > 10) clearTimeout(tipTimer);
  },
  true,
);
const endPress = () => {
  clearTimeout(tipTimer);
  tipFrom = null;
};
document.addEventListener('pointerup', endPress, true);
document.addEventListener('pointercancel', endPress, true);
// the finger lifted after a long press: show the explanation, don't run the button
document.addEventListener(
  'click',
  (e) => {
    if (!tipShown) return;
    tipShown = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
document.addEventListener('contextmenu', (e) => {
  if ((e.target as Element).closest('[data-tip]')) e.preventDefault();
});

wide.addEventListener('change', () => render());

showStart();
requestAnimationFrame(frame);
