import { describe, it, expect } from 'vitest';
import {
  CONNECTION_HOVER_OPACITY,
  CONNECTION_SELECTED_OPACITY,
} from '../../utils/constants';
import { connectionEmphasis, haloOpacity } from './connectionHighlight';

describe('connectionEmphasis', () => {
  it('prefers selection over hover so a selected line stays "selected"', () => {
    expect(connectionEmphasis(true, true)).toBe('selected');
    expect(connectionEmphasis(true, false)).toBe('selected');
  });

  it('reports hover only when not selected', () => {
    expect(connectionEmphasis(false, true)).toBe('hover');
  });

  it('reports none for an idle line', () => {
    expect(connectionEmphasis(false, false)).toBe('none');
  });
});

describe('haloOpacity', () => {
  it('maps emphasis to the matching opacity, and none to null (no halo)', () => {
    expect(haloOpacity('selected')).toBe(CONNECTION_SELECTED_OPACITY);
    expect(haloOpacity('hover')).toBe(CONNECTION_HOVER_OPACITY);
    expect(haloOpacity('none')).toBeNull();
  });

  it('draws a selected line more strongly than a hovered one', () => {
    expect(CONNECTION_SELECTED_OPACITY).toBeGreaterThan(CONNECTION_HOVER_OPACITY);
  });
});
