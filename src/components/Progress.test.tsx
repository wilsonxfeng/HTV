// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useApp } from '../lib/store';
import { useClinicalAccess } from '../features/clinical-data/access';
import Progress from './Progress';

const mocks = vi.hoisted(() => ({ patients: vi.fn(), sessions: vi.fn(), progress: vi.fn(), request: vi.fn(), detail: vi.fn(), video: vi.fn(), handDemo: vi.fn(), kneeDemo: vi.fn() }));
vi.mock('../features/clinical-data/api', () => ({ ApiSessionRepository: class {
  patients = mocks.patients; sessions = mocks.sessions; progress = mocks.progress; request = mocks.request; detail = mocks.detail; video = mocks.video;
} }));
vi.mock('./History', () => ({ default: () => <div>Local saved sessions</div> }));
vi.mock('../features/movement-echoes/MovementEchoes', () => ({ default: ({ sessions, onClose }: { sessions?: { id: string }[]; onClose: () => void }) => <section aria-label="Movement Echoes"><p>{sessions?.map(s => s.id).join(',')}</p><button onClick={onClose}>Back to Progress</button></section> }));
vi.mock('../features/movement-echoes/handDemo', () => ({ loadHandDemo: mocks.handDemo }));
vi.mock('../features/body-exercises/bodyDemo', () => ({ loadKneeDemo: mocks.kneeDemo }));
beforeEach(() => {
  vi.clearAllMocks(); useClinicalAccess.setState({ access: null }); useApp.setState({ sessions: [] });
  mocks.patients.mockResolvedValue([{ id: 'assigned', displayName: 'Demo participant' }]);
  mocks.sessions.mockResolvedValue([]); mocks.progress.mockResolvedValue([]);
  mocks.handDemo.mockResolvedValue([{ id: 'finger-demo' }]); mocks.kneeDemo.mockResolvedValue([{ id: 'knee-demo' }]);
});
afterEach(cleanup);
it('puts search and exercise filters in Progress with no clinician dashboard link', () => {
  render(<Progress/>);
  expect(screen.getByRole('heading', { name: 'Ask ReMotion' })).toBeTruthy();
  expect(screen.getByLabelText('Exercise').textContent).toContain('Seated Knee Extension');
  expect(screen.getByLabelText('Ask about recorded movements').hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('Connect synced history')).toBeNull();
  expect(screen.queryByText('Clinician dashboard')).toBeNull();
});
it('allows assigned patient access to search synced history ', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } });
  mocks.request.mockResolvedValue({ status: 'empty', source: 'preset', message: 'No tracked measurements', metricLabel: 'Finger opening', evidence: [], action: null });
  render(<Progress/>);
  await waitFor(() => expect(mocks.sessions).toHaveBeenCalledWith('assigned', expect.any(AbortSignal)));
  fireEvent.click(screen.getByText('Greatest finger opening'));
  await screen.findByText('No tracked measurements');
  expect(JSON.parse(mocks.request.mock.calls[0][1].body).patientId).toBe('assigned');
});
it('refreshes synced history when an upload finishes', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } });
  render(<Progress/>);
  await waitFor(() => expect(mocks.sessions).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event('remotion-history-updated'));
  await waitFor(() => expect(mocks.sessions).toHaveBeenCalledTimes(2));
});
it('cancels searches and closes loaded evidence when the history account changes', async () => {
  useClinicalAccess.setState({ access: { token: 'test', patientId: 'assigned', role: 'patient', demonstration: true } });
  let resolve!: (value: unknown) => void;
  mocks.request.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = render(<Progress/>);
  fireEvent.click(screen.getByText('Greatest finger opening'));
  const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
  useClinicalAccess.setState({ access: null }); view.rerender(<Progress/>);
  await waitFor(() => expect(signal.aborted).toBe(true));
  resolve({ status: 'empty', source: 'preset', message: 'Stale account answer', metricLabel: '', evidence: [], action: null });
  expect(screen.queryByText('Stale account answer')).toBeNull();
});
