// Dialogs ("sheets") for moves that need a choice: loans, delivering, shipping, ordering goods.
// A sheet is static HTML plus a run() that reads the form and performs the move via play.ts / actions.

import {
  CONFIG,
  STORAGES,
  TERRA,
  available,
  buyStorage,
  company,
  creditLimit,
  demand,
  diff,
  distance,
  facilitiesOf,
  facility,
  facilityDef,
  freeCapacity,
  good,
  incoming,
  maxOrderAmount,
  minTransportFee,
  postDemand,
  repayLoan,
  shipDef,
  storageCapacity,
  storageDef,
  takeLoan,
  transport,
  unshippedAmount,
  type Cargo,
  type Result,
  type World,
} from '../sim/index';
import {
  acceptDeadline,
  carry,
  cheapestShipFor,
  latePenalty,
  readiness,
  defaultChoice,
  defaultPlan,
  deliver,
  idleFittingShips,
  idleShipsOfCargo,
  moveTransport,
  shipDemand,
  tripDays,
  type Choice,
  type ShipPlan,
} from './play';
import { cargoName, cr, days, deadlineIn, fe, gName, inDays, loadName, pName, pc, perFe, shipStatus, who } from './format';

export interface SheetResult {
  error?: string;
  message?: string;
  next?: Sheet;
}

export interface Sheet {
  title: string;
  body: string;
  confirm?: string;
  run?: (form: HTMLFormElement) => SheetResult;
  live?: (form: HTMLFormElement) => void;
}

const val = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '');
const numVal = (form: HTMLFormElement, name: string) => Number(val(form, name)) || 0;
const done = <T>(r: Result<T>, message: string, next?: Sheet): SheetResult => (r.ok ? { message, next } : { error: r.error });

// ---------- shared: which ship moves the load ----------

interface Load {
  cargo: Cargo;
  amount: number;
  from: string;
  to: string;
  good: string | null;
  allowPublic: boolean;
  /** buying a new ship right here – only for facilities and storage from DYNATECH */
  allowBuy?: boolean;
  /** days until the goods are produced (accepted early) */
  readyIn?: number;
}

const route = (l: Load) => `<p class="small muted">${cargoName(l.cargo)}, ${fe(l.amount)} · ${pName(l.from)} → ${pName(l.to)} (${pc(distance(l.from, l.to))})</p>`;
const feeInput = (min: number) =>
  `Honorar <input type="number" name="fee" min="${min}" step="100" value="${Math.ceil((min * 1.2) / 100) * 100}" inputmode="numeric"> Cr (mindestens <span data-fee-min>${cr(min)}</span>)`;
const noShipHint = (cargo: Cargo) => `Kein freies eigenes Schiff für ${cargoName(cargo)}. Schiffe gibt es in der Werft auf Terra.`;

/** One ship for one load (a facility from Terra, another company's transport). */
function choiceBlock(w: World, me: string, l: Load): string {
  const pick = defaultChoice(w, me, l.cargo, l.amount, l.from, l.allowBuy);
  const radio = (value: string, label: string, disabled = false) =>
    `<label class="opt${disabled ? ' dim' : ''}"><input type="radio" name="how" value="${value}" ${value === pick ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}</span></label>`;
  const own = idleFittingShips(w, me, l.cargo, l.amount)
    .map((s) => ({ s, d: tripDays(shipDef(s.model).speed, s.at ?? TERRA, l.from, l.to, l.readyIn) }))
    .sort((a, b) => a.d - b.d)
    .map(({ s, d }) => radio(`ship:${s.id}`, `<b>${shipDef(s.model).name} #${s.id.slice(1)}</b> – ${shipStatus(w, s).text}<br><small>Ankunft am Ziel ${inDays(d)}</small>`))
    .join('');
  const model = l.allowBuy ? cheapestShipFor(l.cargo, l.amount) : undefined;
  const cash = company(w, me).cash;
  const buy = model
    ? radio(
        `buy:${model.id}`,
        `<b>Neuen ${model.name} kaufen</b> (${cr(model.price)}) und losschicken<br><small>${cash < model.price ? '<span class="bad">nicht genug Barkapital</span>' : `startet auf Terra, Ankunft am Ziel ${inDays(tripDays(model.speed, TERRA, l.from, l.to, l.readyIn))}`}</small>`,
        cash < model.price,
      )
    : '';
  const pub = l.allowPublic
    ? radio('public', `<b>Öffentlich ausschreiben</b> – eine andere Firma fliegt für ein Honorar<br><small>${feeInput(minTransportFee(w, l.good, l.amount, l.from, l.to))}</small>`)
    : '';
  return `${route(l)}<div class="opts">${own}${buy}${pub}</div>${!own && !buy ? `<p class="hint">${noShipHint(l.cargo)}</p>` : ''}`;
}

