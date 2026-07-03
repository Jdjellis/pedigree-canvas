import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore: reformat suggestion dismissal', () => {
  beforeEach(() => {
    useUIStore.setState({ reformatSuggestionDismissed: false });
  });

  it('defaults to not dismissed', () => {
    expect(useUIStore.getState().reformatSuggestionDismissed).toBe(false);
  });

  it('setReformatSuggestionDismissed(true) dismisses the nudge', () => {
    useUIStore.getState().setReformatSuggestionDismissed(true);
    expect(useUIStore.getState().reformatSuggestionDismissed).toBe(true);
  });

  it('setReformatSuggestionDismissed(false) re-arms it', () => {
    useUIStore.getState().setReformatSuggestionDismissed(true);
    useUIStore.getState().setReformatSuggestionDismissed(false);
    expect(useUIStore.getState().reformatSuggestionDismissed).toBe(false);
  });
});
