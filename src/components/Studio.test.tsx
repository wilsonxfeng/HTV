// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createDemoSession } from '../lib/demo';
import { useApp } from '../lib/store';
import Studio from './Studio';
const stage = vi.hoisted(() => vi.fn());
vi.mock('./HandStage', () => ({ default: (props: unknown) => { stage(props); return <div aria-label="Hand replay"/>; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps visual replay and layer controls while hiding numeric measurement panels', () => {
  useApp.setState({ sessions: [] });
  const view = render(<Studio session={createDemoSession()}/>);
  expect(view.container.textContent).not.toMatch(/°|%|Measurements|Spread graph|Tracked recording/);
  expect(screen.getByLabelText('Replay position')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
  expect(stage.mock.lastCall?.[0].showReference).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Show differences' }));
  expect(stage.mock.lastCall?.[0].showVectors).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(screen.getByRole('button', { name: 'Pause replay' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
  expect(screen.getByRole('button', { name: 'Play replay' })).toBeTruthy();
});
