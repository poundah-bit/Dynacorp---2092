// Dialogs ("sheets") for moves that need a choice: loans, delivering, shipping, ordering goods.
// A sheet is static HTML plus a run() that reads the form and performs the move via play.ts / actions.

import {
  CONFIG,
  TERRA,
  available,
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
  minTransportFee,
  postDemand,
  repayLoan,
  shipDef,
  takeLoan,
  transport,
  type Cargo,
  type Result,
  type World,
} from '../sim/index';
import {
  carry,
  cheapestShipFor,
  defaultChoice,
  deliver,
  idleFittingShips,
  moveTransport,
  shipDemand,
  tripDays,
  type Choice,
} from './play';
import { cargoName, cr, days, fe, gName, pName, pc, perFe, shipStatus, who } from './format';

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
}

function choiceBlock(w: World, me: string, l: Load): string {
  const pick = defaultChoice(w, me, l.cargo, l.amount, l.from);
  const radio = (value: string, label: string, disabled = false) =>
    `<label class="opt${disabled ? ' dim' : ''}"><input type="radio" name="how" value="${value}" ${value === pick ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}</span></label>`;
  const own = idleFittingShips(w, me, l.cargo, l.amount)
    .map((s) => ({ s, d: tripDays(shipDef(s.model).speed, s.at ?? TERRA, l.from, l.to) }))
    .sort((a, b) => a.d - b.d)
    .map(({ s, d }) => radio(`ship:${s.id}`, `<b>${shipDef(s.model).name} #${s.id.slice(1)}</b> – ${shipStatus(w, s).text}<br><small>Ankunft am Ziel in ~${days(d)}</small>`))
    .join('');
  const model = cheapestShipFor(l.cargo, l.amount);
  const cash = company(w, me).cash;
  const buy = model
    ? radio(
        `buy:${model.id}`,
        `<b>Neuen ${model.name} kaufen</b> (${cr(model.price)}) und losschicken<br><small>${cash < model.price ? '<span class="bad">nicht genug Barkapital</span>' : `startet auf Terra, Ankunft am Ziel in ~${days(tripDays(model.speed, TERRA, l.from, l.to))}`}</small>`,
        cash < model.price,
      )
    : '';
  const min = minTransportFee(w, l.good, l.amount, l.from, l.to);
  const pub = l.allowPublic
    ? radio('public', `<b>Öffentlich ausschreiben</b> – eine andere Firma fliegt für ein Honorar<br><small>Honorar <input type="number" name="fee" min="${min}" step="100" value="${Math.ceil((min * 1.2) / 100) * 100}" inputmode="numeric"> Cr (mindestens ${cr(min)})</small>`)
    : '';
  return `<p class="small muted">${cargoName(l.cargo)}, ${fe(l.amount)} · ${pName(l.from)} → ${pName(l.to)} (${pc(distance(l.from, l.to))})</p>
    <div class="opts">${own}${buy}${pub}</div>${!own && !buy && !pub ? '<p class="bad">Kein passendes Schiff verfügbar.</p>' : ''}`;
}

