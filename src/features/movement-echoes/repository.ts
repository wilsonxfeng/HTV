import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { EchoSession, GhostCache } from './types';

interface EchoDatabase extends DBSchema {
  recordings: { key: string; value: EchoSession };
  ghosts: { key: string; value: GhostCache; indexes: { 'by-session': string } };
}
let pending: ReturnType<typeof openDB<EchoDatabase>> | undefined;
function database() {
  if (!pending)
    pending = openDB<EchoDatabase>('remotion-movement-echoes', 1, {
      upgrade(db) {
        db.createObjectStore('recordings', { keyPath: 'id' });
        db.createObjectStore('ghosts', { keyPath: 'key' }).createIndex(
          'by-session',
          'sessionId',
        );
      },
      blocking() {
        void pending?.then((db) => db.close());
        pending = undefined;
      },
      terminated() {
        pending = undefined;
      },
    }).catch((e) => {
      pending = undefined;
      throw e;
    });
  return pending;
}
export const echoRepository = {
  async list() {
    return (await (await database()).getAll('recordings')).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  },
  async save(session: EchoSession) {
    await (await database()).put('recordings', session);
  },
  async cache(key: string) {
    return (await database()).get('ghosts', key);
  },
  async saveCache(cache: GhostCache) {
    await (await database()).put('ghosts', cache);
  },
  async clearCache(sessionId: string) {
    const db = await database();
    const tx = db.transaction('ghosts', 'readwrite');
    for (const key of await tx.store.index('by-session').getAllKeys(sessionId))
      await tx.store.delete(key);
    await tx.done;
  },
  async delete(id: string) {
    const db = await database();
    const tx = db.transaction(['recordings', 'ghosts'], 'readwrite');
    await tx.objectStore('recordings').delete(id);
    const keys = await tx
      .objectStore('ghosts')
      .index('by-session')
      .getAllKeys(id);
    for (const key of keys) await tx.objectStore('ghosts').delete(key);
    await tx.done;
  },
};
