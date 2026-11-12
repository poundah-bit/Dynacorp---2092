// Line icons for the game UI: our own pictograms on a 24×24 grid, stroke 2, round caps, no fills.
// Kept as path data so the HTML (`icon()`) and later the canvas star map (`new Path2D(d)`) share them.

import type { Cargo } from '../sim/index';

const CIRCLE = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0';

export const ICONS = {
  // tabs
  terra: [CIRCLE, 'M3 12h18', 'M12 3c-3.5 3 -3.5 15 0 18', 'M12 3c3.5 3 3.5 15 0 18'],
  map: ['M12 4l1.8 6.2l6.2 1.8l-6.2 1.8l-1.8 6.2l-1.8 -6.2l-6.2 -1.8l6.2 -1.8Z', 'M5 5v.01', 'M19 19v.01', 'M19 5v.01'],
  facilities: ['M3 21h18', 'M4 21V11l5 3v-3l5 3V4h4v17', 'M8 17h2', 'M13 17h2'],
  fleet: ['M3 15l3 -6h11l4 6l-4 3H6Z', 'M9 9V6h5v3', 'M1 13h1.5'],
  market: ['M4 8h14', 'M14 4l4 4l-4 4', 'M20 16H6', 'M10 12l-4 4l4 4'],
  orders: ['M8 3h8v4H8Z', 'M6 5H5v16h14V5h-1', 'M8 11h8', 'M8 15h8', 'M8 19h5'],
  stats: ['M4 20h16', 'M7 20v-6', 'M12 20V6', 'M17 20V10'],
  // cargo types
  tank: ['M12 3c4 5 6 8 6 11a6 6 0 0 1 -12 0c0 -3 2 -6 6 -11Z'],
  bulk: ['M3 19l5 -8l3 4l3 -6l7 10Z'],
  piece: ['M4 8l8 -4l8 4v8l-8 4l-8 -4Z', 'M4 8l8 4l8 -4', 'M12 12v8'],
  cooled: ['M12 3v18', 'M4.2 7.5l15.6 9', 'M4.2 16.5l15.6 -9', 'M9.5 4.5L12 6l2.5 -1.5', 'M9.5 19.5L12 18l2.5 1.5'],
  live: ['M5 19c0 -8 5 -14 14 -14c0 9 -6 14 -14 14Z', 'M5 19l8 -8'],
  // facility types
  oilwell: ['M8 21l4 -17l4 17', 'M9.5 15h5', 'M10.6 10h2.8', 'M5 21h14'],
  waterstation: ['M12 3c3 4 4.5 6 4.5 8a4.5 4.5 0 0 1 -9 0c0 -2 1.5 -4 4.5 -8Z', 'M3 20c2 -1.5 4 -1.5 6 0s4 1.5 6 0s4 -1.5 6 0'],
  mine: ['M4 10c3 -4.5 13 -4.5 16 0', 'M12 6.5V21'],
  refinery: ['M5 21V9h4v12', 'M13 21V5h4v16', 'M3 21h18', 'M9 13h4', 'M7 6V4', 'M15 3v-.01'],
  plasticplant: ['M12 3l8 4.5v9L12 21l-8 -4.5v-9Z', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],
  chemplant: ['M9 3h6', 'M10 3v6l-5 10h14l-5 -10V3', 'M7.5 14h9'],
  steelworks: ['M5 5h14', 'M5 19h14', 'M12 5v14'],
  agrofarm: ['M12 21V8', 'M12 8c-3 0 -4 -2 -4 -5c3 0 4 2 4 5', 'M12 8c3 0 4 -2 4 -5c-3 0 -4 2 -4 5', 'M12 14c-3 0 -4 -2 -4 -4c3 0 4 2 4 4', 'M12 14c3 0 4 -2 4 -4c-3 0 -4 2 -4 4'],
  plantation: ['M12 21v-6', 'M6 9a6 6 0 1 0 12 0a6 6 0 1 0 -12 0', 'M8 21h8'],
  ranch: ['M5 21V6l1.5 -2L8 6v15', 'M16 21V6l1.5 -2L19 6v15', 'M8 10h8', 'M8 15h8'],
  brewery: ['M10 3h4', 'M10.5 3v4L8 10v11h8V10l-2.5 -3V3', 'M8 14h8'],
  foodplant: ['M6 6a6 2 0 1 0 12 0a6 2 0 1 0 -12 0', 'M6 6v12a6 2 0 0 0 12 0V6', 'M6 12a6 2 0 0 0 12 0'],
  textilemill: ['M6 4h12', 'M6 20h12', 'M8 4v16', 'M16 4v16', 'M8 8l8 3', 'M8 13l8 3'],
  factory: ['M6 4h12l-1.5 16h-9Z', 'M6.5 9h11'],
  machineworks: ['M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M5.6 5.6l2.1 2.1', 'M16.3 16.3l2.1 2.1', 'M5.6 18.4l2.1 -2.1', 'M16.3 7.7l2.1 -2.1'],
  robotworks: ['M6 8h12v11H6Z', 'M12 4v4', 'M9.5 13v.01', 'M14.5 13v.01', 'M9.5 16h5', 'M4 12v3', 'M20 12v3'],
  pharma: ['M5 5h14v14H5Z', 'M12 8v8', 'M8 12h8'],
  // states
  construction: ['M14 4l6 6l-3 3l-6 -6Z', 'M12 9L4 17l3 3l8 -8'],
  stopped: [CIRCLE, 'M9 9l6 6', 'M15 9l-6 6'],
  running: [CIRCLE, 'M8 12l3 3l5 -6'],
  idle: ['M9 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M12 8v13', 'M5 14a7 7 0 0 0 14 0', 'M8 11h8'],
  travelling: ['M10 12h11', 'M17 8l4 4l-4 4', 'M3 8h4', 'M3 16h4', 'M5 12h1'],
  loading: ['M4 14v6h16v-6', 'M12 3v11', 'M8 10l4 4l4 -4'],
  repairMarked: ['M15 4a5 5 0 0 0 -5 6.5L4 16.5L7.5 20l6 -6A5 5 0 0 0 20 9l-3 3l-3 -1l-1 -3Z'],
  critical: ['M12 3l10 18H2Z', 'M12 10v5', 'M12 18v.01'],
  deadline: [CIRCLE, 'M12 7v5l3 2'],
  bigOrder: ['M12 3l2.7 5.6l6.1 .9l-4.4 4.3l1 6.1L12 17l-5.4 2.9l1 -6.1l-4.4 -4.3l6.1 -.9Z'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

const isIcon = (s: string): s is IconName => s in ICONS;

/** An inline SVG icon; colour comes from the surrounding text (`currentColor`). */
export function icon(name: IconName, cls = ''): string {
  const paths = ICONS[name].map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** The icon of a facility type (its id), or the generic facilities icon for an unknown type. */
export const facilityIcon = (type: string): IconName => (isIcon(type) ? type : 'facilities');

export const cargoIconName = (c: Cargo): IconName => c;
