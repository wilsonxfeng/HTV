import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useApp } from './store';
import { createDemoSession } from './demo';
import { deleteSession, listSessions } from './storage';
import { gardenProgress } from './garden';

beforeEach(async () => {
  for (const session of await listSessions()) await deleteSession(session.id);
  useApp.setState({ sessions: [], gardenReward: null, notice: null });
});
describe('session flower rewards', () => {
  it('rewards successive sessions on the same day without rewarding replay or repeated saves', async () => {
    const session = { ...createDemoSession(), id: 'first', source: 'camera' as const, completed: true };
    await useApp.getState().save(session);
    expect(useApp.getState().gardenReward).toBe('first');
    useApp.getState().clearGardenReward();
    await useApp.getState().save(session);
    expect(useApp.getState().gardenReward).toBeNull();
    await useApp.getState().save({ ...session, id: 'second' });
    expect(useApp.getState().gardenReward).toBe('second');
    expect(gardenProgress(useApp.getState().sessions).blooms).toBe(2);
  });
  it('does not reward sample or interrupted sessions, but rewards completion once', async () => {
    const session = { ...createDemoSession(), id: 'practice', source: 'camera' as const, completed: false };
    await useApp.getState().save(createDemoSession());
    await useApp.getState().save(session);
    expect(useApp.getState().gardenReward).toBeNull();
    await useApp.getState().save({ ...session, completed: true });
    expect(useApp.getState().gardenReward).toBe('practice');
    expect(gardenProgress(useApp.getState().sessions).blooms).toBe(1);
  });
});
