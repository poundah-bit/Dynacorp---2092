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
  carryState,
  deliverableDemands,
  idleFittingShips,
  openTransports,
  pendingAssets,
  unshippedDemands,
  waitingTransports,
} from './play';
import { unitOf, unshippedAmount } from '../sim/index';
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
} from './format';

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
}

const btn = (label: string, act: string, a = '', extra = '') =>
  `<button data-act="${act}" data-a="${esc(a)}" ${extra}>${label}</button>`;
const empty = (text: string) => `<p class="empty">${text}</p>`;
const route = (from: string, to: string) => `${pName(from)} → ${pName(to)} <span class="muted">(${pc(distance(from, to))})</span>`;

const CARGO_GOODS = (cargo: Cargo) => GOODS.filter((g) => g.cargo === cargo).map((g) => g.name).join(', ');

// ---------- Terra: bank, Dynacore, shipyard ----------

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

  return `
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
  <section class="card">
    <h2>Werft – Frachter</h2>
    <p class="hint">Jedes Schiff transportiert nur eine Frachtart. Kosten/Tag: Wartung immer, Betrieb nur unterwegs.</p>
    ${shipRows}
  </section>`;
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

export function facilitiesView({ w, me }: ViewCtx): string {
  const pending = pendingAssets(w, me)
    .map(({ asset: a, transport: t }) => {
      const name = a.kind === 'facility' ? facilityDef(a.defId).name : storageDef(a.defId).name;
      const s = assetTransportText(w, t);
      return `<div class="row"><div class="grow"><b>${name}</b> für ${pName(a.planet)} <span class="muted">(${fe(a.size)} Stückgut)</span><div class="small">${s.text}</div></div><div class="acts">${s.action}</div></div>`;
    })
    .join('');

  const facs = facilitiesOf(w, me)
    .map((f) => {
      const def = facilityDef(f.type);
      const st = facilityStatus(f);
      const goods = [...Object.keys(def.inputs), ...Object.keys(def.outputs)];
      const stock = goods
        .map((g) => {
          const isIn = g in def.inputs;
          const res = f.reserved[g] ?? 0;
          const inc = isIn ? incoming(w, f.id, g) : 0;
          return `<tr><td>${gName(g)} <span class="muted small">${isIn ? 'Rohstoff' : 'Produkt'}</span></td><td class="n">${amt(f.stock[g] ?? 0, g)}</td><td class="n">${amt(storageCapacity(f, g), g)}</td>
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
      return `<section class="card">
        <h2>${facilityLabel(f)}${f.units > 1 ? ` <span class="muted">× ${f.units}</span>` : ''} <span class="badge ${st.cls}">${st.text}</span></h2>
        <p class="small">Zustand <b class="${f.condition < CONFIG.facilities.repairBelow ? 'bad' : ''}">${dec(f.condition)} %</b> · Auslastung ${eff} % · Kosten heute ${cr(cost)} · liefert bis zu ${flows(def.outputs, f.units)} pro Tag${Object.keys(def.inputs).length ? ` aus ${flows(def.inputs, f.units)}` : ''}</p>
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

export function fleetView({ w, me }: ViewCtx): string {
  const ships = shipsOf(w, me);
  if (!ships.length) return `<section class="card">${empty('Du hast noch kein Schiff. Frachter gibt es in der Werft auf Terra.')}<div class="acts">${btn('Zur Werft', 'tab', 'terra')}</div></section>`;
  const waiting = waitingTransports(w, me);
  const card = (s: Ship) => {
      const def = shipDef(s.model);
      const st = shipStatus(w, s);
      const critical = isCriticalShip(s);
      const jobs =
        s.phase === 'idle' && !critical
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
        s.phase === 'idle' && !atTerra ? btn('Nach Terra fliegen', 'to-terra', s.id) : '',
        s.phase === 'idle' && !atTerra && worn ? btn('Zur Reparatur nach Terra', 'repair-trip', s.id) : '',
        atTerra && worn ? btn(`Reparieren (${cr(repairShipCost(s))})`, 'repair-ship', s.id) : '',
        !atTerra && worn && s.phase !== 'repair'
          ? s.repairAtTerra
            ? btn('Reparatur vorgemerkt ✓ aufheben', 'repair-mark', `${s.id}|0`, 'class="on" data-tip="Hebt die Vormerkung auf; das Schiff wird auf Terra dann nicht automatisch repariert."')
            : btn(`Beim nächsten Terra-Stopp reparieren (~${cr(repairShipCost(s))})`, 'repair-mark', `${s.id}|1`, 'data-tip="Das Schiff fliegt weiter wie geplant und wird beim nächsten Halt auf Terra automatisch repariert."')
          : '',
        atTerra ? btn(`Verkaufen (${cr(Math.round(shipValue(s) * 0.6))})`, 'sell-ship', s.id, 'class="ghost"') : '',
      ].join('');
      const badge = critical
        ? '<span class="badge bad">kritisch</span>'
        : `<span class="badge ${st.cls}">${s.phase === 'idle' ? 'frei' : 'unterwegs'}</span>`;
      return `<section class="card ship-card cargo-${def.cargo}${critical ? ' critical' : ''}">
        <h2>${cargoIcon(def.cargo)} ${shipLabel(s)} ${badge}</h2>
        <p>${st.text}</p>
        ${critical ? `<p class="bad small"><b>Kritischer Zustand:</b> fliegt nur noch mit ${Math.round(CONFIG.ships.criticalSpeedFactor * 100)} % Tempo und nimmt keine neuen Aufträge an. ${s.phase === 'idle' ? (s.at === TERRA ? 'Jetzt reparieren.' : 'Schick es zur Reparatur nach Terra.') : 'Nach diesem Flug zur Reparatur nach Terra.'}</p>` : ''}
        ${loads.length > 1 ? `<p class="small">An Bord für diesen Flug: ${loads.map((t) => loadName(w, t)).join(' · ')}</p>` : ''}
        <p class="small muted">${qty(def.capacity, def.cargo)} Laderaum${room > 0 ? ` (noch ${qty(room, def.cargo)} frei für Zuladung)` : ''} · ${critical ? `<span class="bad">${num(shipSpeed(s))} Pc/Tag</span> (sonst ${num(def.speed)})` : `${num(def.speed)} Pc/Tag`} · Zustand <span class="${s.condition < 50 ? 'bad' : ''}">${dec(s.condition)} %</span>${s.condition < 50 && !critical ? ' – bald zur Reparatur nach Terra' : ''}${s.repairAtTerra ? ' · <span class="warn">Reparatur auf Terra vorgemerkt</span>' : ''}</p>
        ${acts ? `<div class="acts">${acts}</div>` : ''}
      </section>`;
  };

  // grouped by cargo type, each with its symbol; within a group the big ships first
  const order: Cargo[] = ['tank', 'bulk', 'piece', 'cooled', 'live'];
  return order
    .map((cargo) => {
      const group = ships
        .filter((s) => shipDef(s.model).cargo === cargo)
        .sort((a, b) => shipDef(b.model).capacity - shipDef(a.model).capacity || a.id.localeCompare(b.id, 'de', { numeric: true }));
      if (!group.length) return '';
      const idle = group.filter((s) => s.phase === 'idle' && !isCriticalShip(s)).length;
      const crit = group.filter(isCriticalShip).length;
      return `<h2 class="fleet-head cargo-${cargo}">${cargoIcon(cargo)} ${SHIP_KIND[cargo]} <span class="muted small">${group.length} ${group.length === 1 ? 'Schiff' : 'Schiffe'} · ${idle} frei${crit ? ` · <span class="bad">${crit} kritisch</span>` : ''} · für ${CARGO_GOODS(cargo)}${cargo === 'piece' ? ', Anlagen' : ''}</span></h2>
        ${group.map(card).join('')}`;
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
      return `<div class="row"><div class="grow"><b>${amt(d.amount, d.good)} ${gName(d.good)}</b> für ${who(w, d.requester)} <span class="price">${cr(value)}</span>
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
      return `<div class="row"><div class="grow"><b>${what}</b> für ${who(w, t.issuer)} <span class="price">${cr(t.fee)}</span>
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
          (d) => `<tr><td>${gName(d.good)}</td><td>${who(w, d.requester)}</td><td>${pName(d.toPlanet)}</td><td class="n">${amt(d.amount, d.good)}</td><td class="n">${perUnit(d.pricePerFe, d.good)}</td><td class="n">${cr(d.amount * d.pricePerFe)}</td></tr>`,
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
      (d) => `<div class="row"><div class="grow"><b>${amt(d.amount, d.good)} ${gName(d.good)}</b> an ${who(w, d.requester)} <div class="small">Zugesagt – ${deadlineIn(w, d.deadlineDay)}. ${unshippedAmount(d) < d.amount ? `${amt(d.amount - unshippedAmount(d), d.good)} sind unterwegs, für ${amt(unshippedAmount(d), d.good)} fehlt noch der Transport.` : 'Es fehlt noch der Transport.'}</div></div>
      <div class="acts">${btn('Transport organisieren…', 'arrange', d.id, 'class="primary" data-guide="arrange" data-tip="Wählt eigene Schiffe für die zugesagte Lieferung oder schreibt den Transport an der Börse aus."')}</div></div>`,
    )
    .join('');

  const waiting = waitingTransports(w, me)
    .map((t) => {
      const what = loadName(w, t);
      const ships = idleFittingShips(w, me, t.cargo, t.amount);
      return `<div class="row"><div class="grow"><b>${what}</b> ${route(t.fromPlanet, t.toPlanet)}
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
      return `<div class="row"><div class="grow"><b>${amt(t.amount, t.good!)} ${gName(t.good!)}</b> ${route(t.fromPlanet, t.toPlanet)}<div class="small">${state}${t.late ? ' · <span class="bad">Frist überzogen</span>' : ` · ${deadlineIn(w, t.deadlineDay)}`}</div></div>${t.status === 'open' && t.issuer === me ? `<div class="acts">${btn('Zurückziehen', 'unrelease', t.id)}</div>` : ''}</div>`;
    })
    .join('');

  const mine = w.demands
    .filter((d) => d.requester === me && ['open', 'accepted', 'shipping'].includes(d.status))
    .map((d) => {
      const state = d.status === 'open' ? 'Offen – wartet auf einen Lieferanten' : d.own ? 'Aus eigener Anlage' : `Liefert ${who(w, d.supplier)}`;
      return `<div class="row"><div class="grow"><b>${amt(d.amount, d.good)} ${gName(d.good)}</b> nach ${pName(d.toPlanet)} <span class="price">${perUnit(d.pricePerFe, d.good)}</span><div class="small">${state}</div></div>
      <div class="acts">${d.status === 'open' ? btn('Stornieren', 'cancel-demand', d.id, 'class="ghost"') : ''}</div></div>`;
    })
    .join('');

  if (!unshipped && !waiting && !running && !mine) {
    return `<section class="card">${empty('Keine laufenden Aufträge. Neue Aufträge findest du an der Börse; Rohstoffe für deine Anlagen bestellst du unter „Anlagen“ → „Ware bestellen“.')}<div class="acts">${btn('Zur Börse', 'tab', 'market')}</div></section>`;
  }
  return `
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
  return `
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
  const market =
    deliverableDemands(w, me).filter((o) => o.ready).length + openTransports(w, me).filter((t) => carryState(w, me, t) === 'idle').length;
  const orders = unshippedDemands(w, me).length + waitingTransports(w, me).filter((t) => t.kind === 'goods').length;
  const facilities =
    facilitiesOf(w, me).filter((f) => f.status === 'stopped').length +
    pendingAssets(w, me).filter((p) => p.transport?.status === 'accepted' && !p.transport.ship && p.transport.carrier === me).length;
  const fleet = shipsOf(w, me).filter((s) => s.phase === 'idle').length;
  return { market, orders, facilities, fleet };
}