/**
 * One or several own ships for a demand. Whatever the selected ships cannot carry is posted
 * publicly or arranged later under "Aufträge". The live() part keeps the summary and fee current.
 */
function planBlock(w: World, me: string, l: Load): string {
  const pick = new Set(defaultPlan(w, me, l.cargo, l.amount, l.from).ships);
  const ships = idleShipsOfCargo(w, me, l.cargo)
    .map((s) => ({ s, d: tripDays(shipDef(s.model).speed, s.at ?? TERRA, l.from, l.to, l.readyIn) }))
    .sort((a, b) => a.d - b.d)
    .map(
      ({ s, d }) => `<label class="opt"><input type="checkbox" name="ship" value="${s.id}" data-cap="${shipDef(s.model).capacity}" ${pick.has(s.id) ? 'checked' : ''}>
        <span><b>${shipDef(s.model).name} #${s.id.slice(1)}</b> – ${fe(shipDef(s.model).capacity)} Laderaum – ${shipStatus(w, s).text}<br><small>Ankunft am Ziel ${inDays(d)}</small></span></label>`,
    )
    .join('');
  return `${route(l)}
    ${ships ? `<div class="opts">${ships}</div>` : `<p class="hint">${noShipHint(l.cargo)}</p>`}
    <p class="preview" data-plan-summary></p>
    <div data-rest>
      <div class="opts">
        <label class="opt"><input type="radio" name="rest" value="public" checked><span><b>Rest öffentlich ausschreiben</b> – eine andere Firma fliegt für ein Honorar<br><small>${feeInput(minTransportFee(w, l.good, l.amount, l.from, l.to))}</small></span></label>
        <label class="opt"><input type="radio" name="rest" value="later"><span><b>Rest später organisieren</b> – unter „Aufträge“, z. B. wenn ein Schiff frei wird</span></label>
      </div>
    </div>`;
}

/** Updates the plan summary, shows the rest options only when needed and adapts the minimum fee to the rest. */
function planLive(w: World, l: Load, form: HTMLFormElement) {
  const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="ship"]:checked'));
  const cap = boxes.reduce((s, b) => s + Number(b.dataset.cap), 0);
  const rest = Math.max(0, l.amount - cap);
  const summary = form.querySelector<HTMLElement>('[data-plan-summary]')!;
  summary.innerHTML = boxes.length
    ? `${boxes.length === 1 ? '1 Schiff' : `${boxes.length} Schiffe`} mit ${fe(cap)} Laderaum – ${rest ? `es bleiben <b>${fe(rest)}</b>.` : 'das reicht für die ganze Menge.'}`
    : `Kein eigenes Schiff gewählt – die ganzen ${fe(l.amount)} gehen an die Börse oder warten.`;
  form.querySelector<HTMLElement>('[data-rest]')!.hidden = rest === 0;
  const fee = form.elements.namedItem('fee') as HTMLInputElement | null;
  if (fee && rest > 0 && fee.dataset.rest !== String(rest)) {
    const min = minTransportFee(w, l.good, rest, l.from, l.to);
    fee.min = String(min);
    fee.value = String(Math.ceil((min * 1.2) / 100) * 100);
    fee.dataset.rest = String(rest);
    form.querySelector('[data-fee-min]')!.textContent = cr(min);
  }
}

const readChoice = (form: HTMLFormElement) => val(form, 'how') as Choice;
const readFee = (form: HTMLFormElement) => (val(form, 'fee') ? numVal(form, 'fee') : undefined);
const choiceMessage = (c: Choice) => (c === 'public' ? 'Transport an der Börse ausgeschrieben.' : 'Das Schiff ist unterwegs.');
const readPlan = (form: HTMLFormElement): ShipPlan => ({
  ships: new FormData(form).getAll('ship').map(String),
  rest: val(form, 'rest') === 'later' ? 'later' : 'public',
  fee: readFee(form),
});
const planMessage = (p: ShipPlan) =>
  p.ships.length ? (p.ships.length === 1 ? 'Das Schiff ist unterwegs.' : `${p.ships.length} Schiffe sind unterwegs.`) : p.rest === 'public' ? 'Transport an der Börse ausgeschrieben.' : 'Den Transport organisierst du unter „Aufträge“.';

