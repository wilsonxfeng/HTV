import type {
  CoachSessionRecord,
  GardenCompletionEvent,
  MotionSession,
} from "../types/coach";
import { recordingRepository } from "../recording/recordingRepository";
/** Keeps existing persistence intact; host opts into writing a legacy history entry. */
export function createSessionPersistenceAdapter(
  saveExisting: (session: MotionSession) => Promise<void>,
) {
  return async (session: CoachSessionRecord) => {
    await saveExisting(session.motionSession);
  };
}
export async function enrichSessionEntries<T extends { id: string }>(
  entries: T[],
): Promise<(T & { voiceCoach?: CoachSessionRecord })[]> {
  const sessions = await recordingRepository.list();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return entries.map((entry) => ({ ...entry, voiceCoach: byId.get(entry.id) }));
}
/** The host must deduplicate the stable event ID if rewards survive across tabs/devices. */
export class GardenRewardDispatcher {
  private delivered = new Set<string>();
  private busy = new Set<string>();
  async deliver(
    session: CoachSessionRecord,
    callback?: (event: GardenCompletionEvent) => void | Promise<void>,
    persist?: (record: CoachSessionRecord) => Promise<unknown>,
  ): Promise<boolean> {
    if (
      !callback ||
      session.status !== "completed" ||
      session.source === "demo" ||
      session.rewardDelivered ||
      this.delivered.has(session.id) ||
      this.busy.has(session.id)
    )
      return false;
    this.busy.add(session.id);
    try {
      await callback({
        id: `remotion-coach-completion:${session.id}`,
        sessionId: session.id,
        completedRepetitions: session.completedRepetitions,
        source: session.source,
      });
      this.delivered.add(session.id);
      await persist?.({ ...session, rewardDelivered: true });
      return true;
    } finally {
      this.busy.delete(session.id);
    }
  }
}
