import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorActions } from './useEditorActions';
import { useUIStore } from '../stores/uiStore';

describe('useEditorActions tool activators', () => {
  beforeEach(() => {
    useUIStore.setState({ activeTool: 'select', editingLocked: false });
  });

  it('activates each tool', () => {
    const { result } = renderHook(() => useEditorActions());
    result.current.handTool();
    expect(useUIStore.getState().activeTool).toBe('hand');
    result.current.textTool();
    expect(useUIStore.getState().activeTool).toBe('text');
    result.current.eraserTool();
    expect(useUIStore.getState().activeTool).toBe('eraser');
    result.current.selectTool();
    expect(useUIStore.getState().activeTool).toBe('select');
  });

  it('toggles the editing lock', () => {
    const { result } = renderHook(() => useEditorActions());
    result.current.toggleEditingLock();
    expect(useUIStore.getState().editingLocked).toBe(true);
  });
});