// ---------- bank ----------

export function loanSheet(w: World, me: string): Sheet {
  const limit = Math.floor(creditLimit(w, me) / 10000) * 10000;
  if (limit < 10000) return { title: 'Kredit aufnehmen', body: '<p>Dein Kreditrahmen ist ausgeschöpft.</p>' };
  const delta = company(w, me).isPlayer ? diff(w).interestDelta : 0;
  const terms = CONFIG.credit.terms
    .map(
      (t, i) =>
        `<label class="opt"><input type="radio" name="term" value="${i}" ${i === CONFIG.credit.terms.length - 1 ? 'checked' : ''}><span><b>${days(t.days)}</b> · ${Math.round((t.interest + delta) * 1000) / 10} % Zins auf die ganze Laufzeit</span></label>`,
    )
    .join('');
  return {
    title: 'Kredit aufnehmen',
    body: `<p class="hint">Tipp aus dem Handbuch: zu Beginn den höchsten Betrag mit der längsten Laufzeit nehmen – dann ist die Tagesrate am niedrigsten.</p>
      <label class="field">Betrag: <output name="amountOut">${cr(limit)}</output>
        <input type="range" name="amount" min="10000" max="${limit}" step="10000" value="${limit}"></label>
      <div class="opts">${terms}</div>
      <p class="preview" data-preview></p>`,
    confirm: 'Kredit aufnehmen',
    live(form) {
      const amount = numVal(form, 'amount');
      const term = CONFIG.credit.terms[numVal(form, 'term')]!;
      const total = Math.round(amount * (1 + Math.max(0, term.interest + delta)));
      (form.elements.namedItem('amountOut') as HTMLOutputElement).value = cr(amount);
      form.querySelector('[data-preview]')!.innerHTML = `Du zahlst insgesamt <b>${cr(total)}</b> zurück: <b>${cr(Math.ceil(total / term.days))}</b> pro Tag, ${days(term.days)} lang.`;
    },
    run(form) {
      const r = takeLoan(w, me, numVal(form, 'amount'), numVal(form, 'term'));
      return done(r, 'Der Kredit ist auf deinem Konto.');
    },
  };
}

export function repaySheet(w: World, me: string, loanId: string): Sheet {
  const loan = company(w, me).loans.find((l) => l.id === loanId);
  if (!loan) return { title: 'Kredit tilgen', body: '<p>Diesen Kredit gibt es nicht mehr.</p>' };
  const max = Math.floor(Math.min(loan.remaining, Math.max(0, company(w, me).cash)));
  if (max < 1000) return { title: 'Kredit tilgen', body: '<p>Dafür fehlt dir gerade das Barkapital.</p>' };
  return {
    title: 'Kredit tilgen',
    body: `<p>Restschuld ${cr(loan.remaining)}. Sondertilgung kostet keine Gebühr.</p>
      <label class="field">Betrag: <output name="amountOut">${cr(max)}</output>
      <input type="range" name="amount" min="1000" max="${max}" step="1000" value="${max}"></label>`,
    confirm: 'Tilgen',
    live(form) {
      (form.elements.namedItem('amountOut') as HTMLOutputElement).value = cr(numVal(form, 'amount'));
    },
    run(form) {
      return done(repayLoan(w, me, loanId, numVal(form, 'amount')), 'Getilgt.');
    },
  };
}

// ---------- transports ----------

