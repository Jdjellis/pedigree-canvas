import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { placeTextAt } from './toolPlacement';
import { ANNOTATION_PLACEHOLDER_TEXT } from '../../utils/constants';

describe('toolPlacement — text', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    useUIStore.setState({ activeTool: 'text', editingLocked: false });
  });

  it('places a placeholder annotation at the rounded position and edits it', () => {
    const id = placeTextAt({ x: 50.7, y: 30.2 });
    const ann = usePedigreeStore.getState().document.textAnnotations[id];
    expect(ann.text).toBe(ANNOTATION_PLACEHOLDER_TEXT);
    expect(ann.position).toEqual({ x: 51, y: 30 });
    expect(useUIStore.getState().editingAnnotationId).toBe(id);
  });

  it('reverts to select after placing when not locked', () => {
    placeTextAt({ x: 0, y: 0 });
    expect(useUIStore.getState().activeTool).toBe('select');
  });
});
