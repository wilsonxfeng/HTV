import { z } from 'zod';
import { isValidHand } from '../src/lib/geometry';

const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict();
const handPoints = z.array(point).length(21).refine(isValidHand, 'Invalid hand geometry');
const frame = z.object({
  t: z.number().min(0).max(90), tracking: z.boolean(), confidence: z.number().min(0).max(1),
  landmarks: z.array(point).max(21), worldLandmarks: z.array(point).length(21).optional(), imageLandmarks: z.array(point).length(21).optional(), modelHandedness: z.string().max(20).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.tracking && (!isValidHand(value.landmarks) || value.imageLandmarks?.length !== 21 || value.worldLandmarks?.length !== 21)) ctx.addIssue({ code: 'custom', message: 'Tracked frames need normalized, image and world coordinates.' });
  if (!value.tracking && value.landmarks.length) ctx.addIssue({ code: 'custom', message: 'Lost tracking must remain a gap.' });
  if (value.imageLandmarks?.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) ctx.addIssue({ code: 'custom', message: 'Image coordinates are outside the video.' });
});
export const createSchema = z.object({
  id: z.uuid(), patientId: z.uuid(), exerciseId: z.literal('finger-spread-close'), hand: z.enum(['Left', 'Right']), startedAt: z.iso.datetime({ offset: true }), demonstration: z.boolean(), videoKind: z.enum(['camera', 'synthetic']),
  video: z.object({ mimeType: z.string().regex(/^video\/(webm|mp4)(;codecs=[a-zA-Z0-9., _-]+)?$/), sizeBytes: z.number().int().positive().max(200 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096), durationMs: z.number().min(600).max(90000), landmarkOffsetMs: z.number().min(-2000).max(2000), mirrored: z.boolean() }).strict(),
}).strict();
export const motionSchema = z.object({
  id: z.uuid(), exerciseId: z.literal('finger-spread-close').optional(), createdAt: z.iso.datetime({ offset: true }), hand: z.enum(['Left', 'Right']), duration: z.number().min(.6).max(90), cycleDuration: z.union([z.literal(6), z.literal(8), z.literal(10)]), source: z.enum(['camera', 'demo']), completed: z.boolean().optional(),
  frames: z.array(frame).min(2).max(1800),
  calibration: z.object({ neutral: handPoints, target: handPoints, source: z.enum(['personal', 'clinician', 'exemplar', 'demo']), hand: z.enum(['Left', 'Right']), createdAt: z.iso.datetime({ offset: true }), exemplarName: z.string().max(255).optional(), exemplarFrames: z.number().int().positive().optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.calibration.hand !== value.hand) ctx.addIssue({ code: 'custom', message: 'Calibration hand differs from recording.' });
  if (value.frames.some((f, i) => f.t > value.duration || (i > 0 && f.t - value.frames[i - 1].t < .001))) ctx.addIssue({ code: 'custom', message: 'Frames must have increasing timestamps at least 1 ms apart inside the recording.' });
});
export const completeSchema = z.object({ motion: motionSchema }).strict();
export const reportSchema = z.object({ patientSummary: z.string().min(1).max(1600), clinicianSummary: z.string().min(1).max(2500), limitations: z.array(z.string().max(500)).min(1).max(8) }).strict();
export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
