// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useApp } from '../lib/store';
import { useClinicalAccess } from '../features/clinical-data/access';
import { createDemoSession } from '../lib/demo';
import Progress from './Progress';
const mocks = vi.hoisted(() => ({ patients: vi.fn(), sessions: vi.fn(), request: vi.fn(), detail: vi.fn(), video: vi.fn(), handDemo: vi.fn(), kneeDemo: vi.fn(), viewer: vi.fn() }));
vi.mock('../features/clinical-data/api', () => ({ ApiSessionRepository: class { patients = mocks.patients; sessions = mocks.sessions; request = mocks.request; detail = mocks.detail; video = mocks.video; } }));
vi.mock('./History', () => ({ default: () => <div>Local saved sessions</div> }));
vi.mock('../features/movement-echoes/MovementEchoes', () => ({ default: (props: { sessions?: { id: string }[]; onClose: () => void }) => { mocks.viewer(props); return <section aria-label="Movement Echoes"><p>{props.sessions?.map(s => s.id).join(',')}</p><button onClick={props.onClose}>Back to Progress</button></section>; } }));
vi.mock('../features/movement-echoes/handDemo', () => ({ loadHandDemo: mocks.handDemo }));
vi.mock('../features/body-exercises/bodyDemo', () => ({ loadKneeDemo: mocks.kneeDemo }));
beforeEach(() => {
  vi.clearAllMocks(); useClinicalAccess.setState({ access: null }); useApp.setState({ sessions: [] });
  mocks.patients.mockResolvedValue([{ id: 'assigned', displayName: 'Demo participant' }]); mocks.sessions.mockResolvedValue([]);
  mocks.handDemo.mockResolvedValue([{ id: 'finger-demo' }]); mocks.kneeDemo.mockResolvedValue([{ id: 'knee-demo' }]);
});
afterEach(cleanup);
it('keeps recording navigation in Progress and moves search out of this page', () => {
  const view = render(<Progress/>);
  expect(screen.queryByRole('heading', { name: 'Ask ReMotion' })).toBeNull();
  expect(screen.getByLabelText('Exercise').textContent).toContain('Seated Knee Extension');
  expect(screen.queryByText('Connect synced history')).toBeNull(); expect(screen.queryByText('Clinician dashboard')).toBeNull();
  expect(view.container.textContent).not.toMatch(/°|%|Chart values|hold angle/);
});
it('passes assigned search access into the synced Echoes viewer', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } });
  const motion = createDemoSession();
  const record = { id: motion.id, patientId: 'assigned', exerciseId: 'finger-spread-close', hand: 'Right', startedAt: motion.createdAt, status: 'complete', demonstration: true, repetitions: [], motion, video: { durationMs: 10000, mirrored: false, width: 640, height: 480, landmarkOffsetMs: 0, sha256: 'hash' } };
  mocks.sessions.mockResolvedValue([record]); mocks.detail.mockResolvedValue(record); mocks.video.mockResolvedValue(new Blob(['video']));
  render(<Progress/>);
  const button = await screen.findByRole('button', { name: /Ready to review/ }); fireEvent.click(button);
  await screen.findByRole('region', { name: 'Movement Echoes' });
  expect(mocks.viewer.mock.lastCall?.[0]).toMatchObject({ searchPatientId: 'assigned', providedOnly: true });
  expect(screen.queryByRole('heading', { name: 'Progress' })).toBeNull();
});
it('keeps demo video links out of Progress', () => {
  render(<Progress/>);
  expect(screen.queryByText('Finger spread overlays')).toBeNull();
  expect(screen.queryByText('Knee extension overlays')).toBeNull();
});
it('refreshes synced history when an upload finishes', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } }); render(<Progress/>);
  await waitFor(() => expect(mocks.sessions).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event('remotion-history-updated')); await waitFor(() => expect(mocks.sessions).toHaveBeenCalledTimes(2));
});
it('discards a pending synced recording load when the account changes', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } });
  const motion = createDemoSession();
  const record = { id: motion.id, patientId: 'assigned', exerciseId: 'finger-spread-close', hand: 'Right', startedAt: motion.createdAt, status: 'complete', demonstration: true, repetitions: [], motion, video: { durationMs: 10000, mirrored: false, width: 640, height: 480, landmarkOffsetMs: 0, sha256: 'hash' } };
  let resolve!: (value: typeof record) => void;
  mocks.sessions.mockResolvedValue([record]);
  mocks.detail.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  mocks.video.mockResolvedValue(new Blob(['video']));
  render(<Progress/>);
  fireEvent.click(await screen.findByRole('button', { name: /Ready to review/ }));
  await act(async () => useClinicalAccess.setState({ access: null }));
  await act(async () => resolve(record));
  expect(screen.queryByRole('region', { name: 'Movement Echoes' })).toBeNull();
});
