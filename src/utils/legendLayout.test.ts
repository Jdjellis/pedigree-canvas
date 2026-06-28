import { describe, it, expect } from 'vitest';
import {
  PADDING,
  ROW_HEIGHT,
  TITLE_HEIGHT,
  SWATCH_SIZE,
  LABEL_WIDTH,
  legendSwatchWidth,
  legendContentWidth,
  legendContentHeight,
  legendEntryRowY,
  legendInvestigationRowY,
} from './legendLayout';

describe('legendLayout constants', () => {
  it('exports expected values', () => {
    expect(PADDING).toBe(12);
    expect(ROW_HEIGHT).toBe(28);
    expect(TITLE_HEIGHT).toBe(24);
    expect(SWATCH_SIZE).toBe(20);
    expect(LABEL_WIDTH).toBe(160);
  });
});

describe('legendSwatchWidth', () => {
  it('returns single swatch size for one gender', () => {
    expect(legendSwatchWidth(false)).toBe(20);
  });

  it('returns double swatch size with gap for both genders', () => {
    expect(legendSwatchWidth(true)).toBe(44); // 20*2 + 4
  });
});

describe('legendContentWidth', () => {
  it('is correct for single gender', () => {
    // PADDING*2 + SWATCH_SIZE + 8 + LABEL_WIDTH = 24 + 20 + 8 + 160 = 212
    expect(legendContentWidth(false)).toBe(212);
  });

  it('is correct for both genders', () => {
    // PADDING*2 + (SWATCH_SIZE*2+4) + 8 + LABEL_WIDTH = 24 + 44 + 8 + 160 = 236
    expect(legendContentWidth(true)).toBe(236);
  });
});

describe('legendContentHeight', () => {
  it('returns only padding + title when there are no rows', () => {
    // PADDING*2 + TITLE_HEIGHT = 24 + 24 = 48
    expect(legendContentHeight(0, 0)).toBe(48);
  });

  it('adds ROW_HEIGHT per entry and per investigation', () => {
    // 48 + 2*28 + 1*28 = 48 + 84 = 132
    expect(legendContentHeight(2, 1)).toBe(132);
  });
});

describe('legendEntryRowY', () => {
  it('returns correct Y for the first entry', () => {
    // PADDING + TITLE_HEIGHT = 12 + 24 = 36
    expect(legendEntryRowY(0)).toBe(36);
  });

  it('returns correct Y for subsequent entries', () => {
    // 36 + ROW_HEIGHT = 36 + 28 = 64
    expect(legendEntryRowY(1)).toBe(64);
  });
});

describe('legendInvestigationRowY', () => {
  it('starts at the same Y as a first entry when there are no entries', () => {
    expect(legendInvestigationRowY(0, 0)).toBe(legendEntryRowY(0));
  });

  it('continues immediately after all entry rows', () => {
    // After 2 entries: 36 + 2*28 = 92
    expect(legendInvestigationRowY(2, 0)).toBe(92);
  });

  it('increments by ROW_HEIGHT for each investigation', () => {
    expect(legendInvestigationRowY(2, 1)).toBe(120); // 92 + 28
  });
});
