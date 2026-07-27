import { normalizeSteps, strideFor } from '../normalize';

describe('strideFor', () => {
  it('uses strideLengthCm when provided', () => {
    expect(strideFor({ strideLengthCm: 80, heightCm: 180 })).toBe(80);
  });

  it('derives stride from height when strideLengthCm is absent', () => {
    expect(strideFor({ heightCm: 180 })).toBeCloseTo(180 * 0.415);
  });

  it('falls back to the default stride when neither value is set', () => {
    expect(strideFor({})).toBe(71);
  });
});

describe('normalizeSteps', () => {
  it('returns raw steps unchanged when the stride equals the reference stride', () => {
    expect(normalizeSteps(10000, { strideLengthCm: 71 }, 71)).toBe(10000);
  });

  it('scales steps up for a longer-than-reference stride', () => {
    // rawSteps * (strideLengthCm / referenceStrideCm)
    expect(normalizeSteps(10000, { strideLengthCm: 80 }, 71)).toBe(
      Math.round(10000 * (80 / 71)),
    );
  });

  it('scales steps down for a shorter-than-reference stride', () => {
    expect(normalizeSteps(10000, { strideLengthCm: 60 }, 71)).toBe(
      Math.round(10000 * (60 / 71)),
    );
  });

  it('falls back to the default reference stride when none is passed', () => {
    expect(normalizeSteps(5000, { strideLengthCm: 71 })).toBe(5000);
  });
});
