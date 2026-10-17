import { create } from 'zustand';
import { ApiSessionRepository } from './api';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
export interface ClinicalAccess { token: string; patientId: string; demonstration: boolean; role: 'patient' | 'clinician' }
const key = 'remotion-clinical-access';
function savedAccess(): ClinicalAccess | null {
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? 'null'); return value && typeof value.token === 'string' && typeof value.patientId === 'string' && ['patient', 'clinician'].includes(value.role) ? value : null; }
  catch { return null; }
}
export const useClinicalAccess = create<{ access: ClinicalAccess | null; setAccess: (access: ClinicalAccess | null) => void }>(set => ({
  access: savedAccess(),
  setAccess: access => { if (access) sessionStorage.setItem(key, JSON.stringify(access)); else sessionStorage.removeItem(key); set({ access }); },
}));
export const clinicalRepository = new ApiSessionRepository(API_BASE_URL, () => useClinicalAccess.getState().access?.token ?? null);
export async function demoAccess(role: ClinicalAccess['role']): Promise<ClinicalAccess> {
  const response = await fetch(`${API_BASE_URL}/api/demo-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  if (!response.ok) throw Error('Local demo unavailable. Start the local demo API, or use a provided access token.');
  return { ...await response.json() as Omit<ClinicalAccess, 'role'>, role };
}
