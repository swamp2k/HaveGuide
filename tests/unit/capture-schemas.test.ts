import { describe, expect, it } from 'vitest';
import {
  createCaptureFrameSchema,
  createCaptureSessionSchema,
  updateCaptureSessionSchema,
} from '../../src/shared/capture-schemas';

describe('guided capture contracts', () => {
  it('applies safe session defaults', () => {
    const parsed = createCaptureSessionSchema.parse({ title: 'Rundt om haven' });
    expect(parsed).toEqual({
      title: 'Rundt om haven',
      mode: 'perimeter',
      targetOverlapPercent: 35,
    });
  });

  it('accepts optional sensor metadata', () => {
    const parsed = createCaptureFrameSchema.parse({
      mediaId: 'd7acfb91-cb90-43a8-b7cc-8db693a920f0',
      latitude: 56.2,
      longitude: 10.7,
      accuracyM: 4.5,
      bearingDegrees: 42,
      capturedAt: '2026-08-03T20:00:00.000Z',
    });
    expect(parsed.bearingDegrees).toBe(42);
    expect(parsed.accuracyM).toBe(4.5);
  });

  it('rejects impossible overlap and coordinates', () => {
    expect(createCaptureSessionSchema.safeParse({ title: 'Tur', targetOverlapPercent: 5 }).success).toBe(false);
    expect(createCaptureFrameSchema.safeParse({
      mediaId: 'd7acfb91-cb90-43a8-b7cc-8db693a920f0',
      latitude: 100,
      longitude: 10,
    }).success).toBe(false);
  });

  it('only permits terminal session states', () => {
    expect(updateCaptureSessionSchema.safeParse({ status: 'completed' }).success).toBe(true);
    expect(updateCaptureSessionSchema.safeParse({ status: 'active' }).success).toBe(false);
  });
});