/** Fly an own transport (e.g. a new facility) or one the player has taken on. */
export function moveSheet(w: World, me: string, transportId: string): Sheet {
  const t = transport(w, transportId);
  if (!t) return { title: 'Transport', body: '<p>Diesen Transport gibt es nicht mehr.</p>' };
  const what = loadName(w, t);
  const asset = t.kind === 'asset';
  return {
    title: `${what} nach ${pName(t.toPlanet)}`,
    body: `${asset ? '<p class="hint">Anlagen und Lager reisen als Stückgut. Ohne eigenen Stückgutfrachter kannst du hier gleich einen kaufen oder den Flug an der Börse ausschreiben.</p>' : ''}
      ${choiceBlock(w, me, { cargo: t.cargo, amount: t.amount, from: t.fromPlanet, to: t.toPlanet, good: t.good, allowPublic: t.own && t.issuer === me, allowBuy: asset })}`,
    confirm: 'Los',
    run(form) {
      const c = readChoice(form);
      if (!c) return { error: 'Bitte wähle, wie die Ladung reisen soll.' };
      return done(moveTransport(w, me, transportId, c, readFee(form)), choiceMessage(c));
    },
  };
}

export function deliverSheet(w: World, me: string, demandId: string): Sheet {
  const d = demand(w, demandId);
  if (!d || d.status !== 'open') return { title: 'Liefern', body: '<p>Diese Nachfrage ist nicht mehr offen – jemand war schneller.</p>' };
  const facs = facilitiesOf(w, me)
    .filter((f) => d.good in facilityDef(f.type).outputs && readiness(f, d.good, d.amount).fits)
    .sort((a, b) => readiness(a, d.good, d.amount).daysToReady - readiness(b, d.good, d.amount).daysToReady);
  if (!facs.length) return { title: 'Liefern', body: '<p>Die Menge passt in keines deiner Anlagenlager. Mit einem Zusatzlager unter „Anlagen“ geht es.</p>' };
  const from = facs[0]!;
  const stockText = (f: (typeof facs)[number]) => {
    const r = readiness(f, d.good, d.amount);
    if (!r.missing) return `${fe(r.free)} frei – sofort ladbar`;
    return `${fe(Math.max(0, r.free))} frei, es fehlen ${fe(r.missing)}${r.daysToReady < Infinity ? ` (~${days(r.daysToReady)} Produktion)` : ' – die Anlage produziert gerade nicht'}`;
  };
  const facChoice =
    facs.length > 1
      ? `<div class="opts">${facs
          .map((f, i) => `<label class="opt"><input type="radio" name="fac" value="${f.id}" ${i === 0 ? 'checked' : ''}><span>aus ${pName(f.planet)}: ${stockText(f)}</span></label>`)
          .join('')}</div>`
      : `<input type="hidden" name="fac" value="${from.id}"><p>Aus ${pName(from.planet)}: ${stockText(from)}.</p>`;
  const r = readiness(from, d.good, d.amount);
  const deadline = acceptDeadline(w, d, from) - w.day;
  const risk = r.missing
    ? `<p class="warn-box"><b>Risiko:</b> Die Ware ist noch nicht komplett. Dein Schiff wartet an der Anlage, bis genug produziert ist – solange laufen seine Betriebskosten.
       Nach der Annahme bleiben etwa ${days(deadline)} bis zur Frist. Wird sie überschritten, zahlst du rund ${cr(latePenalty(w, d))} Strafe an ${who(w, d.requester)}.</p>`
    : `<p class="small muted">Nach der Annahme bleiben etwa ${days(deadline)} bis zur Frist.</p>`;
  const load: Load = { cargo: good(d.good).cargo, amount: d.amount, from: from.planet, to: d.toPlanet, good: d.good, allowPublic: true, readyIn: Number.isFinite(r.daysToReady) ? r.daysToReady : 0 };
  return {
    title: `${fe(d.amount)} ${gName(d.good)} an ${who(w, d.requester)}`,
    body: `<p>Erlös bei Ankunft: <b>${cr(d.amount * d.pricePerFe)}</b> (${perFe(d.pricePerFe)}). Wer zu spät liefert, zahlt eine Strafe von ${Math.round(diff(w).penaltyRate * 100)} % des Warenwerts.</p>
      ${facChoice}${risk}
      <h3>Wie kommt die Ware hin?</h3>
      ${planBlock(w, me, load)}`,
    confirm: 'Annehmen',
    live: (form) => planLive(w, load, form),
    run(form) {
      const plan = readPlan(form);
      return done(deliver(w, me, demandId, val(form, 'fac'), plan), `Auftrag angenommen. ${planMessage(plan)}`);
    },
  };
}

