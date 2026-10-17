import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export interface Config {
  demo: boolean; port: number; host: string; origin: string; publicUrl: string;
  dataDirectory: string; secret: string; databaseUrl?: string; databaseTlsMode?: 'verify-full' | 'require';
  geminiKey?: string; geminiModel: string;
  s3?: { bucket: string; region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string };
  localDemoPatientId?: string;
}
export async function loadConfig(): Promise<Config> {
  // Explicit process settings win, followed by local overrides and server credentials.
  loadEnv({ path: ['.env.server', 'server/.env'], quiet: true });
  const env = process.env;
  const demo = env.DEMO_MODE === 'true';
  const host = env.API_HOST || '127.0.0.1';
  const localDemoPatientId = env.LOCAL_DEMO_PATIENT_ID || undefined;
  if (localDemoPatientId && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(localDemoPatientId) || env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host))) throw Error('LOCAL_DEMO_PATIENT_ID requires a UUID and a local nonproduction API.');
  const requestedTlsMode = env.DATABASE_TLS_MODE || 'verify-full';
  if (!['verify-full', 'require'].includes(requestedTlsMode)) throw Error('DATABASE_TLS_MODE must be verify-full or require.');
  const databaseTlsMode = env.DATABASE_CA_FILE ? 'verify-full' : requestedTlsMode as 'verify-full' | 'require';
  if (databaseTlsMode === 'require' && (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host))) throw Error('Unverified database TLS is restricted to local nonproduction prototypes. Use verify-full with a trusted CA for deployment.');
  if (demo && (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host))) throw Error('Local demo must bind to loopback outside production.');
  const port = Number(env.API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid API_PORT.');
  const dataDirectory = resolve(env.LOCAL_DATA_DIR || '.remotion-data');
  let secret = env.AUTH_SECRET;
  if (demo && !secret) {
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
    const path = resolve(dataDirectory, 'auth-secret');
    try { secret = await readFile(path, 'utf8'); }
    catch { secret = randomBytes(48).toString('hex'); await writeFile(path, secret, { mode: 0o600, flag: 'wx' }); }
  }
  if (!secret || secret.length < 32 || secret === 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS') throw Error('Set AUTH_SECRET to at least 32 random characters in .env.server.');
  const s3 = env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? {
    bucket: env.S3_BUCKET, region: env.S3_REGION || 'auto', endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  } : undefined;
  if (!demo && (!env.DATABASE_URL || !s3)) throw Error('Set DATABASE_URL and S3 credentials in .env.server, or explicitly run api:demo for local-only storage.');
  let databaseUrl = demo ? undefined : env.DATABASE_URL;
  if (databaseUrl && env.DATABASE_CA_FILE) {
    const url = new URL(databaseUrl);
    url.searchParams.set('sslrootcert', resolve(env.DATABASE_CA_FILE));
    databaseUrl = url.toString();
  }
  return { demo, host, port, origin: env.APP_ORIGIN || 'http://localhost:5173', publicUrl: env.API_PUBLIC_URL || `http://localhost:${port}`, dataDirectory, secret, databaseUrl, databaseTlsMode, localDemoPatientId, s3: demo ? undefined : s3, geminiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash' };
}
