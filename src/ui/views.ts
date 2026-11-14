// HTML for the tabs (the Karte tab is the star map from starmap.ts). Buttons carry data-act (what to do) and data-guide (what the guide may highlight);
// the click handling lives in game.ts.

import {
  CONFIG,
  FACILITIES,
  GOODS,
  SHIPS,
  TERRA,
  available,
  canJoin,
  cargoName,
  company,
  companyValue,
  creditLimit,
  debt,
  distance,
  facilitiesOf,
  facilityDef,
  good,
  incoming,
  planetsFor,
  productionEfficiency,
  ranking,
  repairFacilityCost,
  repairShipCost,
  shipDef,
  shipLoads,
  shipRoom,
  shipSpeed,
  shipValue,
  shipsOf,
  storageCapacity,
  storageDef,
  type Cargo,
  type Ship,
  type Transport,
  type World,
} from '../sim/index';
import {
  areaStats,
  carryState,
  deliverableDemands,
  idleFittingShips,
  openTransports,
  pendingAssets,
  unshippedDemands,
  waitingTransports,
} from './play';
import { PROJECTS, QUARK_NAME, automationLevel, automationName, buildingProject, hasProject, lineRoute, nextAutomation, projectState, quarkStatus, routeLimit, routeName, serviceLimit, storyStrength, unitOf, unshippedAmount, type Flavour, type StoryEvent } from '../sim/index';
import { chainDetail, chainSvg } from './chain';
import {
  cr,
  days,
  dec,
  esc,
  facilityLabel,
  facilityStatus,
  fe,
  flows,
  gName,
  inDays,
  loadName,
  logText,
  num,
  pName,
  pc,
  shipLabel,
  shipStatus,
  who,
  deadlineIn,
  amt,
  cargoIcon,
  isCriticalShip,
  perUnit,
  qty,
  SHIP_KIND,
  bar,
  facilityConditionTone,
  shipConditionTone,
  deadlineShare,
  type Tone,
  deadlineTone,
  stockTone,
} from './format';
import { facilityIcon, icon, type IconName } from './icons';
import { DEFAULT_CARGO, applyOrder, type ListOrder } from './order';
import type { AreaStats } from './play';

export type MarketSort = 'ready' | 'price' | 'value';

export interface ViewCtx {
  w: World;
  me: string;
  marketAll: boolean;
  /** good id to show at the exchange, '' = all */
  marketGood: string;
  marketSort: MarketSort;
  priceTrend: (goodId: string) => -1 | 0 | 1;
  /** good selected in the chain graph, '' = none */
  chainGood: string;
  /** the player's own order of facilities and cargo groups (default: build order, tank first) */
  order?: ListOrder;
}

const btn = (label: string, act: string, a = '', extra = '') =>
  `<button data-act="${act}" data-a="${esc(a)}" ${extra}>${label}</button>`;
const empty = (text: string) => `<p class="empty">${text}</p>`;
const route = (from: string, to: string) => `${pName(from)} → ${pName(to)} <span class="muted">(${pc(distance(from, to))})</span>`;

/** Text colour class that matches a bar's tone (green stays plain text). */
const toneClass = (t: Tone) => (t === 'warn' || t === 'bad' ? t : '');

/** Grip to drag a card or group to another place (drag.ts); pointer only, no long-press help. */
const dragHandle = (kind: 'facility' | 'cargo', id: string, label: string) =>
  `<button type="button" class="drag" data-drag="${kind}" data-id="${esc(id)}" aria-label="${esc(label)}">⠿</button>`;

/** A small caption in front of a fill bar. */
const meterRow = (label: string, b: string) => `<span class="meter-label">${label}</span>${b}`;

/** Time left until a deadline as a bar; full red once it has passed. */
const deadlineBar = (w: World, deadline: number) => {
  const overdue = deadline < w.day;
  return `<div class="meters">${meterRow('Frist', bar({ value: overdue ? 100 : deadlineShare(w.day, deadline) * 100, max: 100, tone: deadlineTone(w.day, deadline), label: 'Frist' }))}</div>`;
};

const CARGO_GOODS = (cargo: Cargo) => GOODS.filter((g) => g.cargo === cargo).map((g) => g.name).join(', ');

// ---------- area headers ----------

export type Area = 'facilities' | 'fleet' | 'market' | 'orders';
export const AREAS: readonly Area[] = ['facilities', 'fleet', 'market', 'orders'];
const AREA_NAME: Record<Area, string> = { facilities: 'Anlagen', fleet: 'Flotte', market: 'Börse', orders: 'Aufträge' };

interface Chip {
  text: string;
  tone?: 'good' | 'warn' | 'bad';
  ic?: IconName;
  tip: string;
  /** only shown when the count is above 0 */
  count?: number;
}
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
const chip = (c: Chip) =>
  c.count === 0 ? '' : `<span class="chip${c.tone ? ` ${c.tone}` : ''}" data-tip="${esc(c.tip)}">${c.ic ? icon(c.ic) : ''}${c.text}</span>`;

function deadlineChip(n: number | null): Chip | null {
  if (n === null) return null;
  const tip = 'Die knappste Frist unter deinen zugesagten Lieferungen und angenommenen Transporten.';
  if (n < 0) return { text: 'Frist überzogen', tone: 'bad', ic: 'deadline', tip };
  return { text: n === 0 ? 'nächste Frist heute' : `nächste Frist in ${n === 1 ? '1 Tag' : `${num(n)} Tagen`}`, tone: n <= 3 ? 'warn' : undefined, ic: 'deadline', tip };
}

function areaChips(area: Area, s: AreaStats): Chip[] {
  switch (area) {
    case 'facilities': {
      const f = s.facilities;
      return [
        { text: plural(f.total, 'Anlage', 'Anlagen'), tip: 'Alle deine gebauten Anlagen.' },
        { text: `${num(f.running)} in Betrieb`, tone: 'good', ic: 'running', tip: 'Anlagen, die gerade produzieren.' },
        { text: `${num(f.stopped)} Stillstand`, tone: 'bad', ic: 'stopped', count: f.stopped, tip: 'Stillgelegt oder ohne Produktion: Rohstoffe fehlen oder das Lager ist voll.' },
        { text: `${num(f.building)} im Bau`, ic: 'construction', count: f.building, tip: 'Anlagen im Aufbau.' },
        { text: `${num(f.pending)} unterwegs von Terra`, ic: 'travelling', count: f.pending, tip: 'Gekaufte Anlagen und Lager, die noch nicht angekommen sind.' },
      ];
    }
    case 'fleet': {
      const f = s.fleet;
      return [
        { text: plural(f.total, 'Schiff', 'Schiffe'), tip: 'Alle deine Schiffe.' },
        { text: `${num(f.idle)} frei`, tone: 'good', ic: 'idle', tip: 'Schiffe ohne Auftrag – bereit für den nächsten Transport.' },
        { text: `${num(f.moving)} unterwegs`, ic: 'travelling', tip: 'Schiffe im Flug, beim Laden oder in Reparatur.' },
        { text: `${num(f.critical)} kritisch`, tone: 'bad', ic: 'critical', count: f.critical, tip: 'Schiffe in kritischem Zustand: langsam und ohne neue Aufträge, bis sie auf Terra repariert sind.' },
      ];
    }
    case 'market': {
      const m = s.market;
      return [
        { text: `${num(m.fitting)} passen zu dir`, tone: 'good', tip: 'Nachfragen, die du sofort liefern kannst, und Transporte für ein freies Schiff.' },
        { text: plural(m.transports, 'Transport', 'Transporte'), tip: 'Offene Transportaufträge anderer Firmen.' },
        { text: plural(m.big, 'Großauftrag', 'Großaufträge'), tone: 'warn', ic: 'bigOrder', count: m.big, tip: 'Große Aufträge von Terra für eine Ware, die du herstellst.' },
      ];
    }
    case 'orders': {
      const o = s.orders;
      const d = deadlineChip(o.nextDeadline);
      return [
        { text: `${num(o.promised)} zugesagt`, tip: 'Lieferungen, die du zugesagt hast und die noch nicht angekommen sind.' },
        { text: `${num(o.unshipped)} ohne Transport`, tone: 'warn', count: o.unshipped, tip: 'Zugesagte Lieferungen, für die noch kein Schiff organisiert ist.' },
        { text: `${plural(o.routes, 'Lieferroute', 'Lieferrouten')} aktiv`, ic: 'travelling', count: o.routes, tip: 'Lieferrouten der Logistikzentrale, die gerade von selbst fahren.' },
        ...(d ? [d] : []),
      ];
    }
  }
}

