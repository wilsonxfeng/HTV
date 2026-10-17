import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config';
import { localDatabase, migrate, postgresDatabase } from './db';
import { LocalVideoStore, S3VideoStore } from './videos';
import { ClinicalRepository } from './repository';
import { GeminiReports } from './reports';
import { buildApi } from './app';
import { DEMO_PATIENT_ID } from './auth';

const config = await loadConfig();
await mkdir(config.dataDirectory, { recursive: true, mode: 0o700 });
const db = config.databaseUrl ? postgresDatabase(config.databaseUrl, config.databaseTlsMode) : localDatabase(resolve(config.dataDirectory, 'postgres'));
await migrate(db, Boolean(config.databaseUrl));
if (config.demo) await db.query(`INSERT INTO patients (id,display_name,demonstration,schedule) VALUES ($1,'Alex Morgan · Fictional demo',true,$2::jsonb) ON CONFLICT (id) DO NOTHING`, [DEMO_PATIENT_ID, JSON.stringify({ weekdays: [1, 3, 5], timeZone: 'America/Toronto' })]);
const videos = config.s3 ? new S3VideoStore(config.s3) : new LocalVideoStore(resolve(config.dataDirectory, 'videos'), config.secret, config.publicUrl);
const repository = new ClinicalRepository(db, videos);
if (config.demo && process.env.SEED_DEMO === 'true') {
  const { seedDemo } = await import('./seed-demo');
  await seedDemo(repository, resolve(config.dataDirectory, 'synthetic-fixtures'));
}
const reports = config.geminiKey ? new GeminiReports(config.geminiKey, config.geminiModel) : undefined;
const app = await buildApi(config, repository, reports);
await app.listen({ port: config.port, host: config.host });
console.log(`ReMotion API: ${config.publicUrl} (${config.demo ? 'LOCAL DEMO · fictional patient · embedded PostgreSQL/local video files' : 'TigerData/S3'})`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { if (closing) return; closing = true; await app.close(); await db.close(); process.exit(0); });
