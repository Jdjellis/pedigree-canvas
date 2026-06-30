import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ToolIsland } from './ToolIsland';
import { useUIStore } from '../../../stores/uiStore';

describe('ToolIsland', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ activeTool: 'select', editingLocked: false });
  });

  it('renders a button for each tool plus lock and hand', () => {
    render(<ToolIsland />);
    for (const label of ['Lock editing', 'Hand', 'Select', 'Text', 'Eraser']) {
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

  it('reflects the lock toggle state', () => {
    useUIStore.setState({ editingLocked: true });
    render(<ToolIsland />);
    expect(screen.getByRole('button', { name: 'Lock editing' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  describe('edit-lock disables Text and Eraser buttons', () => {
    it('Text and Eraser have the disabled attribute when editingLocked is true', () => {
      useUIStore.setState({ editingLocked: true });
      render(<ToolIsland />);
      expect(screen.getByRole('button', { name: 'Text' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eraser' })).toBeDisabled();
    });

    it('Select, Hand, and Lock buttons remain enabled when editingLocked is true', () => {
      useUIStore.setState({ editingLocked: true });
      render(<ToolIsland />);
      expect(screen.getByRole('button', { name: 'Select' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Hand' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Lock editing' })).not.toBeDisabled();
    });

    it('clicking Text while locked leaves activeTool unchanged', () => {
      useUIStore.setState({ activeTool: 'select', editingLocked: true });
      render(<ToolIsland />);
      screen.getByRole('button', { name: 'Text' }).click();
      expect(useUIStore.getState().activeTool).toBe('select');
    });

    it('Text and Eraser are NOT disabled when editingLocked is false', () => {
      useUIStore.setState({ editingLocked: false });
      render(<ToolIsland />);
      expect(screen.getByRole('button', { name: 'Text' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eraser' })).not.toBeDisabled();
    });
  });
});