/** The header of an area tab: its icon, name and key figures. */
export const areaHead = (area: Area, s: AreaStats) =>
  `<header class="area-head" data-area="${area}">${icon(area)}<h2 class="area-name">${AREA_NAME[area]}</h2><div class="area-chips">${areaChips(area, s).map(chip).join('')}</div></header>`;

// ---------- Terra: bank, Dynacore, shipyard ----------

// ---------- story events ----------

const storyEvent = (w: World, id: string | undefined) => (id ? w.stories?.events.find((e) => e.id === id) : undefined);

/** Market badge for an order caused by a story event; long press tells the story. */
function storyChip(w: World, id: string | undefined): string {
  const e = storyEvent(w, id);
  return e ? ` <span class="chip story" data-tip="${esc(`${e.title}: ${e.texts.start}`)}">${icon('story')}Ereignis</span>` : '';
}

/** Market badge for an order of the player's own Großprojekt. */
const projectChip = (id: string | undefined) =>
  id ? ` <span class="chip project" data-tip="Bestellung deiner eigenen Baustelle: aus eigenen Anlagen lieferst du kostenlos.">${icon('quark')}Großprojekt</span>` : '';

const PHASE: Record<StoryEvent['phase'], string> = { rise: 'Anlauf', peak: 'Höhepunkt', fade: 'klingt ab', done: 'vorbei' };

/** „Lage in der Galaxie“: the running story events (empty without any). */
export function storyCard(w: World): string {
  const running = (w.stories?.events ?? []).filter((e) => e.phase !== 'done' && w.day < e.endDay);
  const next = w.stories?.upcoming;
  const soon = next ? `<div class="row story-row"><div class="grow"><b>In ${days(next.startDay - w.day)}: ${esc(next.title)}</b> <span class="muted small">${pName(next.place)} · Frühwarnung der Forschungskuppel</span></div></div>` : '';
  if (!running.length && !soon) return '';
  const rows = running
    .map((e) => {
      const goods = e.effects.map((x) => `${gName(x.good)} ${x.factor > 1 ? '<span class="good">↑</span>' : '<span class="bad">↓</span>'}`).join(' · ');
      const strength = storyStrength(e, w.day);
      return `<div class="row story-row"><div class="grow"><b>${esc(e.title)}</b> <span class="muted small">${pName(e.place)} · noch ${days(e.endDay - w.day)}</span>
        <div class="small">${goods}${e.priceBonus > 0 ? ` · <span class="warn">Sonderpreis +${Math.round(e.priceBonus * 100)} %</span>` : ''}</div>
        <div class="meters">${meterRow(PHASE[e.phase], bar({ value: strength, max: 1, tone: 'neutral', label: `Stärke: ${PHASE[e.phase]}` }))}</div>
        <div class="small muted">${esc(e.texts.start)}</div></div></div>`;
    })
    .join('');
  return `<section class="card story-card"><h2>${icon('story')} Lage in der Galaxie</h2>${soon}${rows}</section>`;
}

export function terraView({ w, me }: ViewCtx): string {
  const c = company(w, me);
  const limit = creditLimit(w, me);
  const loans = c.loans.length
    ? `<table><tr><th>Kredit</th><th class="n">Restschuld</th><th class="n">Rate/Tag</th><th class="n">Restlaufzeit</th><th></th></tr>${c.loans
        .map(
          (l, i) => `<tr><td>Kredit ${i + 1}${l.overdueDays ? ' <span class="bad">im Verzug</span>' : ''}</td><td class="n">${cr(l.remaining)}</td><td class="n">${cr(l.dailyRate)}</td><td class="n">${days(l.daysLeft)}</td>
          <td class="n">${btn('Tilgen…', 'repay', l.id, 'data-tip="Zahlt einen Teil oder den ganzen Kredit vorzeitig zurück – das spart Zinsen."')}</td></tr>`,
        )
        .join('')}</table>`
    : empty('Keine laufenden Kredite.');

  const facilityRows = FACILITIES.map((def) => {
    const sites = planetsFor(def.id)
      .sort((a, b) => distance(TERRA, a.id) - distance(TERRA, b.id))
      .map((p) =>
        btn(`${p.name} <small>${pc(distance(TERRA, p.id))}</small>`, 'buy-facility', `${def.id}|${p.id}`, `data-guide="buy-${def.id}-${p.id}" data-tip="Kauft die Anlage für ${p.name}. Sie steht dann als Stückgut auf Terra und muss hingeflogen werden."`),
      )
      .join('');
    const cls = c.cash < def.price ? ' dim' : '';
    return `<div class="row${cls}"><div class="grow"><b>${def.name}</b> <span class="price">${cr(def.price)}</span>
      <div class="small">liefert ${flows(def.outputs)} pro Tag${Object.keys(def.inputs).length ? ` · braucht ${flows(def.inputs)}` : ''}</div>
      <div class="small muted">Kosten ${num(def.maintenance)} + ${num(def.operation)} Cr/Tag (Wartung + Betrieb) · Transport als Stückgut ${fe(def.size)}</div></div>
      <div class="acts">${sites}</div></div>`;
  }).join('');

  const cargos: Cargo[] = ['tank', 'bulk', 'piece', 'cooled', 'live'];
  const shipRows = cargos
    .map((cargo) => {
      const rows = SHIPS.filter((s) => s.cargo === cargo)
        .map(
          (s) => `<tr class="${c.cash < s.price ? 'dim' : ''}"><td><b>${s.name}</b></td><td class="n">${cr(s.price)}</td><td class="n">${qty(s.capacity, s.cargo)}</td><td class="n">${num(s.speed)} Pc/Tag</td><td class="n">${num(s.maintenance)} + ${num(s.operation)}</td>
          <td class="n">${btn('Kaufen', 'buy-ship', s.id, `data-guide="buy-ship-${s.id}" data-tip="Kauft das Schiff; es wartet danach auf Terra auf seinen ersten Auftrag."`)}</td></tr>`,
        )
        .join('');
      return `<h3>${cargoIcon(cargo)} ${SHIP_KIND[cargo]} <span class="muted small">${cargoName(cargo)} für ${CARGO_GOODS(cargo)}${cargo === 'piece' ? ', Anlagen und Lager' : ''}</span></h3>
        <table><tr><th>Schiff</th><th class="n">Preis</th><th class="n">Laderaum</th><th class="n">Tempo</th><th class="n">Kosten/Tag</th><th></th></tr>${rows}</table>`;
    })
    .join('');

  return `${storyCard(w)}
  <section class="card">
    <h2>Bank</h2>
    <p>Kreditrahmen frei: <b>${cr(limit)}</b> · Schulden: <b>${cr(debt(w, me))}</b> · Firmenwert: ${cr(companyValue(w, me))}</p>
    ${loans}
    <div class="acts">${btn('Kredit aufnehmen…', 'loan', '', `class="primary" data-guide="bank-loan" data-tip="Leiht dir Geld für Anlagen und Schiffe. Die Rate wird jeden Tag abgebucht; höchstens zwei Kredite gleichzeitig." ${c.loans.length >= CONFIG.credit.maxLoans ? 'disabled' : ''}`)}</div>
    <p class="hint">Die Rate wird jeden Tag automatisch abgebucht. Fehlt das Geld, gibt es Strafzins, ab dem ${CONFIG.credit.seizureAfterDays}. Tag pfändet die Bank ein Schiff, unter ${cr(CONFIG.credit.bankruptcyCash)} Barkapital droht der Konkurs.</p>
  </section>
  <section class="card">
    <h2>Dynacore – Anlagen</h2>
    <p class="hint">Jeder Planet erlaubt genau eine Anlagenart. Eine gekaufte Anlage steht als Stückgut auf Terra und muss mit einem Stückgutfrachter hingeflogen werden; danach wird sie ${days(CONFIG.constructionDays)} gebaut. Eine zweite gleiche Anlage am selben Ort vergrößert die erste.</p>
    ${facilityRows}
  </section>
  ${automationCard(w, me)}
  ${projectsCard(w, me)}
  <section class="card">
    <h2>Werft – Frachter</h2>
    <p class="hint">Jedes Schiff transportiert nur eine Frachtart. Kosten/Tag: Wartung immer, Betrieb nur unterwegs.</p>
    ${shipRows}
  </section>`;
}

