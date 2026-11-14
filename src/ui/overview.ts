// Gesamtübersicht: the six module places in a circle (one per quark, generations side by side) with the
// particle accelerator in the middle, and the finale after the sixth quark. Pure HTML/SVG, no DOM.

import { CONFIG, FLAVOURS, PROJECTS, closableQuarks, QUARK_NAME, campaignComplete, campaignOf, campaignValue, quarkStatus, worldName, type Flavour, type World } from '../sim/index';
import { cr, esc, num } from './format';

const SIZE = 360;
const C = SIZE / 2;
const R = 128;

/** Angle of each place: up at the top, then clockwise down, charm, strange, top, bottom. */
const angle = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / FLAVOURS.length;

export function overviewHtml(w: World): string {
  const camp = campaignOf(w);
  const unlocked = quarkStatus(w).unlocked;
  const places = FLAVOURS.map((f, i) => {
    const m = camp.modules.find((x) => x.quark === f);
    const x = C + R * Math.cos(angle(i));
    const y = C + R * Math.sin(angle(i));
    const label = m ? esc(m.worldName) : unlocked.includes(f) ? 'frei – hier freigeschaltet' : 'frei';
    return `<g class="ov-place q-${f}${m ? ' made' : ''}" data-act="overview-place" data-a="${f}" data-quark="${f}" role="button" tabindex="0" aria-label="${QUARK_NAME[f]}-Quark: ${label}">
      <circle cx="${x}" cy="${y}" r="34" class="ov-dot"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="ov-name">${QUARK_NAME[f]}</text>
      <text x="${x}" y="${y + 50}" text-anchor="middle" class="ov-sub">${label}</text>
      ${m ? `<text x="${x}" y="${y + 64}" text-anchor="middle" class="ov-sub">Index ${num(m.index)}</text>` : ''}</g>`;
  }).join('');
  const centre = campaignComplete(w) ? 'Standardmodell vervollständigt' : `Welt ${camp.world} läuft`;
  return `<div class="overview">
    <svg viewBox="0 0 ${SIZE} ${SIZE + 30}" class="ov-svg" role="img" aria-label="Gesamtübersicht der Modulwelten">
      <circle cx="${C}" cy="${C}" r="${R}" class="ov-orbit"/>
      <circle cx="${C}" cy="${C}" r="46" class="ov-ring"/>
      <circle cx="${C}" cy="${C}" r="46" class="ov-beam"/>
      <text x="${C}" y="${C - 4}" text-anchor="middle" class="ov-name">Beschleuniger</text>
      <text x="${C}" y="${C + 12}" text-anchor="middle" class="ov-sub">${centre}</text>
      ${places}
    </svg>
    <p class="small">Kampagne: ${camp.modules.length} von 6 Quarks erzeugt · Kampagnenwert <b>${num(campaignValue(w))}</b>. Tippe auf einen Platz für Details.</p>
    ${closableQuarks(w).length ? '<div class="acts"><button data-act="close-world" class="primary">Welt abschließen…</button></div>' : ''}${campaignComplete(w) ? '<div class="acts"><button data-act="finale">Finale ansehen</button></div>' : ''}
  </div>`;
}

/** What a tap on a place shows: the frozen module, or what it takes to fill the place. */
export function moduleDetail(w: World, f: Flavour): string {
  const m = campaignOf(w).modules.find((x) => x.quark === f);
  const def = PROJECTS.find((p) => p.quark === f)!;
  if (m)
    return `<div class="ov-detail q-${f}"><b>${QUARK_NAME[f]}-Quark: ${esc(m.worldName)}</b>
      <p class="small">${esc(m.firm)} · ${num(m.days)} Tage · Firmenindex ${num(m.index)} · ${num(m.facilities)} Anlagen · ${num(m.ships)} Schiffe</p>
      <p class="small">${def.name} wirkt seitdem in jeder Welt: ${def.effect}</p></div>`;
  return `<div class="ov-detail q-${f}"><b>${QUARK_NAME[f]}-Quark: noch frei</b>
    <p class="small">Freigeschaltet durch das Großprojekt <b>${def.name}</b> (${cr(def.price)}, danach Waren aus seinem Quark-Feld und ${num(CONFIG.projects.buildDays)} Tage Bau).</p>
    <p class="small">Schließt du eine Welt damit ab, wirkt es in allen weiteren Welten: ${def.effect}</p></div>`;
}

export function finaleHtml(w: World): string {
  const camp = campaignOf(w);
  const rows = camp.modules
    .map((m) => `<li><span class="qtag q-${m.quark}">${QUARK_NAME[m.quark]}</span> ${esc(m.worldName)} – Index ${num(m.index)}</li>`)
    .join('');
  return `<div class="finale">
    <h3>Das Standardmodell ist vervollständigt</h3>
    <p>Der Beschleuniger in der Mitte weist alle sechs Quark-Sorten nach – up, down, charm, strange, top und bottom. Jede deiner Modulwelten hat eine davon hervorgebracht.</p>
    <ul class="plain">${rows}</ul>
    <p>Kampagnenwert: <b>${num(campaignValue(w))}</b></p>
    <p class="small muted">Du kannst in ${esc(worldName(w))} weiterspielen.</p>
  </div>`;
}
