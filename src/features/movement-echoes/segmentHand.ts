import type { MaskQuality, Point, SegmentationConfig } from './types';

type Color = [number, number, number];
const distance = (a: Color, b: Color) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
// Luminance has less weight: learn the person's observed chroma, not a fixed skin-tone range.
function color(data: Uint8ClampedArray, i: number): Color {
  const r = data[i],
    g = data[i + 1],
    b = data[i + 2];
  return [(r + g + b) / 6, r - g, (r + g) / 2 - b];
}
export function segmentHand(
  pixels: ImageData,
  landmarks: Point[],
  config: SegmentationConfig,
  background?: ImageData,
) {
  const { width: w, height: h, data } = pixels;
  const empty: MaskQuality = {
    score: 0,
    valid: false,
    palmRetained: 0,
    tipsRetained: 0,
    edgeLeak: 0,
    area: 0,
    warnings: ['Hand tracking unavailable.'],
  };
  if (landmarks.length !== 21)
    return {
      rgba: new Uint8ClampedArray(data.length),
      alpha: new Uint8Array(w * h),
      quality: empty,
    };
  const pts = landmarks.map((p) => ({ x: p.x * w, y: p.y * h }));
  const wrist = pts[0],
    middle = pts[9];
  const length = Math.hypot(middle.x - wrist.x, middle.y - wrist.y);
  const ux = (middle.x - wrist.x) / length,
    uy = (middle.y - wrist.y) / length;
  const pad = length * 0.32;
  const x0 = Math.max(1, Math.floor(Math.min(...pts.map((p) => p.x)) - pad)),
    x1 = Math.min(w - 2, Math.ceil(Math.max(...pts.map((p) => p.x)) + pad));
  const y0 = Math.max(1, Math.floor(Math.min(...pts.map((p) => p.y)) - pad)),
    y1 = Math.min(h - 2, Math.ceil(Math.max(...pts.map((p) => p.y)) + pad));
  // Fingertip estimates can sample the room; learn from interior joints/palm.
  const seeds: Point[] = [
    ...[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19].map((i) => pts[i]),
    { x: (wrist.x + middle.x) / 2, y: (wrist.y + middle.y) / 2 },
    ...pts
      .slice(5)
      .filter((_, i) => i % 4 === 0)
      .map((p) => ({ x: (p.x + wrist.x) / 2, y: (p.y + wrist.y) / 2 })),
  ];
  const palette: Color[] = [];
  for (const p of seeds)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(p.x) + dx,
          y = Math.round(p.y) + dy;
        if (x > 0 && x < w && y > 0 && y < h)
          palette.push(color(data, (y * w + x) * 4));
      }
  // Per-recording background palette comes from outside a generously padded landmark hull.
  // It is a color classifier only; no landmark line becomes a finger contour.
  const tolerance = 15 * config.colorTolerance;
  const candidate = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if ((x - wrist.x) * ux + (y - wrist.y) * uy < -length * 0.045) continue; // crop at the anatomical wrist
      const i = y * w + x,
        c = color(data, i * 4);
      let d = Infinity;
      for (let k = 0; k < palette.length; k += 3) {
        const e = distance(c, palette[k]);
        if (e < d) d = e;
      }
      if (d > tolerance) continue;
      if (
        background?.data[i * 4 + 3] &&
        distance(c, color(background.data, i * 4)) < 12
      )
        continue;
      candidate[i] = 1;
    }
  // A palm-connected component discards similar-colored faces and isolated room pixels.
  const alpha = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  const center = { x: (wrist.x + middle.x) / 2, y: (wrist.y + middle.y) / 2 };
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const i = (Math.round(center.y) + dy) * w + Math.round(center.x) + dx;
      if (candidate[i] && !alpha[i]) {
        alpha[i] = 255;
        queue[tail++] = i;
      }
    }
  while (head < tail) {
    const i = queue[head++];
    for (const j of [i - 1, i + 1, i - w, i + w])
      if (candidate[j] && !alpha[j]) {
        alpha[j] = 255;
        queue[tail++] = j;
      }
  }
  // Fill isolated one-pixel holes only. No closing operation that bridges finger gaps.
  const filled = alpha.slice();
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) {
      const i = y * w + x;
      if (
        !alpha[i] &&
        alpha[i - 1] &&
        alpha[i + 1] &&
        alpha[i - w] &&
        alpha[i + w]
      )
        filled[i] = 255;
    }
  // Fill only small enclosed defects. Finger gaps connect to the exterior and
  // are never closed or drawn over.
  const visited = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const first = y * w + x;
      if (filled[first] || visited[first]) continue;
      head = 0;
      tail = 1;
      queue[0] = first;
      visited[first] = 1;
      let boundary = false;
      while (head < tail) {
        const i = queue[head++],
          px = i % w,
          py = Math.floor(i / w);
        if (px <= x0 || px >= x1 || py <= y0 || py >= y1) {
          boundary = true;
          continue;
        }
        for (const j of [i - 1, i + 1, i - w, i + w])
          if (!filled[j] && !visited[j]) {
            visited[j] = 1;
            queue[tail++] = j;
          }
      }
      if (!boundary && tail <= 70)
        for (let j = 0; j < tail; j++) filled[queue[j]] = 255;
    }
  const retained = (p: Point, r: number) => {
    let n = 0,
      total = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(p.x) + dx,
          y = Math.round(p.y) + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        total++;
        if (filled[y * w + x]) n++;
      }
    return total ? n / total : 0;
  };
  const palmRetained =
    [pts[5], pts[9], pts[17], center].reduce((s, p) => s + retained(p, 2), 0) /
    4;
  const tipsRetained = [4, 8, 12, 16, 20].filter(
    (i) => retained(pts[i], 3) > 0.16,
  ).length;
  let area = 0,
    edges = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (filled[i]) {
        area++;
        if (x === x0 || x === x1 || y === y0 || y === y1) edges++;
      }
    }
  const edgeLeak = edges / Math.max(1, 2 * (x1 - x0 + y1 - y0));
  const warnings: string[] = [];
  if (palmRetained < 0.7)
    warnings.push('Palm pixels were not retained reliably.');
  if (tipsRetained < 5)
    warnings.push('Some fingertips could not be extracted.');
  if (edgeLeak > 0.015)
    warnings.push('Background may be connected to the hand.');
  if (area < length * length * 0.35 || area > length * length * 6)
    warnings.push('Hand outline area is unusual.');
  const score = Math.max(
    0,
    Math.min(1, palmRetained * 0.5 + (tipsRetained / 5) * 0.5 - edgeLeak),
  );
  const quality: MaskQuality = {
    score,
    valid: warnings.length === 0,
    palmRetained,
    tipsRetained,
    edgeLeak,
    area,
    warnings,
  };
  const rgba = new Uint8ClampedArray(data.length);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 4];
    rgba[i * 4 + 1] = data[i * 4 + 1];
    rgba[i * 4 + 2] = data[i * 4 + 2];
    // One pixel of interior feather retains the original silhouette boundary.
    let a = filled[i];
    if (
      config.feather &&
      a &&
      (!filled[i - 1] || !filled[i + 1] || !filled[i - w] || !filled[i + w])
    )
      a = 190;
    rgba[i * 4 + 3] = a;
  }
  return { rgba, alpha: filled, quality };
}