// ---------- Großprojekte and Quark-Trend ----------

const QUARK_SIDE: Record<Flavour, string> = { up: 'Industrie, leicht', down: 'Versorgung, leicht', charm: 'Industrie, mittel', strange: 'Versorgung, mittel', top: 'Industrie, schwer', bottom: 'Versorgung, schwer' };
const quarkTag = (f: Flavour) => `<span class="qtag q-${f}">${QUARK_NAME[f]}</span>`;

/** Terra card „Großprojekte“: six expensive goals; one site at a time with a bar per good. */
export function projectsCard(w: World, me: string): string {
  const running = buildingProject(w);
  const c = company(w, me);
  const rows = PROJECTS.map((def) => {
    const st = projectState(w, def.id);
    const goods = Object.entries(def.materials);
    const head = `<b>${def.name}</b> ${quarkTag(def.quark)} <span class="price">${cr(def.price)}</span> <span class="muted small">+${num(def.prestige)} Prestige</span>`;
    if (st?.status === 'done') return `<div class="row project done"><div class="grow">${head} <span class="good">fertig ✓</span><div class="small">${def.effect}</div></div></div>`;
    if (st) {
      const bars = goods
        .map(([g, need]) => {
          const got = Math.min(need, st.delivered[g] ?? 0);
          return meterRow(`${gName(g)} ${amt(got, g)} / ${amt(need, g)}`, bar({ value: got, max: need, tone: 'neutral', label: `${gName(g)}: ${amt(got, g)} von ${amt(need, g)}` }));
        })
        .join('');
      return `<div class="row project building"><div class="grow">${head} <span class="warn">im Bau</span>${st.waiting ? ` · <span class="bad">${st.waiting}</span>` : ''}
        <div class="meters">${bars}</div><div class="small">${def.effect}</div></div>
        <div class="acts">${btn('Abbrechen', 'project-abort', def.id, 'class="ghost" data-tip="Bricht das Großprojekt ab. Bezahltes Geld und gelieferte Waren sind verloren."')}</div></div>`;
    }
    const can = !running && debt(w, me) === 0 && c.cash >= def.price;
    return `<div class="row project"><div class="grow">${head}
      <div class="small">Waren: ${goods.map(([g, n]) => `${amt(n, g)} ${gName(g)}`).join(' · ')}</div>
      <div class="small">${def.effect}</div></div>
      <div class="acts">${btn('Starten…', 'project-start', def.id, `${can ? 'class="primary"' : 'disabled'} data-tip="Schuldenfrei und aus Barkapital. Danach bestellt die Baustelle im Orbit von Terra ihre Waren an der Börse – aus eigenen Anlagen lieferst du kostenlos, liefert eine andere Firma, zahlst du den Marktpreis."`)}</div></div>`;
  }).join('');
  return `<section class="card projects"><h2>${icon('quark')} Großprojekte</h2>
    <p class="hint">Teure Ziele für große Firmen: erst Geld, dann viele Waren aus einem Quark-Feld. Jedes fertige Projekt bringt Prestige im Firmenindex und einen Vorteil.${running ? '' : ' Es gibt eine Baustelle zur Zeit.'}</p>
    ${rows}</section>`;
}

/** Statistik card: the six quark cells (industry | supply × light, middle, heavy). */
export function quarkCard(w: World): string {
  const s = quarkStatus(w);
  const cell = (f: Flavour) =>
    `<div class="qcell q-${f}${s.flavour === f ? ' lead' : ''}"><b>${QUARK_NAME[f]}</b><span class="small muted">${QUARK_SIDE[f]}</span>${bar({ value: s.cells[f] * 100, max: 100, tone: 'neutral', label: `${QUARK_NAME[f]}-Quark` })}<span class="small">${Math.round(s.cells[f] * 100)} %</span></div>`;
  const mode = s.mode === 'project' ? 'Test-Modus „Projekt“: der Balken zeigt das laufende Großprojekt.' : 'Test-Modus „Trend“: was du lieferst, füllt das Feld seiner Waren; ohne Nachschub klingt es langsam ab.';
  return `<section class="card quark"><h2>${icon('quark')} Quark-Trend</h2>
    <p class="hint">${mode}</p>
    <div class="qgrid"><span></span><span class="small muted">Industrie (Ladung +⅔)</span><span class="small muted">Versorgung (Ladung −⅓)</span>
      <span class="small muted">leicht</span>${cell('up')}${cell('down')}
      <span class="small muted">mittel</span>${cell('charm')}${cell('strange')}
      <span class="small muted">schwer</span>${cell('top')}${cell('bottom')}</div>
    <p class="small muted">Es gibt sechs Quark-Sorten in drei Generationen. Up, Charm und Top tragen +⅔ der Elementarladung, Down, Strange und Bottom −⅓; von Generation zu Generation werden sie schwerer – das Top-Quark ist das schwerste bekannte Elementarteilchen. Schwere Quarks brauchen hier mehr „Energie“.</p>
  </section>`;
}

