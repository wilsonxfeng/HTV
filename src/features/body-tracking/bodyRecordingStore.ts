import { openDB } from 'idb';
import type { MotionSession } from '../../lib/types';
import type { VideoMetadata } from '../clinical-data/contracts';
export interface BodyRecording { motion: MotionSession; video: Blob; metadata: VideoMetadata; demonstration: boolean }
const database = () => openDB('remotion-body-recordings', 1, {upgrade(db) { db.createObjectStore('recordings', {keyPath: 'motion.id'}); }});
export const bodyRecordingStore = {
  async save(recording: BodyRecording) {const db = await database(); try {await db.put('recordings', recording);} finally {db.close();}},
  async list(): Promise<BodyRecording[]> {const db = await database(); try {return await db.getAll('recordings');} finally {db.close();}},
  async remove(id: string) {const db = await database(); try {await db.delete('recordings', id);} finally {db.close();}},
};
