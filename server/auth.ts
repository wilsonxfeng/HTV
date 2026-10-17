import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { HttpError } from './validation';
export const DEMO_PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const principalSchema = z.object({ sub: z.string().min(1), role: z.enum(['patient', 'clinician']), patientIds: z.array(z.uuid()).max(100) });
export type Principal = z.infer<typeof principalSchema>;
const key = (secret: string) => new TextEncoder().encode(secret);
export async function issueToken(secret: string, principal: Principal) {
  principalSchema.parse(principal);
  return new SignJWT(principal).setProtectedHeader({ alg: 'HS256' }).setIssuer('remotion-api').setAudience('remotion').setIssuedAt().setExpirationTime('8h').sign(key(secret));
}
export async function authenticate(secret: string, header?: string): Promise<Principal> {
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue.');
  try {
    const { payload } = await jwtVerify(header.slice(7), key(secret), { algorithms: ['HS256'], issuer: 'remotion-api', audience: 'remotion' });
    return principalSchema.parse(payload);
  } catch { throw new HttpError(401, 'Your access link expired. Sign in again.'); }
}
export function authorize(principal: Principal, patientId: string, clinicianOnly = false) {
  if (!principal.patientIds.includes(patientId) || (clinicianOnly && principal.role !== 'clinician')) throw new HttpError(403, 'You do not have access to this patient.');
}