/** Header chip: where the world is heading. */
export function quarkChip(w: World): string {
  const s = quarkStatus(w);
  if (!s.flavour) return `<span class="muted small" data-tip="Quark-Trend: Sobald deine Welt liefert${s.mode === 'project' ? ' bzw. ein Großprojekt läuft' : ''}, zeigt sich hier, zu welcher Quark-Sorte sie sich entwickelt.">${icon('quark')} –</span>`;
  return `<span class="qchip q-${s.flavour}" data-tip="Quark-Trend: deine Welt entwickelt sich zu einem ${QUARK_NAME[s.flavour]}-Quark (${QUARK_SIDE[s.flavour]}). Mehr dazu im Tab Statistik.">${icon('quark')} ${QUARK_NAME[s.flavour]} ${bar({ value: s.fill * 100, max: 100, tone: 'neutral', label: 'Quark-Trend' })} ${Math.round(s.fill * 100)} %</span>`;
}

// ---------- Logistikzentrale (Dynacore) ----------

function automationCard(w: World, me: string): string {
  const level = automationLevel(w, me);
  const next = nextAutomation(w, me);
  const routes = (w.routes ?? []).filter((r) => r.owner === me);
  const have = level
    ? `<p><b>${automationName(level)}</b> · ${routes.length} von ${routeLimit(w, me)} ${routeLimit(w, me) === 1 ? 'Lieferroute' : 'Lieferrouten'} angelegt</p>`
    : '<p>Automatische Lieferrouten zwischen deinen eigenen Anlagen: Ein festes Linienschiff holt die Ware, sobald genug da ist und das Ziel Nachschub braucht.</p>';
  if (!next) return `<section class="card automation"><h2>${icon('orders')} Logistikzentrale</h2>${have}<p class="good">Voll ausgebaut.</p><div class="acts">${btn('Zu den Lieferrouten', 'tab', 'orders')}</div></section>`;
  const n = facilitiesOf(w, me).length;
  const c = w.companies.find((x) => x.id === me)!;
  const cond = (okay: boolean, text: string) => `<li class="${okay ? 'good' : 'muted'}">${icon(okay ? 'running' : 'stopped')} ${text}</li>`;
  const min = CONFIG.automation.minFacilities;
  return `<section class="card automation">
    <h2>${icon('orders')} Logistikzentrale</h2>
    ${have}
    <p>Nächste Stufe: <b>${automationName(next.level)}</b> – ${next.routes} ${next.routes === 1 ? 'Lieferroute' : 'Lieferrouten'}${next.level >= CONFIG.automation.onsiteServiceFromLevel && level < CONFIG.automation.onsiteServiceFromLevel ? ' und <b>Wartung vor Ort</b> (Linienschiffe werden an Quelle oder Ziel repariert, ohne Umweg über Terra, für ' + num(CONFIG.automation.onsiteServiceFactor * 100) + ' % des Werftpreises)' : ''} · <span class="price">${cr(next.price)}</span> · laufend ${cr(CONFIG.automation.dailyCostPerRoute)} pro aktive Route und Tag</p>
    <ul class="plain conds">
      ${cond(n >= min, `${min} eigene Anlagen (du hast ${n})`)}
      ${cond(debt(w, me) === 0, 'schuldenfrei – kein offener Kredit')}
      ${cond(c.cash >= next.price, `Barkapital ${cr(next.price)} (du hast ${cr(c.cash)})`)}
    </ul>
    <div class="acts">${btn(`${automationName(next.level)} kaufen (${cr(next.price)})`, 'buy-automation', '', 'class="primary" data-tip="Ein teures Ziel für große Firmen: Lieferrouten liefern Ware zwischen deinen Anlagen von selbst."')}${level ? btn('Zu den Lieferrouten', 'tab', 'orders') : ''}</div>
  </section>`;
}

/** The Lieferrouten section at the top of the Aufträge tab. */
function routesSection(w: World, me: string): string {
  if (!automationLevel(w, me)) return '';
  const routes = (w.routes ?? []).filter((r) => r.owner === me);
  const rows = routes
    .map((r) => {
      const s = w.ships.find((x) => x.id === r.ship);
      return `<div class="row route${r.active ? '' : ' dim'}"><div class="grow">${cargoIcon(good(r.good).cargo)} <b>${gName(r.good)}: ${esc(routeName(w, r))}</b>
        <div class="small">${s ? `Linienschiff ${shipLabel(s)} · ` : ''}${amt(r.amount, r.good)} pro Fahrt · Nachschub unter ${amt(r.refillBelow, r.good)} · Wartung unter ${num(serviceLimit(r))} %</div>
        <div class="small ${r.active ? '' : 'muted'}">${esc(r.status)}</div>
        <div class="small muted">automatisch geliefert: ${amt(r.delivered, r.good)} in ${num(r.trips)} ${r.trips === 1 ? 'Fahrt' : 'Fahrten'}</div></div>
        <div class="acts">${r.active ? btn('Pausieren', 'route-pause', r.id, 'data-tip="Hält die Route an und gibt das Linienschiff frei. Eine laufende Fahrt wird noch zu Ende gebracht."') : btn('Fortsetzen', 'route-resume', r.id, 'class="primary"')}${btn('Wartung…', 'route-service', r.id, 'data-tip="Ab welchem Zustand das Linienschiff gewartet wird – vor jeder neuen Fahrt."')}${btn('Löschen', 'route-delete', r.id, 'class="ghost"')}</div></div>`;
    })
    .join('');
  const full = routes.length >= routeLimit(w, me);
  return `<section class="card routes"><h2>${icon('orders')} Lieferrouten <span class="muted small">${routes.length} von ${routeLimit(w, me)}</span></h2>
    ${rows || empty('Noch keine Lieferroute. Lege eine an: Quelle, Ziel und ein Linienschiff.')}
    <div class="acts">${full ? `<span class="hint">Alle Plätze belegt – baue die Logistikzentrale bei Dynacore aus.</span>` : btn('Neue Lieferroute…', 'route-new', '', 'class="primary"')}</div></section>`;
}

// ---------- Anlagen ----------

function assetTransportText(w: World, t: Transport | undefined): { text: string; action: string } {
  if (!t) return { text: 'Kein Transport', action: '' };
  if (t.status === 'open')
    return { text: `An der Börse ausgeschrieben (Honorar ${cr(t.fee)})`, action: btn('Zurückziehen', 'unrelease', t.id) };
  if (t.status === 'accepted' && !t.ship) {
    if (t.carrier !== null && t.carrier !== w.playerId) return { text: `Übernommen von ${who(w, t.carrier)} – Schiff folgt`, action: '' };
    return { text: '<span class="bad">Wartet auf Terra auf einen Frachter</span>', action: btn('Transport organisieren…', 'move', t.id, 'class="primary" data-guide="asset-transport"') };
  }
  const s = t.ship ? w.ships.find((x) => x.id === t.ship) : undefined;
  return { text: s ? `${t.carrier === w.playerId ? '' : `${who(w, t.carrier)}: `}${shipStatus(w, s).text}` : 'Unterwegs', action: '' };
}

