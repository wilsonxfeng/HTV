import { GeminiIntentParser, intentSchema, requestSchema, presetIntent, type IntentParser } from './features/ask-remotion/intentParser';
import { executeSearch } from './features/ask-remotion/queryExecutor';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError, z } from 'zod';
import type { Config } from './config';
import { authenticate, authorize, DEMO_PATIENT_ID, issueToken } from './auth';
import type { Principal } from './auth';
import { ClinicalRepository } from './repository';
import { comparableTarget } from './reports';
import type { ReportGenerator } from './reports';
import { LocalVideoStore } from './videos';
import { completeSchema, createSchema, HttpError } from './validation';

export async function buildApi(config: Config, repository: ClinicalRepository, reports?: ReportGenerator, intentParser?: IntentParser) {
  const app = Fastify({ bodyLimit: 12 * 1024 * 1024, logger: false, requestTimeout: 30000, routerOptions: { maxParamLength: 4096 } });
  await app.register(cors, { origin: config.origin, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Range'], exposedHeaders: ['Content-Range', 'Accept-Ranges'], credentials: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    return payload;
  });
  const principal = (header?: string) => authenticate(config.secret, header);
  const sessionAccess = async (id: string, user: Principal, clinicianOnly = false) => {
    const session = await repository.raw(id); authorize(user, session.metadata.patientId, clinicianOnly); return session;
  };
  const id = (value: string) => z.uuid().parse(value);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request.', details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    if ((error as { statusCode?: number }).statusCode === 429) return reply.code(429).send({ error: 'Too many requests. Try again shortly.' });
    if ([400, 413, 414, 415].includes((error as { statusCode?: number }).statusCode ?? 0)) return reply.code((error as { statusCode: number }).statusCode).send({ error: 'Invalid or oversized request.' });
    // Never return database connection strings, SQL, signed URLs or provider error objects.
    return reply.code(500).send({ error: 'The request could not be completed. Try again.' });
  });
  app.get('/api/health', async () => {
    await repository.db.query('SELECT 1');
    return { status: 'ok', mode: config.demo ? 'local-demo' : 'cloud', database: config.databaseUrl ? 'tigerdata' : 'embedded-postgresql', videoStorage: repository.videos.kind, aiConfigured: Boolean(reports) };
  });
  if (config.demo || config.localDemoPatientId) app.post('/api/demo-access', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const { role } = z.object({ role: z.enum(['patient', 'clinician']) }).parse(request.body);
    const patientId = config.demo ? DEMO_PATIENT_ID : config.localDemoPatientId!;
    if (!config.demo) {
      if (role !== 'clinician') throw new HttpError(403, 'The cloud fixture preview provides clinician access only.');
      const fixture = await repository.db.query(`SELECT id FROM patients WHERE id=$1 AND demonstration=true AND NOT EXISTS (SELECT 1 FROM sessions WHERE patient_id=$1 AND metadata->>'videoKind' IS DISTINCT FROM 'synthetic')`, [patientId]);
      if (!fixture.rows.length) throw new HttpError(403, 'Demo access requires a fictional patient containing only synthetic fixtures.');
    }
    return { token: await issueToken(config.secret, { sub: `local-demo-${role}`, role, patientIds: [patientId] }), patientId, demonstration: true };
  });
  app.get('/api/patients', async request => {
    const user = await principal(request.headers.authorization);
    return repository.patients(user.patientIds);
  });
  app.post('/api/sessions', async request => {
    const user = await principal(request.headers.authorization);
    const metadata = createSchema.parse(request.body); authorize(user, metadata.patientId);
    if (user.role !== 'patient') throw new HttpError(403, 'Use patient access to upload a recording.');
    return repository.create(metadata);
  });
  app.post<{ Params: { id: string } }>('/api/sessions/:id/upload-url', async request => {
    const user = await principal(request.headers.authorization);
    const key = id(request.params.id); await sessionAccess(key, user);
    if (user.role !== 'patient') throw new HttpError(403, 'Use patient access to upload a recording.');
    return repository.uploadUrl(key);
  });
  app.post<{ Params: { id: string } }>('/api/sessions/:id/complete', async request => {
    const user = await principal(request.headers.authorization);
    const key = id(request.params.id); await sessionAccess(key, user);
    if (user.role !== 'patient') throw new HttpError(403, 'Use patient access to complete a recording.');
    return repository.complete(key, completeSchema.parse(request.body).motion);
  });
  app.get<{ Params: { id: string } }>('/api/patients/:id/sessions', async request => {
    const user = await principal(request.headers.authorization); const patientId = id(request.params.id); authorize(user, patientId);
    return repository.sessions(patientId);
  });
  app.get<{ Params: { id: string } }>('/api/patients/:id/progress', async request => {
    const user = await principal(request.headers.authorization); const patientId = id(request.params.id); authorize(user, patientId);
    return repository.progress(patientId);
  });
  app.get<{ Params: { id: string } }>('/api/sessions/:id', async request => {
    const user = await principal(request.headers.authorization); const key = id(request.params.id); await sessionAccess(key, user);
    return repository.detail(key);
  });
  app.get<{ Params: { id: string } }>('/api/sessions/:id/video-url', async request => {
    const user = await principal(request.headers.authorization); const key = id(request.params.id); await sessionAccess(key, user);
    return repository.videoUrl(key);
  });
  const searchParser = intentParser ?? (config.geminiKey ? new GeminiIntentParser(config.geminiKey, config.geminiModel) : undefined);
  app.post('/api/ask-remotion', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const user = await principal(request.headers.authorization);
    const input = requestSchema.parse(request.body); authorize(user, input.patientId);
    if (!input.preset && !searchParser) throw new HttpError(503, 'Question interpretation is unavailable. Try a suggested search.');
    const intent = input.preset ? presetIntent(input.preset, input.exerciseContext.side) : intentSchema.parse(await searchParser!.parse(input.question, input.exerciseContext));
    return executeSearch(repository.db, input.patientId, intent, input.preset ? 'preset' : 'gemini');
  });
  const reportLocks = new Map<string, Promise<unknown>>();
  app.post<{ Params: { id: string } }>('/api/sessions/:id/report', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async request => {
    const user = await principal(request.headers.authorization); const key = id(request.params.id); await sessionAccess(key, user);
    const current = await repository.detail(key);
    if (current.report) return current.report;
    if (!reports) throw new HttpError(503, 'Gemini is not configured. Recording and measurements remain available.');
    if (reportLocks.has(key)) return reportLocks.get(key);
    const work = (async () => {
      const candidates = (await repository.sessions(current.patientId)).filter(s => s.status === 'complete' && s.id !== key && s.exerciseId === current.exerciseId && s.hand === current.hand && s.demonstration === current.demonstration && s.videoKind === current.videoKind && Date.parse(s.startedAt) < Date.parse(current.startedAt)).slice(0, 12);
      const previous = [];
      for (const candidate of candidates) if (comparableTarget(await repository.detail(candidate.id)) === comparableTarget(current)) previous.push(candidate);
      return repository.saveReport(key, await reports.generate(current, previous));
    })();
    reportLocks.set(key, work);
    try { return await work; } finally { reportLocks.delete(key); }
  });
  if (repository.videos instanceof LocalVideoStore) {
    const videos = repository.videos;
    app.addContentTypeParser(/^video\//, { parseAs: 'buffer', bodyLimit: 200 * 1024 * 1024 }, (_request, body, done) => done(null, body));
    app.put<{ Params: { token: string } }>('/api/local-video/:token', { bodyLimit: 200 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const ticket = videos.verify(request.params.token, 'put');
      if (!Buffer.isBuffer(request.body)) throw new HttpError(400, 'Upload a video.');
      await videos.put(ticket, request.body, request.headers['content-type'] ?? ''); return reply.code(204).send();
    });
    app.get<{ Params: { token: string } }>('/api/local-video/:token', async (request, reply) => {
      const ticket = videos.verify(request.params.token, 'get');
      const buffer = await videos.get(ticket);
      reply.type(ticket.key.endsWith('.mp4') ? 'video/mp4' : 'video/webm').header('Cache-Control', 'private, no-store').header('Accept-Ranges', 'bytes');
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (!range) return reply.code(416).header('Content-Range', `bytes */${buffer.length}`).send();
        const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : buffer.length - 1, buffer.length - 1);
        if (start > end || start >= buffer.length) return reply.code(416).header('Content-Range', `bytes */${buffer.length}`).send();
        return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${buffer.length}`).send(buffer.subarray(start, end + 1));
      }
      return buffer;
    });
  }
  return app;
}
