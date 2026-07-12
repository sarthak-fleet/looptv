import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEOS_PER_SOURCE,
  MIN_VIEW_COUNT,
  TOP_PICK_BAND_SIZE,
  pickFromTopViewBand,
  pickUniform,
  videoViewWeight,
} from '../catalog-quality';

describe('catalog-quality (client)', () => {
  it('matches the server-side minimum view threshold', () => {
    expect(MIN_VIEW_COUNT).toBe(10_000);
    expect(MAX_VIDEOS_PER_SOURCE).toBe(200);
    expect(TOP_PICK_BAND_SIZE).toBe(12);
  });

  it('returns zero weight for sub-threshold or missing views', () => {
    expect(videoViewWeight(undefined)).toBe(0);
    expect(videoViewWeight(0)).toBe(0);
    expect(videoViewWeight(9_999)).toBe(0);
    expect(videoViewWeight(10_000)).toBeGreaterThan(0);
  });

  it('never picks outside the top view band', () => {
    const filler = Array.from({ length: 13 }, (_, i) => ({
      id: `f${i}`,
      viewCount: 50_000 + i,
    }));
    const high = { id: 'high', viewCount: 10_000_000 };
    const low = { id: 'low', viewCount: 10_000 };
    const pool = [...filler, high, low];

    for (let i = 0; i < 40; i += 1) {
      const pick = pickFromTopViewBand(pool);
      expect(pick?.id).not.toBe('low');
    }
  });

  it('allows normal playback to reach outside the top view band', () => {
    const pool = Array.from({ length: 20 }, (_, index) => ({
      id: `video-${index}`,
      viewCount: 20_000 - index,
    }));

    expect(pickUniform(pool, undefined, () => 0.99)?.id).toBe('video-19');
  });
});
