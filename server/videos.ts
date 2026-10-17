import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SignedTransfer, VideoMetadata } from '../src/features/clinical-data/contracts';
import type { Config } from './config';
import { HttpError } from './validation';

export interface VideoStore {
  kind: 'local' | 's3';
  upload(key: string, video: VideoMetadata): Promise<SignedTransfer>;
  playback(key: string): Promise<SignedTransfer>;
  finalize(stagingKey: string, finalKey: string, video: VideoMetadata): Promise<void>;
}
type Ticket = { key: string; purpose: 'put' | 'get'; exp: number; video?: VideoMetadata };
export class LocalVideoStore implements VideoStore {
  kind = 'local' as const;
  constructor(private directory: string, private secret: string, private publicUrl: string) {}
  private path(key: string) {
    if (!/^[a-zA-Z0-9/-]+\.(webm|mp4)$/.test(key) || key.includes('..')) throw new HttpError(400, 'Invalid video key.');
    return join(this.directory, key);
  }
  private ticket(key: string, purpose: 'put' | 'get', video?: VideoMetadata): SignedTransfer {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const body = Buffer.from(JSON.stringify({ key, purpose, exp, video })).toString('base64url');
    const signature = createHmac('sha256', this.secret).update(body).digest('base64url');
    return { url: `${this.publicUrl}/api/local-video/${body}.${signature}`, headers: video ? { 'Content-Type': video.mimeType } : {}, expiresAt: new Date(exp * 1000).toISOString() };
  }
  verify(token: string, purpose: Ticket['purpose']): Ticket {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw new HttpError(403, 'Invalid video link.');
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(403, 'Invalid video link.');
    const ticket = JSON.parse(Buffer.from(body, 'base64url').toString()) as Ticket;
    if (ticket.purpose !== purpose || ticket.exp <= Date.now() / 1000) throw new HttpError(403, 'Video link expired. Request a new one.');
    this.path(ticket.key); return ticket;
  }
  async upload(key: string, video: VideoMetadata) { return this.ticket(key, 'put', video); }
  async playback(key: string) { return this.ticket(key, 'get'); }
  async put(ticket: Ticket, buffer: Buffer, mime: string) {
    if (!ticket.video || buffer.length !== ticket.video.sizeBytes || mime !== ticket.video.mimeType || createHash('sha256').update(buffer).digest('hex') !== ticket.video.sha256) throw new HttpError(400, 'Video does not match its declared size, type, or checksum.');
    const path = this.path(ticket.key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, buffer, { mode: 0o600 });
  }
  async get(ticket: Ticket) {
    try { return await readFile(this.path(ticket.key)); }
    catch { throw new HttpError(404, 'Video not found.'); }
  }
  async finalize(stagingKey: string, finalKey: string, video: VideoMetadata) {
    const path = this.path(stagingKey);
    try {
      const info = await stat(path);
      const bytes = await readFile(path);
      if (info.size !== video.sizeBytes || bytes.length !== video.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== video.sha256) throw new Error('mismatch');
      const final = this.path(finalKey); await mkdir(dirname(final), { recursive: true }); await writeFile(final, bytes, { mode: 0o600 });
    } catch { throw new HttpError(409, 'Video upload is missing or incomplete. Upload it again.'); }
  }
}

export class S3VideoStore implements VideoStore {
  kind = 's3' as const;
  private client: S3Client;
  constructor(private config: NonNullable<Config['s3']>) {
    this.client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: Boolean(config.endpoint), credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  }
  async upload(key: string, video: VideoMetadata) {
    const command = new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: video.mimeType, ContentLength: video.sizeBytes });
    // The expected checksum lives in the database and is verified against actual bytes.
    // Avoid redundant client metadata headers that require extra bucket CORS permissions.
    return { url: await getSignedUrl(this.client, command, { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) }), headers: { 'Content-Type': video.mimeType }, expiresAt: new Date(Date.now() + 300000).toISOString() };
  }
  async playback(key: string) {
    return { url: await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn: 300 }), headers: {}, expiresAt: new Date(Date.now() + 300000).toISOString() };
  }
  async finalize(stagingKey: string, finalKey: string, video: VideoMetadata) {
    try {
      const source = { Bucket: this.config.bucket, Key: stagingKey };
      const head = await this.client.send(new HeadObjectCommand(source));
      if (head.ContentLength !== video.sizeBytes || head.ContentType !== video.mimeType || !head.ETag) throw Error('metadata mismatch');
      // Verify the actual bytes, not just client-supplied metadata. No camera content goes to Gemini.
      const object = await this.client.send(new GetObjectCommand({ ...source, IfMatch: head.ETag }));
      const hash = createHash('sha256');
      if (!object.Body) throw Error('empty body');
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) hash.update(chunk);
      if (hash.digest('hex') !== video.sha256) throw Error('checksum mismatch');
      await this.client.send(new CopyObjectCommand({ Bucket: this.config.bucket, Key: finalKey, CopySource: `${this.config.bucket}/${stagingKey}`, CopySourceIfMatch: head.ETag, ContentType: video.mimeType, MetadataDirective: 'REPLACE', Metadata: { sha256: video.sha256 } }));
    } catch { throw new HttpError(409, 'Video upload is missing or incomplete. Upload it again.'); }
  }
}
