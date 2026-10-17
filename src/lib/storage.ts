import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { MotionSession } from './types';

interface MotionDatabase extends DBSchema {
  sessions: { key: string; value: MotionSession; indexes: { 'by-created': string } };
}

let database: Promise<IDBPDatabase<MotionDatabase>> | undefined;

function getDatabase(): Promise<IDBPDatabase<MotionDatabase>> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Local session storage is unavailable in this browser.'));
  if (!database) {
    database = openDB<MotionDatabase>('remotion-local', 1, {
      upgrade(db) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' });
        store.createIndex('by-created', 'createdAt');
      },
      blocking() { database?.then(db => db.close()); database = undefined; },
      terminated() { database = undefined; },
    }).catch((error: unknown) => { database = undefined; throw error; });
  }
  return database;
}

/** Session records contain derived landmarks, never a webcam video or image. */
export async function saveSession(session: MotionSession): Promise<void> {
  const db = await getDatabase();
  await db.put('sessions', session);
}

export async function listSessions(): Promise<MotionSession[]> {
  const db = await getDatabase();
  const sessions = await db.getAllFromIndex('sessions', 'by-created');
  return sessions.reverse();
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('sessions', id);
}
