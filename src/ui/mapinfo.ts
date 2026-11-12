// Info panel under the star map for the tapped planet. Pure HTML strings; buttons use the same
// data-act handlers as the tabs (buy-facility, tab, …).

import { CONFIG, TERRA, company, distance, facilityDef, planet, shipDef, shipsOf, type World } from '../sim/index';
import { cr, dec, esc, flows, num, pc, shipStatus } from './format';
import { facilityIcon, icon } from './icons';

const btn = (label: string, act: string, a = '', extra = '') => `<button data-act="${act}" data-a="${esc(a)}" ${extra}>${label}</button>`;

export function planetInfo(w: World, me: string, id: string): string {
  if (!id) return '<p class="hint">Tippe auf einen Planeten für Details. Ziehen verschiebt die Karte, zwei Finger oder das Mausrad zoomen.</p>';
  const p = planet(id);
  const far = distance(TERRA, id);
  const storm = far > CONFIG.events.outerRingParsec;
  const myShips = shipsOf(w, me).filter((s) => s.at === id || s.route?.to === id);
  const shipList = myShips.length
    ? `<ul class="plain small">${myShips.map((s) => `<li>${shipDef(s.model).name}: ${shipStatus(w, s).text}</li>`).join('')}</ul>`
    : '';

  if (!p.facility) {
    return `<h3>${esc(p.name)} <span class="muted small">Zentrum</span></h3>
      <p class="small">Bank, Dynacore und Werft. Terra kauft alle Endprodukte und – je billiger, desto mehr – auch alle anderen Waren.</p>
      ${shipList}
      <div class="acts">${btn('Zu Terra', 'tab', 'terra', 'class="primary"')}</div>`;
  }

  const def = facilityDef(p.facility);
  const here = w.facilities.filter((f) => f.planet === id);
  const mine = here.find((f) => f.owner === me);
  const owners = here
    .filter((f) => f.owner !== me)
    .map((f) => `${esc(company(w, f.owner).name)}${f.units > 1 ? ` (${f.units}×)` : ''}`)
    .join(', ');
  const c = company(w, me);
  const buy = btn(
    mine ? `Ausbauen (${cr(def.price)})` : `Kaufen (${cr(def.price)})`,
    'buy-facility',
    `${def.id}|${id}`,
    `class="${mine ? '' : 'primary'}" ${c.cash < def.price ? 'disabled' : ''} data-tip="Die Anlage wird bei Dynacore auf Terra gekauft und muss dann mit einem Stückgutfrachter hierher geflogen werden."`,
  );
  return `<h3>${esc(p.name)} <span class="muted small">${pc(far)} von Terra</span></h3>
    <p class="small">${icon(facilityIcon(p.facility))} <b>${def.name}</b>: liefert ${flows(def.outputs)} pro Tag${Object.keys(def.inputs).length ? ` aus ${flows(def.inputs)}` : ''}</p>
    ${storm ? '<p class="small warn">Liegt in der Gravo-Sturm-Zone: Stürme beschädigen hier Anlagen und Schiffe.</p>' : ''}
    <p class="small">${mine ? `<b class="good">Deine Anlage</b> × ${num(mine.units)} · Zustand ${dec(mine.condition)} %` : 'Du hast hier noch nichts.'}${owners ? ` · Auch hier: ${owners}` : ''}</p>
    ${shipList}
    <div class="acts">${buy}${mine ? btn('Zur Anlage', 'tab', 'facilities') : ''}</div>`;
}