export function facilitiesView({ w, me, order }: ViewCtx): string {
  const pending = pendingAssets(w, me)
    .map(({ asset: a, transport: t }) => {
      const name = a.kind === 'facility' ? facilityDef(a.defId).name : storageDef(a.defId).name;
      const s = assetTransportText(w, t);
      return `<div class="row"><div class="grow"><b>${name}</b> für ${pName(a.planet)} <span class="muted">(${fe(a.size)} Stückgut)</span><div class="small">${s.text}</div></div><div class="acts">${s.action}</div></div>`;
    })
    .join('');

  const facs = applyOrder(facilitiesOf(w, me), order?.facilities ?? [], (f) => f.id)
    .map((f) => {
      const def = facilityDef(f.type);
      const st = facilityStatus(f);
      const goods = [...Object.keys(def.inputs), ...Object.keys(def.outputs)];
      const stock = goods
        .map((g) => {
          const isIn = g in def.inputs;
          const res = f.reserved[g] ?? 0;
          const inc = isIn ? incoming(w, f.id, g) : 0;
          const cap = storageCapacity(f, g);
          const have = f.stock[g] ?? 0;
          const fill = bar({ value: have, max: cap, reserved: isIn ? undefined : res, incoming: isIn ? inc : undefined, tone: stockTone(isIn, cap > 0 ? have / cap : 0), label: gName(g) });
          return `<tr><td>${gName(g)} <span class="muted small">${isIn ? 'Rohstoff' : 'Produkt'}</span></td><td class="n stock">${amt(have, g)}${fill}</td><td class="n">${amt(cap, g)}</td>
          <td class="n">${isIn ? (inc ? `${amt(inc, g)} bestellt` : '–') : res ? `${amt(res, g)} zugesagt` : '–'}</td><td class="n">${isIn ? '' : available(f, g) >= 0 ? `${amt(available(f, g), g)} frei` : `<span class="bad">${amt(-available(f, g), g)} fehlen</span>`}</td></tr>`;
        })
        .join('');
      const eff = f.status === 'running' ? Math.round(productionEfficiency(f) * 100) : 0;
      const cost = def.maintenance * f.units + (f.status === 'running' ? def.operation * f.units : 0);
      const acts = [
        f.status === 'stopped' ? btn('Betrieb aufnehmen', 'start', f.id, 'class="primary" data-guide="start-facility" data-tip="Startet die Produktion. Ab jetzt kostet die Anlage auch Betriebskosten."') : '',
        f.status === 'running' ? btn('Stilllegen', 'stop', f.id, 'data-tip="Hält die Produktion an. Dann fallen nur noch Wartungskosten an."') : '',
        Object.keys(def.inputs).length && f.status !== 'construction' ? btn('Ware bestellen…', 'order', f.id, 'data-tip="Stellt eine Nachfrage an die Börse: andere Firmen liefern dir Rohstoffe zum genannten Preis."') : '',
        btn('Lager erweitern…', 'storage', f.id, 'data-tip="Kauft ein Zusatzlager für eine Frachtart. Es wird wie eine Anlage hingeflogen."'),
        f.condition < 100 ? btn(`Reparieren (${cr(repairFacilityCost(f))})`, 'repair-facility', f.id) : '',
        btn('Verschrotten', 'scrap', f.id, 'class="ghost"'),
      ].join('');
      return `<section class="card drag-item" data-drag-item="${f.id}">
        <h2>${icon(facilityIcon(f.type))}${facilityLabel(f)}${f.units > 1 ? ` <span class="muted">× ${f.units}</span>` : ''} <span class="badge ${st.cls}">${icon(st.icon)} ${st.text}</span>${dragHandle('facility', f.id, `${facilityLabel(f)} verschieben`)}</h2>
        <div class="meters">${meterRow('Zustand', bar({ value: f.condition, max: 100, tone: facilityConditionTone(f.condition), label: 'Zustand' }))}</div>
        <p class="small">Zustand <b class="${toneClass(facilityConditionTone(f.condition))}">${dec(f.condition)} %</b> · Auslastung ${eff} % · Kosten heute ${cr(cost)} · liefert bis zu ${flows(def.outputs, f.units)} pro Tag${Object.keys(def.inputs).length ? ` aus ${flows(def.inputs, f.units)}` : ''}</p>
        ${f.status === 'running' && eff === 0 ? `<p class="bad small">Steht still: ${Object.keys(def.inputs).some((g) => (f.stock[g] ?? 0) <= 0) ? 'Rohstoffe fehlen – „Ware bestellen“.' : 'Lager voll – liefere Ware aus.'}</p>` : ''}
        <table><tr><th>Ware</th><th class="n">Lager</th><th class="n">Kapazität</th><th class="n">Aufträge</th><th class="n"></th></tr>${stock}</table>
        ${f.storages.length ? `<p class="small muted">Zusatzlager: ${f.storages.map((id) => storageDef(id).name).join(', ')}</p>` : ''}
        <div class="acts">${acts}</div>
      </section>`;
    })
    .join('');

  return `${pending ? `<section class="card"><h2>Unterwegs von Terra</h2>${pending}</section>` : ''}
    ${facs || (pending ? '' : `<section class="card">${empty('Du hast noch keine Anlage. Kaufe eine bei Dynacore auf Terra.')}<div class="acts">${btn('Zu Dynacore', 'tab', 'terra')}</div></section>`)}`;
}

// ---------- Flotte ----------

