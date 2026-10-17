// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSession } from '../lib/demo';
import type { Vec3 } from '../lib/types';
import ExerciseFlow from './ExerciseFlow';

const mock = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(), lockIdentity: vi.fn(),
  sample: null as unknown, latestRef: { current: null as unknown },
}));
vi.mock('../lib/useHandTracker', () => ({ useHandTracker: () => ({
  ...mock, status: 'ready', videoRef: { current: null }, canvasRef: { current: null }, fps: 18,
}) }));
vi.mock('./VoiceCoach', () => ({ default: ({ cue, onReply, onConnection }: {
  cue: string; onReply: (reply: string) => string; onConnection: (connected: boolean) => void;
}) => <section aria-label="Mock coach"><p>{cue}</p><button onClick={() => onConnection(true)}>Connect coach</button><button onClick={() => onConnection(false)}>Disconnect coach</button>{['left hand', 'ready', 'begin', 'not ready', 'reference video'].map(reply => <button key={reply} onClick={() => onReply(reply)}>Reply {reply}</button>)}</section> }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  mock.start.mockReset(); mock.stop.mockReset(); mock.lockIdentity.mockReset();
  mock.sample = null; mock.latestRef.current = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function mount() {
  const props = { onBack: vi.fn(), onComplete: vi.fn() };
  const view = render(<ExerciseFlow {...props}/>);
  // Flush the lazy coach import without advancing lesson timers.
  await act(async () => { await import('./VoiceCoach'); });
  return { ...view, props };
}

function observe(points: Vec3[]) {
  mock.sample = { observedAt: performance.now(), t: 0, tracking: true, landmarks: points, imageLandmarks: points, modelHandedness: 'Left', confidence: 1, reason: 'Hand detected' };
  mock.latestRef.current = mock.sample;
}

async function calibrated() {
  const view = await mount();
  fireEvent.click(screen.getByText('Connect coach'));
  fireEvent.click(screen.getByText('Reply left hand'));
  const { neutral, target } = createDemoSession().calibration;
  for (const points of [neutral, target]) {
    observe(points); view.rerender(<ExerciseFlow {...view.props}/>);
    fireEvent.click(screen.getByText('Reply ready'));
    for (let i = 0; i < 12; i++) {
      act(() => { vi.advanceTimersByTime(120); observe(points); view.rerender(<ExerciseFlow {...view.props}/>); });
    }
  }
  return view;
}

describe('coach-driven practice', () => {
  it('has a real exercise selector and no old manual setup panels', async () => {
    await mount();
    expect(screen.getByRole('combobox', { name: 'Exercise' }).textContent).toBe('Finger Spread & Close');
    expect(screen.queryByText('Optional voice coach')).toBeNull();
    expect(screen.queryByText('Which hand are you exercising?')).toBeNull();
    expect(screen.queryByText('How to move your hand')).toBeNull();
    expect(screen.queryByText('Camera is private and local')).toBeNull();
    expect(mock.start).not.toHaveBeenCalled();
  });
  it('requires voice connection, hand confirmation and real tracking before capture', async () => {
    await mount();
    fireEvent.click(screen.getByText('Reply ready'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByText('Connect coach'));
    expect(mock.start).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Reply ready'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByText('Reply left hand'));
    fireEvent.click(screen.getByText('Reply ready'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Keep your whole hand in the camera guide, then say ready.')).toBeTruthy();
  });
  it('advances only after stable neutral and target observations, then spoken begin', async () => {
    await calibrated();
    expect(screen.getByText(/Your personal reference is ready/)).toBeTruthy();
    expect(mock.lockIdentity).toHaveBeenCalledWith('Left');
    fireEvent.click(screen.getByText('Reply not ready'));
    expect(screen.queryByText('Stop practice')).toBeNull();
    fireEvent.click(screen.getByText('Reply begin'));
    expect(screen.getByText('Stop practice')).toBeTruthy();
    act(() => vi.advanceTimersByTime(3100));
    expect(document.querySelector('.ex-step-recording')).toBeTruthy();
  });
  it('cancels the countdown and camera when voice disconnects', async () => {
    await calibrated();
    fireEvent.click(screen.getByText('Reply begin'));
    fireEvent.click(screen.getByText('Disconnect coach'));
    act(() => vi.advanceTimersByTime(4000));
    expect(document.querySelector('.ex-step-ready')).toBeTruthy();
    expect(mock.stop).toHaveBeenCalled();
    expect(screen.queryByText('Stop practice')).toBeNull();
  });
  it('stops an active recording when voice disconnects, preserving a partial session', async () => {
    await calibrated();
    fireEvent.click(screen.getByText('Reply begin'));
    act(() => vi.advanceTimersByTime(3100));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByText('Disconnect coach'));
    expect(document.querySelector('.ex-step-done')).toBeTruthy();
    expect(screen.getByText(/Your practice ended early\./)).toBeTruthy();
    expect(mock.stop).toHaveBeenCalled();
  });
});
