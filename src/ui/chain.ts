// Production chain graph: every good as a node, from raw goods on the left to final goods (sold to Terra)
// on the right. Tapping a good highlights what it is made from and what it goes into, and the panel
// below says who produces it, who needs it and how the market stands. Pure HTML/SVG strings, no DOM.

import { FACILITIES, GOODS, PLANETS, facilitiesOf, facilityDef, good, type World } from '../sim/index';
import { cr, dec, esc, fe, gName, num, perFe, pName } from './format';

export interface ChainNode {
  id: string;
  col: number;
  row: number;
}

export interface ChainEdge {
  from: string; // input good
  to: string; // output good
  facility: string; // facility type that turns one into the other
}

/** Edges input → output for every facility. */
export const CHAIN_EDGES: ChainEdge[] = FACILITIES.flatMap((f) =>
  Object.keys(f.inputs).flatMap((i) => Object.keys(f.outputs).map((o) => ({ from: i, to: o, facility: f.id }))),
);

/** Column of a good: raw = 0, final goods in the last column, intermediates by their longest production path (so every line runs left to right). */
function depth(goodId: string, memo = new Map<string, number>()): number {
  const known = memo.get(goodId);
  if (known !== undefined) return known;
  memo.set(goodId, 0); // guards against cycles in the data
  const producers = FACILITIES.filter((f) => goodId in f.outputs);
  const d = producers.length
    ? Math.max(...producers.map((f) => (Object.keys(f.inputs).length ? 1 + Math.max(...Object.keys(f.inputs).map((i) => depth(i, memo))) : 0)))
    : 0;
  memo.set(goodId, d);
  return d;
}

/** Node layout: columns by depth, rows ordered by the average row of the inputs (fewer crossing lines). */
export function chainLayout(): ChainNode[] {
  const memo = new Map<string, number>();
  const inter = GOODS.filter((g) => g.tier === 'intermediate');
  const maxInter = Math.max(...inter.map((g) => depth(g.id, memo)));
  const colOf = (id: string) => (good(id).tier === 'raw' ? 0 : good(id).tier === 'final' ? maxInter + 1 : depth(id, memo));
  const cols = new Map<number, string[]>();
  for (const g of GOODS) {
    const c = colOf(g.id);
    cols.set(c, [...(cols.get(c) ?? []), g.id]);
  }
  const rowOf = new Map<string, number>();
  for (const c of [...cols.keys()].sort((a, b) => a - b)) {
    const ids = cols.get(c)!;
    const score = (id: string) => {
      const ins = CHAIN_EDGES.filter((e) => e.to === id && rowOf.has(e.from)).map((e) => rowOf.get(e.from)!);
      return ins.length ? ins.reduce((s, x) => s + x, 0) / ins.length : 0;
    };
    if (c > 0) ids.sort((a, b) => score(a) - score(b));
    // spread the column over the height of the tallest column
    ids.forEach((id, i) => rowOf.set(id, i));
  }
  const tallest = Math.max(...[...cols.values()].map((l) => l.length));
  return GOODS.map((g) => {
    const c = colOf(g.id);
    const n = cols.get(c)!.length;
    const i = rowOf.get(g.id)!;
    // centre short columns
    return { id: g.id, col: c, row: i + (tallest - n) / 2 };
  });
}

export interface GoodRole {
  produce: boolean; // one of the player's facilities makes it
  need: boolean; // one of the player's facilities consumes it
  missing: boolean; // needed, but a running facility has none on stock
}

export function goodRoles(w: World, me: string): Record<string, GoodRole> {
  const roles: Record<string, GoodRole> = Object.fromEntries(GOODS.map((g) => [g.id, { produce: false, need: false, missing: false }]));
  for (const f of facilitiesOf(w, me)) {
    const def = facilityDef(f.type);
    for (const g of Object.keys(def.outputs)) roles[g]!.produce = true;
    for (const g of Object.keys(def.inputs)) {
      roles[g]!.need = true;
      if (f.status !== 'construction' && (f.stock[g] ?? 0) <= 0) roles[g]!.missing = true;
    }
  }
  return roles;
}

const W = 128; // node width
const H = 40; // node height
const GX = 170; // column distance
const GY = 54; // row distance
const PAD = 8;

