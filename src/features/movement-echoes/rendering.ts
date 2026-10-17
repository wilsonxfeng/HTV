import { fitPalm, inversePoint } from './geometry';
import type { Similarity } from './geometry';
import type { GhostCache, GhostFrame, Palm, Point } from './types';

export const ECHO_COLORS = [
  '#c6acd9',
  '#e5a6bc',
  '#99c3a0',
  '#e8c16c',
  '#9ebfdb',
];
export interface DecodedGhost {
  frame: GhostFrame;
  image: ImageBitmap;
  alpha: Uint8Array;
}
export interface DrawnGhost {
  sessionId: string;
  transform: Similarity;
  decoded: DecodedGhost;
}
export async function decodeCache(cache: GhostCache, color: string) {
  const decoded: DecodedGhost[] = [];
  try {
    for (const frame of cache.frames) {
      if (!frame.quality.valid) continue;
      const original = await createImageBitmap(frame.image);
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(original, 0, 0);
      original.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      decoded.push({ frame, image: await createImageBitmap(canvas), alpha });
    }
    return decoded;
  } catch (e) {
    decoded.forEach((v) => v.image.close());
    throw e;
  }
}
export function sampleGhost(
  decoded: DecodedGhost[],
  phase: number,
  staticPose = false,
) {
  const closest = decoded.reduce<DecodedGhost | undefined>(
    (best, v) =>
      !best ||
      Math.abs(v.frame.phase - phase) <
        Math.abs(best.frame.phase - phase) - 1e-9
        ? v
        : best,
    undefined,
  );
  return closest &&
    (staticPose || Math.abs(closest.frame.phase - phase) <= 0.055)
    ? closest
    : undefined;
}
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  decoded: DecodedGhost,
  target: Palm,
  opacity: number,
  sessionId: string,
): DrawnGhost | null {
  if (!decoded.image.width) return null;
  const transform = fitPalm(decoded.frame.anchors, target);
  if (!transform) return null;
  const palmWidth = Math.hypot(
    target[1].x - target[3].x,
    target[1].y - target[3].y,
  );
  if (
    transform.scale < 0.15 ||
    transform.scale > 8 ||
    transform.error / Math.max(1, palmWidth) > 0.13
  )
    return null;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.setTransform(
    transform.a,
    transform.b,
    -transform.b,
    transform.a,
    transform.tx,
    transform.ty,
  );
  ctx.drawImage(decoded.image, 0, 0);
  ctx.restore();
  return { sessionId, transform, decoded };
}
export function hitGhosts(point: Point, drawn: DrawnGhost[]) {
  return drawn
    .filter((layer) => {
      const p = inversePoint(point, layer.transform),
        { width, height } = layer.decoded.frame;
      const x = Math.floor(p.x),
        y = Math.floor(p.y);
      return (
        x >= 0 &&
        x < width &&
        y >= 0 &&
        y < height &&
        layer.decoded.alpha[y * width + x] > 40
      );
    })
    .reverse()
    .map((v) => v.sessionId);
}