const readChoice = (form: HTMLFormElement) => val(form, 'how') as Choice;
const readFee = (form: HTMLFormElement) => (val(form, 'fee') ? numVal(form, 'fee') : undefined);
const choiceMessage = (c: Choice) => (c === 'public' ? 'Transport an der Börse ausgeschrieben.' : 'Das Schiff ist unterwegs.');

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
  const what = t.kind === 'asset' ? 'Anlage' : `${fe(t.amount)} ${gName(t.good!)}`;
  return {
    title: `${what} nach ${pName(t.toPlanet)}`,
    body: `${t.kind === 'asset' ? '<p class="hint">Anlagen reisen als Stückgut. Ohne eigenen Stückgutfrachter kannst du einen kaufen oder den Flug an der Börse ausschreiben.</p>' : ''}
      ${choiceBlock(w, me, { cargo: t.cargo, amount: t.amount, from: t.fromPlanet, to: t.toPlanet, good: t.good, allowPublic: t.own && t.issuer === me })}`,
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
  const facs = facilitiesOf(w, me).filter((f) => d.good in facilityDef(f.type).outputs && available(f, d.good) >= d.amount);
  if (!facs.length) return { title: 'Liefern', body: '<p>Keine deiner Anlagen hat genug davon auf Lager.</p>' };
  const from = facs[0]!;
  const facChoice =
    facs.length > 1
      ? `<div class="opts">${facs
          .map((f, i) => `<label class="opt"><input type="radio" name="fac" value="${f.id}" ${i === 0 ? 'checked' : ''}><span>aus ${pName(f.planet)} (${fe(available(f, d.good))} frei)</span></label>`)
          .join('')}</div>`
      : `<input type="hidden" name="fac" value="${from.id}">`;
  return {
    title: `${fe(d.amount)} ${gName(d.good)} an ${who(w, d.requester)}`,
    body: `<p>Erlös bei Ankunft: <b>${cr(d.amount * d.pricePerFe)}</b> (${perFe(d.pricePerFe)}). Wer zu spät liefert, zahlt eine Strafe von ${Math.round(diff(w).penaltyRate * 100)} % des Warenwerts.</p>
      ${facChoice}
      <h3>Wie kommt die Ware hin?</h3>
      ${choiceBlock(w, me, { cargo: good(d.good).cargo, amount: d.amount, from: from.planet, to: d.toPlanet, good: d.good, allowPublic: true })}`,
    confirm: 'Annehmen',
    run(form) {
      const c = readChoice(form);
      if (!c) return { error: 'Bitte wähle, wie die Ware reisen soll.' };
      return done(deliver(w, me, demandId, val(form, 'fac'), c, readFee(form)), `Auftrag angenommen. ${choiceMessage(c)}`);
    },
  };
}

/** Arrange the transport for a demand the player has already accepted. */
export function arrangeSheet(w: World, me: string, demandId: string): Sheet {
  const d = demand(w, demandId);
  if (!d || d.status !== 'accepted' || !d.supplierFacility) return { title: 'Transport', body: '<p>Hier ist nichts mehr zu tun.</p>' };
  const from = facility(w, d.supplierFacility)!;
  return {
    title: `${fe(d.amount)} ${gName(d.good)} nach ${pName(d.toPlanet)}`,
    body: choiceBlock(w, me, { cargo: good(d.good).cargo, amount: d.amount, from: from.planet, to: d.toPlanet, good: d.good, allowPublic: true }),
    confirm: 'Los',
    run(form) {
      const c = readChoice(form);
      if (!c) return { error: 'Bitte wähle, wie die Ware reisen soll.' };
      return done(shipDemand(w, me, demandId, c, readFee(form)), choiceMessage(c));
    },
  };
}

export function carrySheet(w: World, me: string, transportId: string): Sheet {
  const t = transport(w, transportId);
  if (!t || t.status !== 'open') return { title: 'Transport', body: '<p>Dieser Transport ist nicht mehr offen – jemand war schneller.</p>' };
  const what = t.kind === 'asset' ? 'Anlage' : `${fe(t.amount)} ${gName(t.good!)}`;
  return {
    title: `${what} für ${who(w, t.issuer)}`,
    body: `<p>Honorar bei Ankunft: <b>${cr(t.fee)}</b>. Frist bis Tag ${t.deadlineDay} – wer sie überzieht, zahlt Strafe.</p>
      ${choiceBlock(w, me, { cargo: t.cargo, amount: t.amount, from: t.fromPlanet, to: t.toPlanet, good: t.good, allowPublic: false })}`,
    confirm: 'Übernehmen',
    run(form) {
      const c = readChoice(form);
      if (!c) return { error: 'Bitte wähle ein Schiff.' };
      return done(carry(w, me, transportId, c), 'Transport übernommen. Das Schiff ist unterwegs.');
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
  const { minAmount, maxAmount } = CONFIG.orders;
  return {
    title: `Ware bestellen für ${pName(f.planet)}`,
    body: `<p class="hint">Deine Nachfrage erscheint an der Börse. Wer annimmt, liefert – du zahlst den Kurs bei Ankunft. Hast du selbst eine Anlage, die die Ware herstellt, kannst du sie dort direkt abholen.</p>
      <div class="opts">${goodOpts}</div>
      <label class="field">Menge: <output name="amountOut"></output><input type="range" name="amount" min="${minAmount}" max="${maxAmount}" step="500" value="${maxAmount}"></label>
      <div class="opts" data-sources></div>`,
    confirm: 'Bestellen',
    live(form) {
      const g = val(form, 'good');
      const range = form.elements.namedItem('amount') as HTMLInputElement;
      const max = Math.max(minAmount, Math.min(maxAmount, Math.floor(room(g) / 500) * 500));
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
