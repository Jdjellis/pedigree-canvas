import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorActions } from './useEditorActions';
import { useUIStore } from '../stores/uiStore';

describe('useEditorActions tool activators', () => {
  beforeEach(() => {
    useUIStore.setState({ activeTool: 'select', toolLocked: false });
  });

  it('activates each tool', () => {
    const { result } = renderHook(() => useEditorActions());
    result.current.handTool();
    expect(useUIStore.getState().activeTool).toBe('hand');
    result.current.maleTool();
    expect(useUIStore.getState().activeTool).toBe('male');
    result.current.femaleTool();
    expect(useUIStore.getState().activeTool).toBe('female');
    result.current.unknownTool();
    expect(useUIStore.getState().activeTool).toBe('unknown');
    result.current.partnershipTool();
    expect(useUIStore.getState().activeTool).toBe('partnership');
    result.current.textTool();
    expect(useUIStore.getState().activeTool).toBe('text');
    result.current.eraserTool();
    expect(useUIStore.getState().activeTool).toBe('eraser');
    result.current.selectTool();
    expect(useUIStore.getState().activeTool).toBe('select');
  });

  it('toggles the tool lock', () => {
    const { result } = renderHook(() => useEditorActions());
    result.current.toggleToolLock();
    expect(useUIStore.getState().toolLocked).toBe(true);
  });
});
