import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore genderPicker', () => {
  beforeEach(() => {
    useUIStore.getState().hideGenderPicker();
  });

  it('starts with no picker target', () => {
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('showGenderPicker sets the target id', () => {
    useUIStore.getState().showGenderPicker('ind-1');
    expect(useUIStore.getState().genderPicker.targetId).toBe('ind-1');
  });

  it('hideGenderPicker clears the target id', () => {
    useUIStore.getState().showGenderPicker('ind-1');
    useUIStore.getState().hideGenderPicker();
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });
});