export function fleetView({ w, me, order }: ViewCtx): string {
  const ships = shipsOf(w, me);
  if (!ships.length) return `<section class="card">${empty('Du hast noch kein Schiff. Frachter gibt es in der Werft auf Terra.')}<div class="acts">${btn('Zur Werft', 'tab', 'terra')}</div></section>`;
  const waiting = waitingTransports(w, me);
  const card = (s: Ship) => {
      const def = shipDef(s.model);
      const st = shipStatus(w, s);
      const critical = isCriticalShip(s);
      const line = lineRoute(w, s.id);
      const jobs = line
        ? ''
        : s.phase === 'idle' && !critical
          ? waiting
              .filter((t) => t.cargo === def.cargo && t.amount <= def.capacity)
              .map((t) => btn(`Zuweisen: ${loadName(w, t)} ${pName(t.fromPlanet)} → ${pName(t.toPlanet)}`, 'assign', `${s.id}|${t.id}`, 'class="primary"'))
              .join('')
          : // a ship on its way to a pickup can take further loads for the same route
            waiting
              .filter((t) => canJoin(w, s, t))
              .map((t) =>
                btn(`Zuladen: ${loadName(w, t)} ${pName(t.fromPlanet)} → ${pName(t.toPlanet)}`, 'assign', `${s.id}|${t.id}`, 'class="primary" data-tip="Die Ladung fliegt im selben Flug mit – gleicher Abholort, gleiches Ziel, genug Platz im Laderaum."'),
              )
              .join('');
      const atTerra = s.phase === 'idle' && s.at === TERRA;
      const worn = s.condition < 100;
      const loads = shipLoads(w, s);
      const room = loads.length && s.phase !== 'toDelivery' && s.phase !== 'unloading' ? shipRoom(w, s) : 0;
      const acts = [
        jobs,
        s.phase === 'idle' && !atTerra && !line ? btn('Nach Terra fliegen', 'to-terra', s.id) : '',
        s.phase === 'idle' && !atTerra && worn ? btn('Zur Reparatur nach Terra', 'repair-trip', s.id) : '',
        atTerra && worn ? btn(`Reparieren (${cr(repairShipCost(s))})`, 'repair-ship', s.id) : '',
        !atTerra && worn && s.phase !== 'repair'
          ? s.repairAtTerra
            ? btn('Reparatur vorgemerkt ✓ aufheben', 'repair-mark', `${s.id}|0`, 'class="on" data-tip="Hebt die Vormerkung auf; das Schiff wird auf Terra dann nicht automatisch repariert."')
            : btn(`Beim nächsten Terra-Stopp reparieren (~${cr(repairShipCost(s))})`, 'repair-mark', `${s.id}|1`, 'data-tip="Das Schiff fliegt weiter wie geplant und wird beim nächsten Halt auf Terra automatisch repariert."')
          : '',
        atTerra ? btn(`Verkaufen (${cr(Math.round(shipValue(s) * 0.6))})`, 'sell-ship', s.id, 'class="ghost"') : '',
        // Großwerft: repair on the spot at a planet with an own plant
        s.phase === 'idle' && !atTerra && worn && hasProject(w, me, 'yard') && w.facilities.some((f) => f.owner === me && f.planet === s.at)
          ? btn(`Vor Ort reparieren (${cr(repairShipCost(s))})`, 'repair-onsite', s.id, 'data-tip="Großwerft: Reparatur hier an deiner Anlage zum Werftpreis, ohne Flug nach Terra."')
          : '',
      ].join('');
      const stateIc: IconName = critical ? 'critical' : s.phase === 'idle' ? 'idle' : s.phase === 'loading' || s.phase === 'unloading' ? 'loading' : 'travelling';
      const stateText = s.phase === 'idle' ? 'frei' : stateIc === 'loading' ? (s.phase === 'loading' ? 'lädt' : 'entlädt') : 'unterwegs';
      const badge = critical
        ? `<span class="badge bad">${icon(stateIc)} kritisch</span>`
        : `<span class="badge ${st.cls}">${icon(stateIc)} ${stateText}</span>`;
      const lineBadge = line
        ? ` <span class="badge line" data-tip="Fährt nur diese Lieferroute. Zum Freigeben die Route unter Aufträge pausieren.">${icon('orders')} Linienschiff ${esc(routeName(w, line))}</span>`
        : '';
      const cap = def.capacity;
      const bars = [
        meterRow('Zustand', bar({ value: s.condition, max: 100, tone: shipConditionTone(s.condition), label: 'Zustand' })),
        loads.length ? meterRow('Laderaum', bar({ value: cap - shipRoom(w, s), max: cap, tone: 'neutral', label: 'Laderaum' })) : '',
        s.route ? meterRow('Flug', bar({ value: s.route.traveled, max: s.route.distance, tone: 'neutral', label: 'Flug' })) : '',
      ].join('');
      return `<section class="card ship-card cargo-${def.cargo}${critical ? ' critical' : ''}">
        <h2>${cargoIcon(def.cargo)} ${shipLabel(s)} ${badge}${lineBadge}</h2>
        <div class="meters">${bars}</div>
        <p>${st.text}</p>
        ${critical ? `<p class="bad small"><b>Kritischer Zustand:</b> fliegt nur noch mit ${Math.round(CONFIG.ships.criticalSpeedFactor * 100)} % Tempo und nimmt keine neuen Aufträge an. ${s.phase === 'idle' ? (s.at === TERRA ? 'Jetzt reparieren.' : 'Schick es zur Reparatur nach Terra.') : 'Nach diesem Flug zur Reparatur nach Terra.'}</p>` : ''}
        ${loads.length > 1 ? `<p class="small">An Bord für diesen Flug: ${loads.map((t) => loadName(w, t)).join(' · ')}</p>` : ''}
        <p class="small muted">${qty(def.capacity, def.cargo)} Laderaum${room > 0 ? ` (noch ${qty(room, def.cargo)} frei für Zuladung)` : ''} · ${critical ? `<span class="bad">${num(shipSpeed(s))} Pc/Tag</span> (sonst ${num(def.speed)})` : `${num(def.speed)} Pc/Tag`} · Zustand <span class="${toneClass(shipConditionTone(s.condition))}">${dec(s.condition)} %</span>${s.condition < 50 && !critical ? ' – bald zur Reparatur nach Terra' : ''}${s.repairAtTerra ? ` · <span class="warn">${icon('repairMarked')} Reparatur auf Terra vorgemerkt</span>` : ''}</p>
        ${acts ? `<div class="acts">${acts}</div>` : ''}
      </section>`;
  };

  // grouped by cargo type, each with its symbol; within a group the big ships first
  return (order?.cargo ?? DEFAULT_CARGO)
    .map((cargo) => {
      const group = ships
        .filter((s) => shipDef(s.model).cargo === cargo)
        .sort((a, b) => shipDef(b.model).capacity - shipDef(a.model).capacity || a.id.localeCompare(b.id, 'de', { numeric: true }));
      if (!group.length) return '';
      const idle = group.filter((s) => s.phase === 'idle' && !isCriticalShip(s) && !lineRoute(w, s.id)).length;
      const crit = group.filter(isCriticalShip).length;
      return `<div class="drag-item fleet-group" data-drag-item="${cargo}"><h2 class="fleet-head cargo-${cargo}">${cargoIcon(cargo)} ${SHIP_KIND[cargo]} <span class="muted small">${group.length} ${group.length === 1 ? 'Schiff' : 'Schiffe'} · ${idle} frei${crit ? ` · <span class="bad">${crit} kritisch</span>` : ''} · für ${CARGO_GOODS(cargo)}${cargo === 'piece' ? ', Anlagen' : ''}</span>${dragHandle('cargo', cargo, `${SHIP_KIND[cargo]} verschieben`)}</h2>
        ${group.map(card).join('')}</div>`;
    })
    .join('');
}

// ---------- Börse ----------

