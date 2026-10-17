import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type {
  CoachSessionRecord,
  CoachSessionRepository,
} from "../types/coach";
interface CoachDB extends DBSchema {
  sessions: { key: string; value: CoachSessionRecord };
  videos: { key: string; value: Blob };
}
export function createRecordingRepository(
  databaseName = "remotion-voice-coach-v1",
): CoachSessionRepository {
  let pending: Promise<IDBPDatabase<CoachDB>> | null = null;
  const database = () =>
    (pending ??= openDB<CoachDB>(databaseName, 1, {
      upgrade(db) {
        db.createObjectStore("sessions", { keyPath: "id" });
        db.createObjectStore("videos");
      },
      terminated() {
        pending = null;
      },
    }).catch((error) => {
      pending = null;
      throw error;
    }));
  return {
    async save(session, video) {
      const db = await database();
      const record: CoachSessionRecord = {
        ...session,
        recordingId: video ? session.id : session.recordingId,
        videoAvailable: Boolean(video) || session.videoAvailable,
      };
      const tx = db.transaction(["sessions", "videos"], "readwrite");
      try {
        await Promise.all([
          Promise.resolve().then(() => tx.objectStore("sessions").put(record)),
          ...(video
            ? [
                Promise.resolve().then(() =>
                  tx.objectStore("videos").put(video, session.id),
                ),
              ]
            : []),
          tx.done,
        ]);
        return record;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* transaction already ended */
        }
        await tx.done.catch(() => {});
        if (
          video &&
          error instanceof DOMException &&
          error.name === "QuotaExceededError"
        ) {
          const reduced = {
            ...record,
            recordingId: undefined,
            videoAvailable: false,
            videoMetadata: record.videoMetadata
              ? {
                  ...record.videoMetadata,
                  warning:
                    "Local storage is full. Video was not saved; movement measurements were retained.",
                }
              : undefined,
          };
          await db.put("sessions", reduced);
          return reduced;
        }
        throw error;
      }
    },
    async list() {
      return (await (await database()).getAll("sessions")).sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt),
      );
    },
    async get(id) {
      return (await database()).get("sessions", id);
    },
    async getVideo(id) {
      return (await database()).get("videos", id);
    },
    async delete(id) {
      const db = await database();
      const tx = db.transaction(["sessions", "videos"], "readwrite");
      await Promise.all([
        tx.objectStore("sessions").delete(id),
        tx.objectStore("videos").delete(id),
        tx.done,
      ]);
    },
  };
}
export const recordingRepository = createRecordingRepository();