/** SVG of the whole chain; `selected` highlights a good and its direct neighbours. */
export function chainSvg(w: World, me: string, selected: string, trend: (id: string) => -1 | 0 | 1): string {
  const nodes = chainLayout();
  const pos = new Map(nodes.map((n) => [n.id, { x: PAD + n.col * GX, y: PAD + n.row * GY }]));
  const roles = goodRoles(w, me);
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;
  const width = PAD * 2 + (cols - 1) * GX + W;
  const height = PAD * 2 + (rows - 1) * GY + H;
  const near = new Set(selected ? [selected, ...CHAIN_EDGES.filter((e) => e.from === selected).map((e) => e.to), ...CHAIN_EDGES.filter((e) => e.to === selected).map((e) => e.from)] : []);

  // one line per input → output pair (a facility with two outputs draws two lines)
  const seen = new Set<string>();
  const edges = CHAIN_EDGES.filter((e) => {
    const k = `${e.from}>${e.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
    .map((e) => {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const x1 = a.x + W;
      const y1 = a.y + H / 2;
      const x2 = b.x;
      const y2 = b.y + H / 2;
      const mx = (x1 + x2) / 2;
      const on = selected && (e.from === selected || e.to === selected);
      const cls = selected ? (on ? 'edge on' : 'edge off') : 'edge';
      return `<path class="${cls}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    })
    .join('');

  const nodeSvg = nodes
    .map((n) => {
      const p = pos.get(n.id)!;
      const g = good(n.id);
      const price = w.prices[n.id] ?? g.basePrice;
      const t = trend(n.id);
      const r = roles[n.id]!;
      const cls = ['node', g.tier, r.produce ? 'mine' : '', r.missing ? 'missing' : r.need ? 'need' : '', selected === n.id ? 'sel' : '', selected && !near.has(n.id) ? 'off' : '']
        .filter(Boolean)
        .join(' ');
      const arrow = t > 0 ? '▲' : t < 0 ? '▼' : '';
      return `<g class="${cls}" data-act="chain-good" data-a="${n.id}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="${esc(g.name)}">
        <rect width="${W}" height="${H}" rx="8"/>
        <text x="10" y="17" class="name">${esc(g.name)}</text>
        <text x="10" y="32" class="price">${dec(price)} Cr ${arrow}</text>
      </g>`;
    })
    .join('');

  const heads = ['Rohstoffe', ...Array.from({ length: cols - 2 }, (_, i) => (i === 0 ? 'Zwischenprodukte' : '')), 'Endprodukte → Terra'];
  const headSvg = heads.map((h, i) => (h ? `<text class="head" x="${PAD + i * GX}" y="12">${h}</text>` : '')).join('');

  return `<svg class="chain" viewBox="0 -14 ${width} ${height + 14}" width="${width}" height="${height + 14}" role="img" aria-label="Warenketten">${headSvg}${edges}${nodeSvg}</svg>`;
}

/** Detail panel for one good: producers, consumers, market. */
export function chainDetail(w: World, me: string, goodId: string): string {
  if (!goodId) return '<p class="hint">Tippe auf eine Ware: Du siehst, woraus sie entsteht, wohin sie geht und wer sie herstellt.</p>';
  const g = good(goodId);
  const price = w.prices[goodId] ?? g.basePrice;
  const producers = FACILITIES.filter((f) => goodId in f.outputs);
  const consumers = FACILITIES.filter((f) => goodId in f.inputs);
  const where = (type: string) => {
    const planets = PLANETS.filter((p) => p.facility === type).map((p) => p.id);
    const built = w.facilities.filter((f) => f.type === type);
    const units = built.reduce((s, f) => s + f.units, 0);
    const mine = built.filter((f) => f.owner === me).reduce((s, f) => s + f.units, 0);
    return `${planets.map(pName).join(', ')} · ${units ? `${num(units)} in Betrieb${mine ? `, davon ${num(mine)} deine` : ''}` : 'noch niemand'}`;
  };
  const line = (type: string, io: 'in' | 'out') => {
    const def = facilityDef(type);
    const other = io === 'out' ? def.inputs : def.outputs;
    const what = Object.entries(other)
      .map(([id, n]) => `${fe(n)} ${gName(id)}`)
      .join(' + ');
    return `<li><b>${def.name}</b> ${io === 'out' ? (what ? `aus ${what}` : '(Rohstoff)') : what ? `→ ${what}` : ''}<div class="small muted">${where(type)}</div></li>`;
  };
  const open = w.demands.filter((d) => d.good === goodId && d.status === 'open');
  const openFe = open.reduce((s, d) => s + d.amount, 0);
  const myStock = facilitiesOf(w, me).reduce((s, f) => s + (f.stock[goodId] ?? 0), 0);
  return `<h3>${esc(g.name)} <span class="muted small">${g.tier === 'raw' ? 'Rohstoff' : g.tier === 'final' ? 'Endprodukt – Terra kauft es immer' : 'Zwischenprodukt'}</span></h3>
    <p>Kurs <b>${perFe(price)}</b> <span class="muted">(Basis ${num(g.basePrice)})</span> · offene Nachfragen ${num(open.length)} über ${fe(openFe)}${open.length ? ` · Wert ${cr(open.reduce((s, d) => s + d.amount * d.pricePerFe, 0))}` : ''}${myStock ? ` · in deinen Lagern ${fe(myStock)}` : ''}</p>
    <div class="chain-io">
      <div><h4>Hergestellt von</h4><ul>${producers.map((f) => line(f.id, 'out')).join('') || '<li class="muted">–</li>'}</ul></div>
      <div><h4>Gebraucht von</h4><ul>${consumers.map((f) => line(f.id, 'in')).join('') || (g.tier === 'final' ? '<li>Terra</li>' : '<li class="muted">–</li>')}</ul></div>
    </div>`;
}
