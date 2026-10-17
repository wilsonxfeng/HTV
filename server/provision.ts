import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadConfig } from './config';
import { migrate, postgresDatabase } from './db';
import { issueToken } from './auth';

const config = await loadConfig();
if (!config.databaseUrl || config.demo) throw Error('Use configured TigerData credentials to provision access. Local demo already supplies a fictional patient.');
const [displayName, clinicianSubject, weekdayText, timeZone = 'UTC'] = process.argv.slice(2);
if (!displayName || !clinicianSubject) throw Error('Usage: npm run api:provision -- DISPLAY_NAME CLINICIAN_SUBJECT [1,3,5] [TIME_ZONE]');
const name = z.string().min(1).max(100).parse(displayName);
new Intl.DateTimeFormat('en', { timeZone }).format();
const weekdays = weekdayText ? z.array(z.number().int().min(0).max(6)).min(1).max(7).parse(weekdayText.split(',').map(Number)) : null;
const db = postgresDatabase(config.databaseUrl, config.databaseTlsMode);
try {
  await migrate(db, true);
  const id = randomUUID();
  await db.query('INSERT INTO patients (id,display_name,schedule) VALUES ($1,$2,$3::jsonb)', [id, name, weekdays ? JSON.stringify({ weekdays: [...new Set(weekdays)], timeZone }) : null]);
  console.log(JSON.stringify({ patientId: id, patientAccessToken: await issueToken(config.secret, { sub: id, role: 'patient', patientIds: [id] }), clinicianAccessToken: await issueToken(config.secret, { sub: clinicianSubject, role: 'clinician', patientIds: [id] }) }, null, 2));
} finally { await db.close(); }
