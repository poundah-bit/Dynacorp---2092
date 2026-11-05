// Star map: planets, facilities and ships on a canvas. Drag to pan, pinch or wheel to zoom, tap a planet
// for details. One map element lives for the whole game; game.ts moves it between the side column
// (tablet in landscape) and the "Karte" tab (phone, portrait).

import { CONFIG, PLANETS, facilityDef, good, shipSpeed, type PlanetDef, type World } from '../sim/index';
import { planetInfo } from './mapinfo';

export interface StarMap {
  el: HTMLElement;
  /** redraw; `frac` is the part of the current day that has passed (ships move smoothly), `info` rebuilds the panel */
  draw(w: World, me: string, frac?: number, info?: boolean): void;
  selected: string;
  select(id: string): void;
}

type Tier = 'raw' | 'intermediate' | 'final' | 'terra';

function planetTier(p: PlanetDef): Tier {
  if (!p.facility) return 'terra';
  const outs = Object.keys(facilityDef(p.facility).outputs).map((g) => good(g).tier);
  if (outs.includes('final')) return 'final';
  return outs.includes('intermediate') ? 'intermediate' : 'raw';
}

/** Short label for the facility on a planet, e.g. "Öl" for the oil well. */
const SHORT: Record<string, string> = {
  oilwell: 'Öl',
  waterstation: 'Wasser',
  mine: 'Erz',
  refinery: 'Raffinerie',
  plasticplant: 'Kunststoff',
  chemplant: 'Chemie',
  steelworks: 'Stahl',
  agrofarm: 'Agrar',
  plantation: 'Plantage',
  ranch: 'Zucht',
  brewery: 'Getränke',
  foodplant: 'Nahrung',
  textilemill: 'Textil',
  factory: 'Plastikwaren',
  machineworks: 'Maschinen',
  robotworks: 'Roboter',
  pharma: 'Pharma',
};
export const shortFacility = (type: string) => SHORT[type] ?? facilityDef(type).name;

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function createStarMap(): StarMap {
  const el = document.createElement('section');
  el.className = 'card map-card';
  el.innerHTML = `
    <div class="map-wrap">
      <canvas class="starmap" aria-label="Sternkarte: ziehen zum Verschieben, zwei Finger oder Mausrad zum Zoomen, tippen für Details"></canvas>
      <div class="map-zoom">
        <button type="button" data-zoom="1.4" aria-label="Hineinzoomen">+</button>
        <button type="button" data-zoom="0.7" aria-label="Herauszoomen">−</button>
        <button type="button" data-zoom="0" aria-label="Ganze Karte" data-tip="Zeigt wieder die ganze Karte.">⌖</button>
      </div>
    </div>
    <div class="map-legend small">
      <span><i class="dot raw"></i>Rohstoff</span><span><i class="dot intermediate"></i>Zwischenprodukt</span><span><i class="dot final"></i>Endprodukt</span>
      <span><i class="dot mine"></i>deine Anlage</span><span><i class="tri"></i>dein Schiff</span><span><i class="ring"></i>Gravo-Sturm-Zone</span>
    </div>
    <div class="map-info"></div>`;
  const canvas = el.querySelector('canvas')!;
  const info = el.querySelector<HTMLElement>('.map-info')!;
  const ctx = canvas.getContext('2d')!;

  // view: screen = (world - centre) * scale + size / 2
  let scale = 0; // 0 = fit on next draw
  let cx = 0;
  let cy = 0;
  let last: { w: World; me: string; frac: number } | null = null;
  let infoFor: string | null = null;

  const map: StarMap = {
    el,
    selected: '',
    draw(w, me, frac = 0, refresh = false) {
      last = { w, me, frac };
      paint();
      // the panel is rebuilt with the views (game.ts passes refresh) or when the selection changes –
      // not on every animation frame, which would swap its buttons away under a finger
      if (refresh || infoFor !== map.selected) {
        infoFor = map.selected;
        info.innerHTML = planetInfo(w, me, map.selected);
      }
    },
    select(id) {
      map.selected = id;
      if (last) map.draw(last.w, last.me, last.frac, true);
    },
  };

  function fit() {
    const r = canvas.getBoundingClientRect();
    const xs = PLANETS.map((p) => p.x);
    const ys = PLANETS.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2;
    scale = Math.min((r.width - 60) / (x1 - x0 || 1), (r.height - 50) / (y1 - y0 || 1));
  }
  const toScreen = (x: number, y: number, r: DOMRect) => [(x - cx) * scale + r.width / 2, (y - cy) * scale + r.height / 2] as const;
  const toWorld = (sx: number, sy: number, r: DOMRect) => [(sx - r.width / 2) / scale + cx, (sy - r.height / 2) / scale + cy] as const;

  function zoomAt(f: number, sx: number, sy: number) {
    const r = canvas.getBoundingClientRect();
    const [wx, wy] = toWorld(sx, sy, r);
    scale = Math.max(0.15, Math.min(8, scale * f));
    // keep the point under the finger in place
    cx = wx - (sx - r.width / 2) / scale;
    cy = wy - (sy - r.height / 2) / scale;
    paint();
  }

  function paint() {
    if (!last) return;
    const { w, me, frac } = last;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return; // not on screen
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    if (!scale) fit();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);

    const col = {
      bg: css('--map-bg', '#070b17'),
      line: css('--line', '#26304f'),
      text: css('--text', '#e6e9f2'),
      muted: css('--muted', '#8b93ad'),
      accent: css('--accent', '#4fd1c5'),
      warn: css('--warn', '#f2cc60'),
      bad: css('--bad', '#ff7b72'),
      raw: css('--tier-raw', '#6fa8ff'),
      intermediate: css('--tier-mid', '#f2cc60'),
      final: css('--tier-final', '#d68cff'),
      terra: css('--tier-terra', '#7ee787'),
    };
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, r.width, r.height);

    // gravo storm zone: everything beyond the outer ring
    const [tx, ty] = toScreen(0, 0, r);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = col.bad;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(tx, ty, CONFIG.events.outerRingParsec * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // routes of own ships
    const ships = w.ships;
    const pos = (id: string) => PLANETS.find((p) => p.id === id)!;
    ctx.lineWidth = 1.5;
    for (const s of ships) {
      if (s.owner !== me || !s.route) continue;
      const a = pos(s.route.from);
      const b = pos(s.route.to);
      const [ax, ay] = toScreen(a.x, a.y, r);
      const [bx, by] = toScreen(b.x, b.y, r);
      ctx.strokeStyle = col.accent;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // planets
    const own = new Map<string, { units: number; bad: boolean }>();
    for (const f of w.facilities) {
      if (f.owner !== me) continue;
      own.set(f.planet, { units: f.units, bad: f.status === 'stopped' || f.condition < CONFIG.facilities.repairBelow });
    }
    const showSub = scale > 0.55;
    ctx.textAlign = 'center';
    for (const p of PLANETS) {
      const [x, y] = toScreen(p.x, p.y, r);
      const tier = planetTier(p);
      const rad = tier === 'terra' ? 11 : 7;
      const mine = own.get(p.id);
      if (map.selected === p.id) {
        ctx.strokeStyle = col.warn;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, rad + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = col[tier];
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (mine) {
        ctx.strokeStyle = mine.bad ? col.bad : col.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, rad + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = col.text;
      ctx.font = `${tier === 'terra' ? 'bold ' : ''}13px system-ui, sans-serif`;
      ctx.fillText(p.name, x, y + rad + 15);
      if (showSub && p.facility) {
        ctx.fillStyle = col.muted;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`${shortFacility(p.facility)}${mine ? ` · ${mine.units}× deine` : ''}`, x, y + rad + 28);
      }
    }

    // ships: others as small dots, own ships as triangles pointing along their route
    for (const s of ships) {
      let x: number;
      let y: number;
      let angle = -Math.PI / 2;
      if (s.route) {
        const a = pos(s.route.from);
        const b = pos(s.route.to);
        const t = Math.min(1, (s.route.traveled + shipSpeed(s) * frac) / (s.route.distance || 1));
        [x, y] = toScreen(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r);
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      } else if (s.at) {
        if (s.owner !== me) continue; // parked ships of others would just clutter the planets
        const p = pos(s.at);
        [x, y] = toScreen(p.x, p.y, r);
        x += 13;
        y -= 11;
      } else continue;
      if (s.owner === me) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = s.condition < 50 ? col.bad : col.accent;
        ctx.strokeStyle = col.bg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, -5.5);
        ctx.lineTo(-6, 5.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = col.muted;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // scale bar
    const bar = 100 * scale;
    ctx.strokeStyle = col.muted;
    ctx.fillStyle = col.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, r.height - 12);
    ctx.lineTo(12 + bar, r.height - 12);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('100 Pc', 12, r.height - 17);
  }

  function hit(sx: number, sy: number): string {
    const r = canvas.getBoundingClientRect();
    let best = '';
    let bestD = 26; // finger-sized hit area
    for (const p of PLANETS) {
      const [x, y] = toScreen(p.x, p.y, r);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    return best;
  }

  // ---------- input: drag, pinch, wheel, tap ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; t: number; moved: boolean } | null = null;
  let pinch = 0;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) down = { ...local(e), t: performance.now(), moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      if (down) down.moved = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      if (down && Math.hypot(now.x - down.x, now.y - down.y) > 6) down.moved = true;
      if (down?.moved) {
        cx -= (now.x - prev.x) / scale;
        cy -= (now.y - prev.y) / scale;
        paint();
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
    }
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0 && down && !down.moved && e.type === 'pointerup') {
      const p = local(e);
      map.select(hit(p.x, p.y));
    }
    if (pointers.size === 0) down = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    },
    { passive: false },
  );
  el.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const f = Number(b.dataset.zoom);
      if (!f) {
        fit();
        paint();
        return;
      }
      const r = canvas.getBoundingClientRect();
      zoomAt(f, r.width / 2, r.height / 2);
    }),
  );
  new ResizeObserver(() => paint()).observe(canvas);
  return map;
}