export function marketView(ctx: ViewCtx): string {
  const { w, me, marketAll, marketGood, marketSort } = ctx;
  const allOptions = deliverableDemands(w, me);
  const otherDemands = w.demands.filter((d) => d.status === 'open' && d.requester !== me && !allOptions.some((o) => o.d.id === d.id));
  // goods that appear in the lists, for the filter chips
  const counts = new Map<string, number>();
  for (const d of [...allOptions.map((o) => o.d), ...(marketAll ? otherDemands : [])]) counts.set(d.good, (counts.get(d.good) ?? 0) + 1);
  const goodFilter = marketGood && counts.has(marketGood) ? marketGood : '';
  const byValue = (a: { amount: number; pricePerFe: number }, b: { amount: number; pricePerFe: number }) => b.amount * b.pricePerFe - a.amount * a.pricePerFe;
  const sortDemands = <T>(list: T[], get: (x: T) => { amount: number; pricePerFe: number }, ready?: (x: T) => number) =>
    [...list].sort((a, b) =>
      marketSort === 'price' ? get(b).pricePerFe - get(a).pricePerFe : marketSort === 'value' || !ready ? byValue(get(a), get(b)) : ready(a) - ready(b) || byValue(get(a), get(b)),
    );
  const options = sortDemands(
    allOptions.filter((o) => !goodFilter || o.d.good === goodFilter),
    (o) => o.d,
    (o) => o.daysToReady,
  );
  const goodChips = [...counts.entries()]
    .sort((a, b) => gName(a[0]).localeCompare(gName(b[0]), 'de'))
    .map(([g, n]) => btn(`${gName(g)} <small>${n}</small>`, 'market-good', g, goodFilter === g ? 'class="on"' : ''))
    .join('');
  const sortChip = (id: MarketSort, label: string) => btn(label, 'market-sort', id, marketSort === id ? 'class="on"' : '');
  let firstReady = true;
  const demandRows = options
    .map((o) => {
      const d = o.d;
      const f = o.facilities[0] ?? facilitiesOf(w, me).find((x) => d.good in facilityDef(x.type).outputs)!;
      const value = d.amount * d.pricePerFe;
      const guide = o.ready && firstReady ? 'data-guide="deliver"' : '';
      if (o.ready) firstReady = false;
      const state = o.tooBig
        ? `<span class="bad">Passt nicht ins Lager deiner Anlage (höchstens ${amt(storageCapacity(f, d.good), d.good)}) – ein Zusatzlager hilft.</span>`
        : o.ready
          ? `<span class="good">Lager reicht (${amt(available(f, d.good), d.good)} frei)</span>`
          : `<span class="warn">Lager: ${amt(Math.max(0, available(f, d.good)), d.good)} frei${o.daysToReady < Infinity ? ` – genug ${inDays(o.daysToReady)}` : ' – die Anlage produziert gerade nicht'}. Annehmen geht, ist aber riskant.</span>`;
      return `<div class="row"><div class="grow">${cargoIcon(good(d.good).cargo)} <b>${amt(d.amount, d.good)} ${gName(d.good)}</b> für ${who(w, d.requester)} <span class="price">${cr(value)}</span>${d.big ? ` <span class="chip warn">${icon('bigOrder')}Großauftrag</span>` : ''}${storyChip(w, d.story)}${projectChip(d.project)}
        <div class="small">${perUnit(d.pricePerFe, d.good)} · ${route(f.planet, d.toPlanet)} · ${cargoName(good(d.good).cargo)} · seit ${days(w.day - d.createdDay)} offen</div>
        <div class="small">${state}</div></div>
        <div class="acts">${btn('Liefern…', 'deliver', d.id, `class="${o.ready ? 'primary' : ''}" ${guide} data-tip="Nimmt die Nachfrage an und wählt die Schiffe dafür. Wer zuerst annimmt, bekommt den Auftrag." ${o.tooBig ? 'disabled' : ''}`)}</div></div>`;
    })
    .join('');

  const transports = openTransports(w, me)
    .map((t) => ({ t, can: carryState(w, me, t) }))
    .filter((x) => marketAll || x.can !== 'none')
    .filter((x) => !goodFilter || x.t.good === goodFilter)
    .sort((a, b) => b.t.fee - a.t.fee)
    .map(({ t, can }) => {
      const what = loadName(w, t);
      const tag = can === 'idle' ? '<span class="good">passt zu freiem Schiff</span>' : can === 'busy' ? '<span class="muted">passendes Schiff gerade unterwegs</span>' : `<span class="muted">kein passendes Schiff</span>`;
      return `<div class="row"><div class="grow">${cargoIcon(t.cargo)} <b>${what}</b> für ${who(w, t.issuer)} <span class="price">${cr(t.fee)}</span>
        <div class="small">${route(t.fromPlanet, t.toPlanet)} · ${cargoName(t.cargo)} ${qty(t.amount, t.cargo)} · ${deadlineIn(w, t.deadlineDay)}</div><div class="small">${tag}</div></div>
        <div class="acts">${btn('Übernehmen…', 'carry', t.id, `class="primary" data-tip="Fährt die Ladung einer anderen Firma mit einem freien eigenen Schiff – gegen das genannte Honorar." ${can === 'idle' ? '' : 'disabled'}`)}</div></div>`;
    })
    .join('');

  const others = marketAll
    ? sortDemands(
        otherDemands.filter((d) => !goodFilter || d.good === goodFilter),
        (d) => d,
      )
        .map(
          (d) => `<tr><td>${cargoIcon(good(d.good).cargo)} ${gName(d.good)}${d.big ? ` ${icon('bigOrder', 'warn')}` : ''}${storyChip(w, d.story)}${projectChip(d.project)}</td><td>${who(w, d.requester)}</td><td>${pName(d.toPlanet)}</td><td class="n">${amt(d.amount, d.good)}</td><td class="n">${perUnit(d.pricePerFe, d.good)}</td><td class="n">${cr(d.amount * d.pricePerFe)}</td></tr>`,
        )
        .join('')
    : '';

  return `
  <div class="chips">${btn('Nur passende', 'market-all', '0', marketAll ? '' : 'class="on"')}${btn('Alles zeigen', 'market-all', '1', marketAll ? 'class="on"' : '')}</div>
  <div class="chips wrap"><span class="chip-label">Ware</span>${btn('Alle', 'market-good', '', goodFilter ? '' : 'class="on"')}${goodChips}</div>
  <div class="chips wrap"><span class="chip-label">Sortieren</span>${sortChip('ready', 'Lieferbar zuerst')}${sortChip('price', 'Preis pro Einheit')}${sortChip('value', 'Gesamtwert')}</div>
  <section class="card">
    <h2>Nachfragen für deine Waren</h2>
    <p class="hint">Wer zuerst annimmt, bekommt den Auftrag. Bezahlt wird bei Ankunft der Ware; die Ware im Lager wird beim Annehmen reserviert. Du darfst auch annehmen, bevor genug produziert ist – dann wartet das Schiff an der Anlage, und wer die Frist verpasst, zahlt Strafe.</p>
    ${demandRows || empty(goodFilter ? 'Für diese Ware gibt es gerade keine passende Nachfrage.' : facilitiesOf(w, me).length ? 'Gerade fragt niemand nach deinen Waren.' : 'Sobald du eine Anlage hast, erscheinen hier Nachfragen nach ihren Waren.')}
  </section>
  <section class="card">
    <h2>Transportaufträge</h2>
    <p class="hint">Andere Firmen zahlen ein Honorar, wenn du ihre Ladung mit einem eigenen Schiff fährst.</p>
    ${transports || empty(marketAll ? 'Keine offenen Transporte.' : 'Kein offener Transport passt zu deinen Schiffen.')}
  </section>
  ${marketAll ? `<section class="card"><h2>Weitere Nachfragen am Markt</h2>${others ? `<table><tr><th>Ware</th><th>Auftraggeber</th><th>Ziel</th><th class="n">Menge</th><th class="n">Preis</th><th class="n">Wert</th></tr>${others}</table>` : empty('Keine.')}</section>` : ''}`;
}

// ---------- Aufträge ----------

