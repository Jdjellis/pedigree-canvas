import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, test, expect } from 'vitest';
import { useUIStore, type ActiveTool } from '../../../stores/uiStore';
import { ToolHint } from './ToolHint';

/** Set the active tool via the store. */
function setTool(tool: ActiveTool): void {
  act(() => {
    useUIStore.setState({ activeTool: tool });
  });
}

beforeEach(() => {
  act(() => {
    useUIStore.setState({
      activeTool: 'select',
      hoveredId: null,
      zenMode: false,
      editingLocked: false,
    });
  });
});

describe('ToolHint', () => {
  test('shows the pan hint by default when the select tool is active', () => {
    setTool('select');
    render(<ToolHint />);

    expect(screen.getByRole('note')).toHaveTextContent(/while dragging to pan/i);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });

  test('swaps to the alt-drag link hint when a node is hovered', () => {
    setTool('select');
    act(() => {
      useUIStore.setState({ hoveredId: 'person-1' });
    });
    render(<ToolHint />);

    expect(screen.getByRole('note')).toHaveTextContent(/drag onto another person to link/i);
    expect(screen.getByText('Alt')).toBeInTheDocument();
  });

  test('renders nothing for tools without a hint', () => {
    setTool('text');
    const { container } = render(<ToolHint />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing in zen mode even when the select tool would show a hint', () => {
    setTool('select');
    act(() => {
      useUIStore.setState({ zenMode: true });
    });
    const { container } = render(<ToolHint />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing in view mode (edit lock) — its hints are edit guidance', () => {
    setTool('select');
    act(() => {
      useUIStore.setState({ editingLocked: true });
    });
    const { container } = render(<ToolHint />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
