import { beforeEach, describe, it, expect } from 'vitest';
import { useUIStore } from './uiStore';

beforeEach(() => {
  useUIStore.setState({
    selectedIds: new Set<string>(),
    selectedConnection: null,
    propertiesPanelOpen: false,
    editingAnnotationId: null,
  });
});

describe('uiStore connection selection', () => {
  it('selectConnection sets the typed slice, clears individuals, opens the panel', () => {
    useUIStore.getState().selectMultiple(['a', 'b']);
    useUIStore.getState().selectConnection({ kind: 'parentChild', id: 'link1' });

    const s = useUIStore.getState();
    expect(s.selectedConnection).toEqual({ kind: 'parentChild', id: 'link1' });
    expect(s.selectedIds.size).toBe(0);
    expect(s.propertiesPanelOpen).toBe(true);
  });

  it('select(individual) clears any connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().select('ind1');

    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.selectedIds.has('ind1')).toBe(true);
  });

  it('selectMultiple clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'pa1' });
    useUIStore.getState().selectMultiple(['x', 'y']);
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('toggleSelection clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'pa1' });
    useUIStore.getState().toggleSelection('z');
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('clearSelection clears connection selection and closes the panel', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().clearSelection();
    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.propertiesPanelOpen).toBe(false);
  });

  it('startEditingAnnotation clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().startEditingAnnotation('note1');
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('clearConnectionSelection nulls the slice without touching the panel flag', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().clearConnectionSelection();
    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.propertiesPanelOpen).toBe(true); // selectConnection opened it; clear leaves it
  });
});
