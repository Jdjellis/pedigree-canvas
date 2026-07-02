import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore dragLink / connect gesture', () => {
  beforeEach(() => {
    useUIStore.getState().endDragLink();
    useUIStore.setState({ activeTool: 'select' });
  });

  it('startDragLink defaults to drag mode', () => {
    useUIStore.getState().startDragLink('a');
    const { dragLink } = useUIStore.getState();
    expect(dragLink.active).toBe(true);
    expect(dragLink.sourceId).toBe('a');
    expect(dragLink.mode).toBe('drag');
  });

  it('startDragLink can arm a click-mode link (connect tool)', () => {
    useUIStore.getState().startDragLink('a', 'click');
    expect(useUIStore.getState().dragLink.mode).toBe('click');
  });

  it('switching tools abandons an in-progress link', () => {
    useUIStore.getState().startDragLink('a', 'click');
    useUIStore.getState().setActiveTool('select');
    expect(useUIStore.getState().dragLink.active).toBe(false);
    expect(useUIStore.getState().dragLink.sourceId).toBeNull();
  });

  it('setActiveTool leaves an inactive link untouched', () => {
    // No link armed: setActiveTool should just change the tool.
    useUIStore.getState().setActiveTool('connect');
    expect(useUIStore.getState().activeTool).toBe('connect');
    expect(useUIStore.getState().dragLink.active).toBe(false);
  });

  it('showLinkPopup consumes the link and resets its mode', () => {
    useUIStore.getState().startDragLink('a', 'click');
    useUIStore.getState().showLinkPopup('a', 'b', { x: 1, y: 2 });
    const { dragLink, linkPopup } = useUIStore.getState();
    expect(dragLink.active).toBe(false);
    expect(dragLink.mode).toBe('drag');
    expect(linkPopup.visible).toBe(true);
    expect(linkPopup.sourceId).toBe('a');
    expect(linkPopup.targetId).toBe('b');
  });
});
