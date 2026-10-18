import { z } from 'zod';
import { isValidHand } from '../src/lib/geometry';
import { poseIsVisible } from '../src/features/body-tracking/poseMetrics';
import { getExercise, BODY_ANALYSIS_VERSION, BODY_SEGMENTATION_VERSION } from '../src/features/body-exercises/exerciseRegistry';

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
// The supplied curl recordings use a front view; cohorts still keep viewpoints separate.
const supportedCameraView = (id: string, view?: string) => view === getExercise(id).cameraView || (id === 'unweighted-bicep-curl' && view === 'front');
const exerciseId = z.enum(['finger-spread-close', 'seated-knee-extension', 'unweighted-bicep-curl', 'seated-trunk-rotation']);
const bodyMetadata = {trackingMode: z.enum(['hand','pose']).optional(), bodyRegion: z.enum(['hand','arm','leg','core']).optional(), cameraView: z.enum(['front','side','three-quarter']).optional(), targetSide: z.enum(['Left','Right']).optional(), analysisVersion: z.string().max(40).optional(), segmentationCacheVersion: z.string().max(40).optional()};
export const createSchema = z.object({
  ...bodyMetadata,
  id: z.uuid(), patientId: z.uuid(), exerciseId, hand: z.enum(['Left', 'Right']), startedAt: z.iso.datetime({ offset: true }), demonstration: z.boolean(), videoKind: z.enum(['camera', 'synthetic']),
  video: z.object({ mimeType: z.string().regex(/^video\/(webm|mp4)(;codecs=[a-zA-Z0-9., _-]+)?$/), sizeBytes: z.number().int().positive().max(200 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096), durationMs: z.number().min(600).max(90000), landmarkOffsetMs: z.number().min(-2000).max(2000), mirrored: z.boolean() }).strict(),
}).strict().superRefine((value,ctx)=>{
  const exercise=getExercise(value.exerciseId);
  if(exercise.trackingMode==='pose' && (value.trackingMode!=='pose'||value.bodyRegion!==exercise.bodyRegion||!supportedCameraView(value.exerciseId,value.cameraView)||value.targetSide!==value.hand||value.analysisVersion!==BODY_ANALYSIS_VERSION||value.segmentationCacheVersion!==BODY_SEGMENTATION_VERSION))ctx.addIssue({code:'custom',message:'Body recording metadata must match its exercise, side and analysis version.'});
  if(exercise.trackingMode==='hand' && value.trackingMode==='pose')ctx.addIssue({code:'custom',message:'Hand recordings cannot use pose tracking.'});
});
const handMotionSchema = z.object({
  id: z.uuid(), exerciseId: z.literal('finger-spread-close').optional(), createdAt: z.iso.datetime({ offset: true }), hand: z.enum(['Left', 'Right']), duration: z.number().min(.6).max(90), cycleDuration: z.union([z.literal(6), z.literal(8), z.literal(10)]), source: z.enum(['camera', 'demo']), completed: z.boolean().optional(),
  frames: z.array(frame).min(2).max(1800),
  calibration: z.object({ neutral: handPoints, target: handPoints, source: z.enum(['personal', 'clinician', 'exemplar', 'demo']), hand: z.enum(['Left', 'Right']), createdAt: z.iso.datetime({ offset: true }), exemplarName: z.string().max(255).optional(), exemplarFrames: z.number().int().positive().optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.calibration.hand !== value.hand) ctx.addIssue({ code: 'custom', message: 'Calibration hand differs from recording.' });
  if (value.frames.some((f, i) => f.t > value.duration || (i > 0 && f.t - value.frames[i - 1].t < .001))) ctx.addIssue({ code: 'custom', message: 'Frames must have increasing timestamps at least 1 ms apart inside the recording.' });
});
const posePoint = point.extend({visibility:z.number().min(0).max(1).optional(),presence:z.number().min(0).max(1).optional()});
const posePoints = z.array(posePoint).length(33);
const poseFrame = z.object({t:z.number().min(0).max(90),tracking:z.boolean(),confidence:z.number().min(0).max(1),landmarks:z.array(posePoint).max(33),worldLandmarks:posePoints.optional(),imageLandmarks:posePoints.optional()}).strict();
export const poseMotionSchema = z.object({
  ...bodyMetadata,trackingMode:z.literal('pose'),exerciseId,
  id:z.uuid(),createdAt:z.iso.datetime({offset:true}),hand:z.enum(['Left','Right']),duration:z.number().min(.6).max(90),cycleDuration:z.literal(8),source:z.enum(['camera','demo']),completed:z.boolean().optional(),repetitionTarget:z.number().int().min(1).max(5),
  frames:z.array(poseFrame).min(2).max(1800),
  calibration:z.object({neutral:posePoints,target:posePoints,imageNeutral:posePoints,source:z.enum(['personal','clinician','demo']),hand:z.enum(['Left','Right']),createdAt:z.iso.datetime({offset:true})}).strict(),
}).strict().superRefine((value,ctx)=>{
  const exercise=getExercise(value.exerciseId);
  if(exercise.trackingMode!=='pose'||value.bodyRegion!==exercise.bodyRegion||!supportedCameraView(value.exerciseId,value.cameraView)||value.targetSide!==value.hand||value.analysisVersion!==BODY_ANALYSIS_VERSION||value.segmentationCacheVersion!==BODY_SEGMENTATION_VERSION)ctx.addIssue({code:'custom',message:'Body metadata does not match this exercise.'});
  if(value.calibration.hand!==value.hand||!poseIsVisible(value.calibration.imageNeutral,value.calibration.neutral,value.exerciseId,value.hand))ctx.addIssue({code:'custom',message:'A visible baseline of the selected side is required.'});
  if(value.frames.some((f,i)=>f.t>value.duration||(i>0&&f.t-value.frames[i-1].t<.001)))ctx.addIssue({code:'custom',message:'Frames must increase inside the recording clock.'});
  if(value.frames.some(f=>f.tracking?(f.landmarks.length!==33||!poseIsVisible(f.imageLandmarks??[],f.worldLandmarks??[],value.exerciseId,value.hand)):f.landmarks.length!==0))ctx.addIssue({code:'custom',message:'Tracked pose frames need 33 visible image/world points. Lost tracking must stay a gap.'});
});
export const motionSchema=z.union([handMotionSchema,poseMotionSchema]);
export const completeSchema = z.object({ motion: motionSchema }).strict();
export const reportSchema = z.object({ patientSummary: z.string().min(1).max(1600), clinicianSummary: z.string().min(1).max(2500), limitations: z.array(z.string().max(500)).min(1).max(8) }).strict();
export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
