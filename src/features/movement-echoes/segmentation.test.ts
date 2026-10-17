import { describe, expect, it } from 'vitest';
import { segmentHand } from './segmentHand';
import { DEFAULT_CONFIG } from './types';

/** Synthetic raster fixture only; not presented as real camera evidence. */
function fixture() {
  const width = 120,
    height = 140,
    data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([30, 80, 160, 255], i * 4);
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        data.set([164, 100, 78, 255], (y * width + x) * 4);
  };
  paint(35, 75, 86, 115);
  paint(29, 50, 40, 88);
  paint(40, 29, 49, 85);
  paint(53, 20, 62, 85);
  paint(66, 30, 75, 85);
  paint(79, 43, 88, 85);
  const points = [
    [60, 112],
    [42, 95],
    [36, 80],
    [35, 65],
    [35, 52],
    [45, 80],
    [45, 63],
    [45, 45],
    [45, 31],
    [58, 80],
    [58, 60],
    [58, 40],
    [58, 22],
    [71, 80],
    [71, 63],
    [71, 47],
    [71, 32],
    [83, 80],
    [83, 67],
    [83, 55],
    [83, 45],
  ].map(([x, y]) => ({ x: x / width, y: y / height }));
  return {
    pixels: { width, height, data, colorSpace: 'srgb' } as ImageData,
    points,
  };
}
describe('pixel-derived hand extraction', () => {
  it('retains real source colors and five tips, with transparent finger gaps', () => {
    const { pixels, points } = fixture();
    const result = segmentHand(pixels, points, DEFAULT_CONFIG);
    expect(result.quality.tipsRetained).toBe(5);
    expect(result.alpha[40 * 120 + 51]).toBe(0);
    expect(result.alpha[40 * 120 + 58]).toBe(255);
    const i = (90 * 120 + 60) * 4;
    expect([...result.rgba.slice(i, i + 3)]).toEqual([
      ...pixels.data.slice(i, i + 3),
    ]);
  });
  it('never substitutes geometry when hand tracking is missing', () => {
    const { pixels } = fixture();
    const result = segmentHand(pixels, [], DEFAULT_CONFIG);
    expect(result.quality.valid).toBe(false);
    expect(result.alpha.some(Boolean)).toBe(false);
  });
  it('marks extraction invalid when a fingertip is absent from the image', () => {
    const { pixels, points } = fixture();
    for (let y = 19; y < 45; y++)
      for (let x = 52; x < 64; x++)
        pixels.data.set([30, 80, 160, 255], (y * 120 + x) * 4);
    expect(segmentHand(pixels, points, DEFAULT_CONFIG).quality.valid).toBe(
      false,
    );
  });
  it('preserves open finger gaps while filling a small enclosed compression defect', () => {
    const { pixels, points } = fixture();
    pixels.data.set([30, 80, 160, 255], (95 * 120 + 60) * 4);
    const result = segmentHand(pixels, points, DEFAULT_CONFIG);
    expect(result.alpha[95 * 120 + 60]).toBe(255);
    expect(result.alpha[40 * 120 + 51]).toBe(0);
  });
});
