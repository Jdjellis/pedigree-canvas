import { beforeEach, describe, it, expect } from 'vitest';
import { useUIStore } from './uiStore';

beforeEach(() => {
  useUIStore.setState({
    selectedIds: new Set<string>(),
    selectedConnection: null,
    hoveredConnection: null,
    propertiesPanelOpen: false,
  });
});

describe('uiStore hovered connection', () => {
  it('setHoveredConnection sets and clears the hovered slice', () => {
    useUIStore.getState().setHoveredConnection({ kind: 'partnership', id: 'pa1' });
    expect(useUIStore.getState().hoveredConnection).toEqual({
      kind: 'partnership',
      id: 'pa1',
    });

    useUIStore.getState().setHoveredConnection(null);
    expect(useUIStore.getState().hoveredConnection).toBeNull();
  });

  it('hovering a connection does not disturb selection or the panel', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().setHoveredConnection({ kind: 'parentChild', id: 'link1' });

    const s = useUIStore.getState();
    expect(s.selectedConnection).toEqual({ kind: 'twin', id: 'tw1' });
    expect(s.propertiesPanelOpen).toBe(true);
  });

  it('selecting a connection leaves any hover state untouched', () => {
    useUIStore.getState().setHoveredConnection({ kind: 'partnership', id: 'pa1' });
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'pa1' });
    expect(useUIStore.getState().hoveredConnection).toEqual({
      kind: 'partnership',
      id: 'pa1',
    });
  });
});
