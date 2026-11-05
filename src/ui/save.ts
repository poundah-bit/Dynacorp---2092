// One autosave slot in localStorage. The world is plain JSON, so saving is just serialising it.
// Storage can be unavailable (private mode, blocked site data) – then the game simply runs without saves.

import type { World } from '../sim/index';

const KEY = 'dynacorp2092.save.v1';

export interface SaveData {
  version: 1;
  world: World;
  guideHidden: boolean;
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // no storage: keep playing without autosave
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data?.version !== 1 || !data.world?.playerId) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
