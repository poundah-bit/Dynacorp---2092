// Balancing report for headless runs: what the economy looks like after n days.

import { FACILITIES, GOODS, facilityDef } from './data';
import { marketBalance, priceIndex, ranking } from './engine';
import type { World } from './types';

export interface Report {
  day: number;
  collapsed: boolean;
  priceIndex: number;
  bankrupt: number;
  companies: number;
  facilitiesByType: Record<string, number>;
  ships: number;
  openDemands: number;
  doneDemands: number;
  openTransports: number;
  prices: { good: string; price: number; base: number; supply: number; demand: number }[];
  top: ReturnType<typeof ranking>;
}

export function report(w: World): Report {
  const facilitiesByType: Record<string, number> = {};
  for (const t of FACILITIES) facilitiesByType[t.name] = 0;
  for (const f of w.facilities) facilitiesByType[facilityDef(f.type).name]! += f.units;
  return {
    day: w.day,
    collapsed: w.collapsed,
    priceIndex: Math.round(priceIndex(w) * 100) / 100,
    bankrupt: w.companies.filter((c) => c.bankrupt).length,
    companies: w.companies.length,
    facilitiesByType,
    ships: w.ships.length,
    openDemands: w.demands.filter((d) => d.status === 'open').length,
    doneDemands: w.demands.filter((d) => d.status === 'done').length,
    openTransports: w.transports.filter((t) => t.status === 'open').length,
    prices: GOODS.map((g) => ({
      good: g.name,
      price: w.prices[g.id] ?? 0,
      base: g.basePrice,
      ...marketBalance(w, g.id),
    })),
    top: ranking(w),
  };
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`Tag ${r.day} · ${r.collapsed ? 'WIRTSCHAFT ZUSAMMENGEBROCHEN' : 'Wirtschaft läuft'} · Preisindex ${r.priceIndex}`);
  lines.push(`Firmen ${r.companies - r.bankrupt}/${r.companies} aktiv · Schiffe ${r.ships} · offene Nachfragen ${r.openDemands} · erledigt (60 Tage) ${r.doneDemands} · offene Transporte ${r.openTransports}`);
  lines.push('');
  lines.push('Anlagen (Einheiten):');
  for (const [k, v] of Object.entries(r.facilitiesByType)) lines.push(`  ${k.padEnd(24)} ${v}`);
  lines.push('');
  lines.push('Kurse (Cr/FE):');
  for (const p of r.prices) {
    lines.push(`  ${p.good.padEnd(14)} ${p.price.toFixed(2).padStart(8)}  Basis ${String(p.base).padStart(4)}  Angebot ${Math.round(p.supply).toString().padStart(8)}  Nachfrage ${Math.round(p.demand).toString().padStart(8)}`);
  }
  lines.push('');
  lines.push('Rangliste:');
  r.top.forEach((c, i) =>
    lines.push(`  ${String(i + 1).padStart(2)}. ${c.name.padEnd(20)} Index ${String(c.index).padStart(6)}  Bar ${String(c.cash).padStart(10)}  Schulden ${String(c.debt).padStart(9)}${c.bankrupt ? '  BANKROTT' : ''}`),
  );
  return lines.join('\n');
}
