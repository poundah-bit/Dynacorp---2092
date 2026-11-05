// Ten save slots in IndexedDB. A late game is about 0.5 MB of JSON, so ten slots would not fit into
// localStorage (≈ 5 MB, shared with the autosave). Small metadata lives in its own store so the list
// can be shown without reading every world.

import type { SaveData } from './save';

export const SLOT_COUNT = 10;

export interface SlotMeta {
  slot: number; // 1..10
  firm: string;
  day: number;
  difficulty: string;
  savedAt: number; // ms since epoch
}

const DB = 'dynacorp2092';
const META = 'slotMeta';
const DATA = 'slotData';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Speichern ist in diesem Browser nicht möglich.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Speicher nicht verfügbar.'));
  });
}

function run<T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const req = body(tx);
        tx.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        tx.onerror = () => reject(tx.error ?? new Error('Speichern fehlgeschlagen.'));
        tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen – ist der Speicher voll?'));
      }),
  );
}

/** All ten slots in order; empty slots are null. */
export async function listSlots(): Promise<(SlotMeta | null)[]> {
  const all = ((await run<SlotMeta[]>([META], 'readonly', (tx) => tx.objectStore(META).getAll())) ?? []) as SlotMeta[];
  return Array.from({ length: SLOT_COUNT }, (_, i) => all.find((m) => m.slot === i + 1) ?? null);
}

export async function saveSlot(slot: number, data: SaveData, firm: string): Promise<void> {
  const meta: SlotMeta = { slot, firm, day: data.world.day, difficulty: data.world.difficulty, savedAt: Date.now() };
  await run([META, DATA], 'readwrite', (tx) => {
    tx.objectStore(DATA).put(JSON.stringify(data), slot);
    tx.objectStore(META).put(meta);
  });
}

export async function loadSlot(slot: number): Promise<SaveData | null> {
  const raw = await run<string>([DATA], 'readonly', (tx) => tx.objectStore(DATA).get(slot));
  if (!raw) return null;
  const data = JSON.parse(raw) as SaveData;
  return data?.version === 1 && data.world?.playerId ? data : null;
}

export async function deleteSlot(slot: number): Promise<void> {
  await run([META, DATA], 'readwrite', (tx) => {
    tx.objectStore(DATA).delete(slot);
    tx.objectStore(META).delete(slot);
  });
}