export function ordersView({ w, me }: ViewCtx): string {
  const unshipped = unshippedDemands(w, me)
    .map(
      (d) => `<div class="row"><div class="grow">${cargoIcon(good(d.good).cargo)} <b>${amt(d.amount, d.good)} ${gName(d.good)}</b> an ${who(w, d.requester)}${deadlineBar(w, d.deadlineDay)}<div class="small">Zugesagt – ${deadlineIn(w, d.deadlineDay)}. ${unshippedAmount(d) < d.amount ? `${amt(d.amount - unshippedAmount(d), d.good)} sind unterwegs, für ${amt(unshippedAmount(d), d.good)} fehlt noch der Transport.` : 'Es fehlt noch der Transport.'}</div></div>
      <div class="acts">${btn('Transport organisieren…', 'arrange', d.id, 'class="primary" data-guide="arrange" data-tip="Wählt eigene Schiffe für die zugesagte Lieferung oder schreibt den Transport an der Börse aus."')}</div></div>`,
    )
    .join('');

  const waiting = waitingTransports(w, me)
    .map((t) => {
      const what = loadName(w, t);
      const ships = idleFittingShips(w, me, t.cargo, t.amount);
      return `<div class="row"><div class="grow">${cargoIcon(t.cargo)} <b>${what}</b> ${route(t.fromPlanet, t.toPlanet)}${deadlineBar(w, t.deadlineDay)}
        <div class="small">${t.own ? 'Eigener Transport' : `Für ${who(w, t.issuer)}, Honorar ${cr(t.fee)}`} · ${deadlineIn(w, t.deadlineDay)} · ${ships.length ? `${ships.length} passende freie Schiffe` : '<span class="bad">kein passendes freies Schiff</span>'}</div></div>
        <div class="acts">${btn('Schiff wählen…', 'move', t.id, 'class="primary" data-guide="waiting"')}</div></div>`;
    })
    .join('');

  const running = w.transports
    .filter((t) => t.kind === 'goods' && (t.carrier === me || t.issuer === me))
    .filter((t) => ['open', 'assigned', 'loaded'].includes(t.status) || (t.status === 'accepted' && t.carrier !== me))
    .map((t) => {
      const s = t.ship ? w.ships.find((x) => x.id === t.ship) : undefined;
      const state =
        t.status === 'open'
          ? `An der Börse ausgeschrieben, Honorar ${cr(t.fee)}`
          : s
            ? `${t.carrier === me ? '' : `${who(w, t.carrier)}: `}${shipStatus(w, s).text}`
            : `Übernommen von ${who(w, t.carrier)}`;
      return `<div class="row"><div class="grow">${cargoIcon(t.cargo)} <b>${amt(t.amount, t.good!)} ${gName(t.good!)}</b> ${route(t.fromPlanet, t.toPlanet)}${deadlineBar(w, t.deadlineDay)}<div class="small">${state}${t.late ? ' · <span class="bad">Frist überzogen</span>' : ` · ${deadlineIn(w, t.deadlineDay)}`}</div></div>${t.status === 'open' && t.issuer === me ? `<div class="acts">${btn('Zurückziehen', 'unrelease', t.id)}</div>` : ''}</div>`;
    })
    .join('');

  const mine = w.demands
    .filter((d) => d.requester === me && ['open', 'accepted', 'shipping'].includes(d.status))
    .map((d) => {
      const state = d.status === 'open' ? 'Offen – wartet auf einen Lieferanten' : d.own ? 'Aus eigener Anlage' : `Liefert ${who(w, d.supplier)}`;
      return `<div class="row"><div class="grow">${cargoIcon(good(d.good).cargo)} <b>${amt(d.amount, d.good)} ${gName(d.good)}</b> nach ${pName(d.toPlanet)} <span class="price">${perUnit(d.pricePerFe, d.good)}</span>${d.status === 'open' ? '' : deadlineBar(w, d.deadlineDay)}<div class="small">${state}</div></div>
      <div class="acts">${d.status === 'open' ? btn('Stornieren', 'cancel-demand', d.id, 'class="ghost"') : ''}</div></div>`;
    })
    .join('');

  const routes = routesSection(w, me);
  if (!unshipped && !waiting && !running && !mine) {
    return `${routes}<section class="card">${empty('Keine laufenden Aufträge. Neue Aufträge findest du an der Börse; Rohstoffe für deine Anlagen bestellst du unter „Anlagen“ → „Ware bestellen“.')}<div class="acts">${btn('Zur Börse', 'tab', 'market')}</div></section>`;
  }
  return `${routes}
    ${unshipped ? `<section class="card"><h2>Zugesagte Lieferungen ohne Transport</h2>${unshipped}</section>` : ''}
    ${waiting ? `<section class="card"><h2>Wartet auf ein Schiff</h2>${waiting}</section>` : ''}
    ${running ? `<section class="card"><h2>Unterwegs</h2>${running}</section>` : ''}
    ${mine ? `<section class="card"><h2>Deine Nachfragen</h2>${mine}</section>` : ''}`;
}

// ---------- Statistik ----------

export function statsView({ w, me, priceTrend, chainGood }: ViewCtx): string {
  const rank = ranking(w)
    .map(
      (r, i) => `<tr class="${r.id === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.bankrupt ? ' ✝' : ''}</td><td class="n">${num(r.index)}</td><td class="n ${r.cash < 0 ? 'bad' : ''}">${cr(r.cash)}</td><td class="n">${cr(r.debt)}</td>
      <td class="n">${facilitiesOf(w, r.id).length}</td><td class="n">${shipsOf(w, r.id).length}</td></tr>`,
    )
    .join('');
  const prices = GOODS.map((g) => {
    const p = w.prices[g.id] ?? g.basePrice;
    const t = priceTrend(g.id);
    const arrow = t > 0 ? '<span class="good">▲ steigt</span>' : t < 0 ? '<span class="bad">▼ fällt</span>' : '<span class="muted">► gleich</span>';
    return `<tr><td>${g.name}</td><td class="n">${dec(p)} <span class="muted small">Cr/${unitOf(g.id)}</span></td><td class="n muted">${g.basePrice}</td><td>${arrow}</td><td class="muted">${cargoName(g.cargo)}</td></tr>`;
  }).join('');
  const ticker = w.log
    .filter((l) => l.company === me || l.priority >= 2)
    .slice(-60)
    .reverse()
    .map((l) => `<li class="${l.company === me ? 'mine' : ''} p${l.priority}"><span class="d">Tag ${l.day}</span>${logText(l.text)}</li>`)
    .join('');
  const c = company(w, me);
  const myRoutes = (w.routes ?? []).filter((r) => r.owner === me);
  const routeStats = myRoutes.length
    ? `<section class="card routes"><h2>${icon('orders')} ${automationName(automationLevel(w, me))}</h2>
      <p>Automatisch erledigt: <b>${num(myRoutes.reduce((t, r) => t + r.trips, 0))} Fahrten</b> – ${myRoutes.map((r) => `${gName(r.good)} ${amt(r.delivered, r.good)}`).join(' · ')}</p></section>`
    : '';
  return `${routeStats}
  ${quarkCard(w)}
  <section class="card"><h2>Warenketten</h2>
    <p class="hint">Von den Rohstoffen links bis zu den Endprodukten rechts, die Terra kauft. Türkis umrandet: das stellst du her. Gelb: das brauchst du. Rot: das fehlt einer deiner Anlagen gerade.</p>
    <div class="chain-scroll">${chainSvg(w, me, chainGood, priceTrend)}</div>
    <div class="chain-detail">${chainDetail(w, me, chainGood)}</div>
  </section>
  <section class="card"><h2>Rangliste (Firmenindex)</h2>
    <table><tr><th>#</th><th>Firma</th><th class="n">Index</th><th class="n">Bar</th><th class="n">Schulden</th><th class="n">Anlagen</th><th class="n">Schiffe</th></tr>${rank}</table>
    <p class="small muted">Deine Bilanz bisher: Einnahmen ${cr(c.revenue)}, Ausgaben ${cr(c.expenses)}, Ruf ${num(c.reputation)} / 100.</p>
  </section>
  <section class="card"><h2>Kurse</h2>
    <table><tr><th>Ware</th><th class="n">Kurs</th><th class="n">Basis</th><th>Tendenz</th><th>Frachtart</th></tr>${prices}</table>
  </section>
  <section class="card"><h2>Nachrichten</h2><ol class="ticker-list">${ticker || '<li>Noch keine Meldungen.</li>'}</ol></section>`;
}

/** Numbers for the badges on the bottom navigation. */
export function badges(w: World, me: string) {
  const market = areaStats(w, me).market.fitting;
  const orders = unshippedDemands(w, me).length + waitingTransports(w, me).filter((t) => t.kind === 'goods').length;
  const facilities =
    facilitiesOf(w, me).filter((f) => f.status === 'stopped').length +
    pendingAssets(w, me).filter((p) => p.transport?.status === 'accepted' && !p.transport.ship && p.transport.carrier === me).length;
  const fleet = areaStats(w, me).fleet.idle;
  return { market, orders, facilities, fleet };
}
