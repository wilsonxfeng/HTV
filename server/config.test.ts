import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

vi.mock('dotenv', () => ({ config: vi.fn() }));
beforeEach(() => {
  for (const [key,value] of Object.entries({ NODE_ENV:'test', API_HOST:'127.0.0.1', DATABASE_TLS_MODE:'', DATABASE_CA_FILE:'', LOCAL_DEMO_PATIENT_ID:'', DEMO_MODE:'false', AUTH_SECRET:'test-only-secret-longer-than-thirty-two-characters', DATABASE_URL:'postgresql://example.invalid/test', S3_BUCKET:'test', S3_ACCESS_KEY_ID:'test', S3_SECRET_ACCESS_KEY:'test' })) vi.stubEnv(key,value);
});
afterEach(() => vi.unstubAllEnvs());
describe('database TLS configuration', () => {
  it('defaults to certificate and hostname verification', async () => {
    expect((await loadConfig()).databaseTlsMode).toBe('verify-full');
  });
  it('allows explicit encrypted-only TLS for a loopback prototype', async () => {
    vi.stubEnv('DATABASE_TLS_MODE','require');
    expect((await loadConfig()).databaseTlsMode).toBe('require');
  });
  it('rejects unverified TLS in production or on an externally bound API', async () => {
    vi.stubEnv('DATABASE_TLS_MODE','require');
    vi.stubEnv('NODE_ENV','production');
    await expect(loadConfig()).rejects.toThrow('restricted to local');
    vi.stubEnv('NODE_ENV','test');vi.stubEnv('API_HOST','0.0.0.0');
    await expect(loadConfig()).rejects.toThrow('restricted to local');
  });
  it('uses full verification when a trusted CA is configured', async () => {
    vi.stubEnv('DATABASE_TLS_MODE','require');vi.stubEnv('DATABASE_CA_FILE','server/database-ca.pem');
    const config=await loadConfig();
    expect(config.databaseTlsMode).toBe('verify-full');
    expect(new URL(config.databaseUrl!).searchParams.get('sslrootcert')).toMatch(/server\/database-ca.pem$/);
  });
  it('rejects local cloud-demo access in production or on a public bind', async () => {
    vi.stubEnv('LOCAL_DEMO_PATIENT_ID','00000000-0000-4000-8000-000000000001');
    expect((await loadConfig()).localDemoPatientId).toBeTruthy();
    vi.stubEnv('NODE_ENV','production');
    await expect(loadConfig()).rejects.toThrow('local nonproduction');
    vi.stubEnv('NODE_ENV','test');vi.stubEnv('API_HOST','0.0.0.0');
    await expect(loadConfig()).rejects.toThrow('local nonproduction');
  });
});
