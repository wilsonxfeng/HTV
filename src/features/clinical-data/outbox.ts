import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { MotionSession } from '../../lib/types';
import type { CreateSession, SessionRepository } from './contracts';

export interface PendingRecording {
  id: string;
  metadata: CreateSession;
  motion: MotionSession;
  video: Blob;
  state: 'queued' | 'uploading' | 'synced' | 'error';
  attempts: number;
  error?: string;
}
interface UploadDatabase extends DBSchema { recordings: { key: string; value: PendingRecording } }
export function createOutbox(name = 'remotion-clinical-outbox') {
  const database = () => openDB<UploadDatabase>(name, 1, { upgrade(db) { db.createObjectStore('recordings', { keyPath: 'id' }); } });
  const pending = new Map<string, Promise<PendingRecording>>();
  const put = async (recording: PendingRecording) => { const db = await database(); try { await db.put('recordings', recording); } finally { db.close(); } };
  const get = async (id: string) => { const db = await database(); try { return await db.get('recordings', id); } finally { db.close(); } };
  return {
    async save(metadata: CreateSession, motion: MotionSession, video: Blob) {
      const existing = await get(metadata.id);
      if (existing) throw Error('This recording is already stored. Retry its upload instead.');
      const entry: PendingRecording = { id: metadata.id, metadata, motion, video, state: 'queued', attempts: 0 };
      await put(entry); return entry;
    },
    get,
    async list() { const db = await database(); try { return (await db.getAll('recordings')).sort((a, b) => b.metadata.startedAt.localeCompare(a.metadata.startedAt)); } finally { db.close(); } },
    async remove(id: string) { if (pending.has(id)) throw Error('Wait for this upload to finish.'); const db = await database(); try { await db.delete('recordings', id); } finally { db.close(); } },
    sync(id: string, repository: SessionRepository, signal?: AbortSignal) {
      if (pending.has(id)) return pending.get(id)!;
      const upload = async () => {
        const entry = await get(id);
        if (!entry) throw Error('Local recording not found.');
        if (entry.state === 'synced') return entry;
        entry.state = 'uploading'; entry.attempts++; delete entry.error; await put(entry);
        try { await repository.upload(entry.metadata, entry.motion, entry.video, signal); entry.state = 'synced'; }
        catch (error) { entry.state = 'error'; entry.error = error instanceof Error ? error.message : 'Upload failed.'; }
        await put(entry); return entry;
      };
      const work = (async () => globalThis.navigator?.locks ? await navigator.locks.request(`remotion-upload-${id}`, upload) : await upload())().finally(() => pending.delete(id));
      pending.set(id, work); return work;
    },
  };
}
export const recordingOutbox = createOutbox();