/** Arrange the transport for a demand the player has accepted (or the part of it that is not shipped yet). */
export function arrangeSheet(w: World, me: string, demandId: string): Sheet {
  const d = demand(w, demandId);
  if (!d || d.status !== 'accepted' || !d.supplierFacility) return { title: 'Transport', body: '<p>Hier ist nichts mehr zu tun.</p>' };
  const from = facility(w, d.supplierFacility)!;
  const open = unshippedAmount(d);
  const load: Load = { cargo: good(d.good).cargo, amount: open, from: from.planet, to: d.toPlanet, good: d.good, allowPublic: true };
  return {
    title: `${fe(open)} ${gName(d.good)} nach ${pName(d.toPlanet)}`,
    body: `${open < d.amount ? `<p>Von ${fe(d.amount)} sind ${fe(d.amount - open)} schon unterwegs.</p>` : ''}<p class="small">${deadlineIn(w, d.deadlineDay)}</p>${planBlock(w, me, load)}`,
    confirm: 'Los',
    live: (form) => planLive(w, load, form),
    run(form) {
      const plan = readPlan(form);
      return done(shipDemand(w, me, demandId, plan), planMessage(plan));
    },
  };
}

export function carrySheet(w: World, me: string, transportId: string): Sheet {
  const t = transport(w, transportId);
  if (!t || t.status !== 'open') return { title: 'Transport', body: '<p>Dieser Transport ist nicht mehr offen – jemand war schneller.</p>' };
  const what = loadName(w, t);
  return {
    title: `${what} für ${who(w, t.issuer)}`,
    body: `<p>Honorar bei Ankunft: <b>${cr(t.fee)}</b>. ${deadlineIn(w, t.deadlineDay)} – wer sie überzieht, zahlt Strafe.</p>
      ${choiceBlock(w, me, { cargo: t.cargo, amount: t.amount, from: t.fromPlanet, to: t.toPlanet, good: t.good, allowPublic: false })}`,
    confirm: 'Übernehmen',
    run(form) {
      const c = readChoice(form);
      if (!c) return { error: 'Bitte wähle eines deiner freien Schiffe.' };
      return done(carry(w, me, transportId, c), 'Transport übernommen. Das Schiff ist unterwegs.');
    },
  };
}

// ---------- extra storage ----------

export function storageSheet(w: World, me: string, facilityId: string): Sheet {
  const f = facility(w, facilityId);
  if (!f) return { title: 'Lager erweitern', body: '<p>Die Anlage gibt es nicht mehr.</p>' };
  const def = facilityDef(f.type);
  const goods = [...Object.keys(def.inputs), ...Object.keys(def.outputs)];
  const cargos = [...new Set(goods.map((g) => good(g).cargo))];
  const cash = company(w, me).cash;
  const groups = cargos
    .map((cargo) => {
      const its = goods.filter((g) => good(g).cargo === cargo);
      const now = its.map((g) => `${gName(g)} ${fe(storageCapacity(f, g))}`).join(', ');
      const opts = STORAGES.filter((s) => s.cargo === cargo)
        .map(
          (s) => `<label class="opt${cash < s.price ? ' dim' : ''}"><input type="radio" name="storage" value="${s.id}" ${cash < s.price ? 'disabled' : ''}>
            <span><b>${s.name}</b> +${fe(s.capacity)} · ${cr(s.price)}<br><small>Kosten ${cr(s.maintenance + s.operation)} pro Tag · reist als Stückgut ${fe(s.size)}</small></span></label>`,
        )
        .join('');
      return `<h3>${cargoName(cargo)} <span class="small muted">– heute: ${now}</span></h3><div class="opts">${opts}</div>`;
    })
    .join('');
  return {
    title: `Lager erweitern: ${pName(f.planet)}`,
    body: `<p class="hint">Ein Zusatzlager vergrößert das Lager für alle Waren seiner Frachtart an dieser Anlage. Es wird bei DYNATECH gekauft und wie eine Anlage als Stückgut hingeflogen.</p>${groups}`,
    confirm: 'Kaufen',
    run(form) {
      const id = val(form, 'storage');
      if (!id) return { error: 'Bitte wähle ein Lager.' };
      const r = buyStorage(w, me, id, facilityId);
      if (!r.ok) return { error: r.error };
      return { message: `${storageDef(id).name} gekauft. Jetzt muss es noch hingeflogen werden.`, next: moveSheet(w, me, r.value.id) };
    },
  };
}

