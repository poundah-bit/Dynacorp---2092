// Kampagne: the player closes a world with an unlocked quark; it freezes into a module and the next
// world begins with a new company. The closing Großprojekt works in every later world.

import type { Result } from './actions';
import { PROJECTS, projectDef, worldPlanets } from './data';
import { companyIndex } from './engine';
import { FLAVOURS, quarkStatus } from './quark';
import type { CampaignState, Flavour, ModuleRecord, World } from './types';
import { initStories } from './stories';
import { company, createWorld, log, random } from './world';

const fail = (error: string): Result<never> => ({ ok: false, error });

/** Six quarks, six module worlds. */
export const CAMPAIGN_WORLDS = FLAVOURS.length;

export const campaignOf = (w: World): CampaignState => w.campaign ?? { world: 1, modules: [], usedNames: [] };
export const producedQuarks = (w: World): Flavour[] => campaignOf(w).modules.map((m) => m.quark);
export const campaignComplete = (w: World) => campaignOf(w).modules.length >= CAMPAIGN_WORLDS;

/** Quarks this world can close as: unlocked here and not produced in an earlier world. */
export function closableQuarks(w: World): Flavour[] {
  if (!w.playerId || campaignComplete(w)) return [];
  const made = producedQuarks(w);
  return quarkStatus(w).unlocked.filter((f) => !made.includes(f));
}

/** „Welt 1 · Terra-Sektor“, later worlds after their outermost final-goods planet. */
export function worldName(w: World): string {
  const n = campaignOf(w).world;
  if (!w.planets) return `Welt ${n} · Terra-Sektor`;
  const outer = [...worldPlanets(w)].filter((p) => p.facility).sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y))[0]!;
  return `Welt ${n} · ${outer.name}-Sektor`;
}

/** Sum of the company indices of all modules plus the running world (until the campaign is complete). */
export function campaignValue(w: World): number {
  const frozen = campaignOf(w).modules.reduce((s, m) => s + m.index, 0);
  return campaignComplete(w) || !w.playerId ? frozen : frozen + companyIndex(w, w.playerId);
}

/**
 * Closes the world as the chosen quark. Returns the next world (new company, start capital, new planets);
 * after the sixth quark the same world, now complete. A running Großprojekt is lost.
 */
export function closeWorld(w: World, f: Flavour): Result<World> {
  const me = w.playerId;
  if (!me) return fail('Nur deine Firma schließt Welten ab.');
  if (!closableQuarks(w).includes(f)) return fail('Dieses Quark ist in dieser Welt nicht frei.');
  const camp = campaignOf(w);
  const project = PROJECTS.find((p) => p.quark === f)!.id;
  const record: ModuleRecord = {
    n: camp.world,
    quark: f,
    project,
    worldName: worldName(w),
    firm: company(w, me).name,
    days: w.day,
    index: companyIndex(w, me),
    facilities: w.facilities.filter((x) => x.owner === me).length,
    ships: w.ships.filter((s) => s.owner === me).length,
    closedDay: w.day,
  };
  const next: CampaignState = { world: camp.world + 1, modules: [...camp.modules, record], usedNames: camp.usedNames };
  if (next.modules.length >= CAMPAIGN_WORLDS) {
    w.campaign = { ...next, world: camp.world };
    log(w, me, `${record.worldName} ist als ${projectDef(project).name}-Modul abgeschlossen. Alle sechs Quarks sind erzeugt – das Standardmodell ist vervollständigt!`, 3);
    return { ok: true, value: w };
  }
  const nw = createWorld({
    seed: Math.floor(random(w) * 2 ** 31),
    difficulty: w.difficulty,
    playerName: company(w, me).name,
    aiCompanies: w.companies.filter((c) => !c.isPlayer).length,
    stories: w.stories?.on ?? false,
    campaign: next,
  });
  // switched off on the start screen: keep the state, so loading does not switch them on
  if (w.stories && !w.stories.on) initStories(nw, false);
  log(nw, nw.playerId, `Willkommen in ${worldName(nw)}. ${record.worldName} ist als Modul abgeschlossen – ${projectDef(project).name} wirkt auch hier.`, 3);
  return { ok: true, value: nw };
}
