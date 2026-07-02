import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ToolIsland } from './ToolIsland';
import { useUIStore } from '../../../stores/uiStore';

describe('ToolIsland', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ activeTool: 'select', editingLocked: false, zenMode: false });
  });

  it('stays visible in zen mode (a focus mode keeps the drawing tools)', () => {
    useUIStore.setState({ zenMode: true });
    render(<ToolIsland />);
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
  });

  it('renders a button for each tool plus lock and hand', () => {
    render(<ToolIsland />);
    for (const label of [
      'Lock editing',
      'Hand',
      'Select',
      'Text',
      'Eraser',
      'Connect (click a person, then another)',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active tool pressed', () => {
    useUIStore.setState({ activeTool: 'text' });
    render(<ToolIsland />);
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('activates a tool on click', () => {
    render(<ToolIsland />);
    screen.getByRole('button', { name: 'Text' }).click();
    expect(useUIStore.getState().activeTool).toBe('text');
  });

  it('shows the Lock button unpressed while editing is unlocked', () => {
    // The Lock button is the way *into* view mode; once locked the whole island
    // (this button included) hides, so it only ever reflects the unlocked state.
    useUIStore.setState({ editingLocked: false });
    render(<ToolIsland />);
    expect(screen.getByRole('button', { name: 'Lock editing' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  describe('view mode (edit-lock) hides the whole tool island', () => {
    it('renders nothing when editingLocked is true', () => {
      useUIStore.setState({ editingLocked: true });
      const { container } = render(<ToolIsland />);
      expect(container).toBeEmptyDOMElement();
      for (const label of ['Lock editing', 'Hand', 'Select', 'Text', 'Eraser']) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    });

    it('renders all tools when editingLocked is false', () => {
      useUIStore.setState({ editingLocked: false });
      render(<ToolIsland />);
      expect(screen.getByRole('button', { name: 'Text' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eraser' })).not.toBeDisabled();
    });
  });
});