// ---------- ordering inputs ----------

export function orderSheet(w: World, me: string, facilityId: string): Sheet {
  const f = facility(w, facilityId);
  if (!f) return { title: 'Ware bestellen', body: '<p>Die Anlage gibt es nicht mehr.</p>' };
  const def = facilityDef(f.type);
  const goods = Object.keys(def.inputs);
  const room = (g: string) => Math.max(0, freeCapacity(f, g) - incoming(w, f.id, g));
  const first = goods.sort((a, b) => (f.stock[a] ?? 0) / def.inputs[a]! - (f.stock[b] ?? 0) / def.inputs[b]!)[0]!;
  const goodOpts = goods
    .map(
      (g) =>
        `<label class="opt"><input type="radio" name="good" value="${g}" ${g === first ? 'checked' : ''}><span><b>${gName(g)}</b> – Lager ${fe(f.stock[g] ?? 0)}, bestellt ${fe(incoming(w, f.id, g))}, Platz für ${fe(room(g))} · Kurs ${perFe(w.prices[g] ?? 0)}</span></label>`,
    )
    .join('');
  const { minAmount } = CONFIG.orders;
  // the biggest own ship of the cargo sets the limit (at least the standard maximum)
  const maxFor = (g: string) => maxOrderAmount(w, me, g);
  return {
    title: `Ware bestellen für ${pName(f.planet)}`,
    body: `<p class="hint">Deine Nachfrage erscheint an der Börse. Wer annimmt, liefert – du zahlst den Kurs bei Ankunft. Hast du selbst eine Anlage, die die Ware herstellt, kannst du sie dort direkt abholen.</p>
      <div class="opts">${goodOpts}</div>
      <label class="field">Menge: <output name="amountOut"></output><input type="range" name="amount" min="${minAmount}" max="${maxFor(first)}" step="500" value="${Math.min(maxFor(first), Math.max(minAmount, Math.floor(room(first) / 500) * 500))}"></label>
      <p class="small muted" data-max-hint></p>
      <div class="opts" data-sources></div>`,
    confirm: 'Bestellen',
    live(form) {
      const g = val(form, 'good');
      const range = form.elements.namedItem('amount') as HTMLInputElement;
      const max = Math.max(minAmount, Math.min(maxFor(g), Math.floor(room(g) / 500) * 500));
      form.querySelector('[data-max-hint]')!.textContent = `Höchstens ${fe(maxFor(g))} pro Bestellung – mit einem größeren eigenen Schiff für ${cargoName(good(g).cargo)} mehr. Platz im Lager: ${fe(room(g))}.`;
      range.max = String(max);
      if (Number(range.value) > max) range.value = String(max);
      const amount = Number(range.value);
      (form.elements.namedItem('amountOut') as HTMLOutputElement).value = `${fe(amount)} (≈ ${cr(amount * (w.prices[g] ?? 0))})`;
      const own = facilitiesOf(w, me).filter((x) => g in facilityDef(x.type).outputs);
      const box = form.querySelector('[data-sources]')!;
      const current = val(form, 'src') || 'public';
      box.innerHTML =
        `<label class="opt"><input type="radio" name="src" value="public" ${current === 'public' ? 'checked' : ''}><span>Öffentlich an der Börse</span></label>` +
        own
          .map((x) => {
            const ok = available(x, g) >= amount;
            return `<label class="opt${ok ? '' : ' dim'}"><input type="radio" name="src" value="${x.id}" ${ok ? '' : 'disabled'} ${current === x.id && ok ? 'checked' : ''}><span>Aus eigener Anlage auf ${pName(x.planet)} (${fe(available(x, g))} frei)</span></label>`;
          })
          .join('');
    },
    run(form) {
      const src = val(form, 'src');
      const r = postDemand(w, me, facilityId, val(form, 'good'), numVal(form, 'amount'), src && src !== 'public' ? src : undefined);
      if (!r.ok) return { error: r.error };
      if (r.value.own) return { message: 'Eigen-Nachfrage angelegt. Jetzt fehlt noch der Transport.', next: arrangeSheet(w, me, r.value.id) };
      return { message: 'Nachfrage an der Börse eingestellt.' };
    },
  };
}
