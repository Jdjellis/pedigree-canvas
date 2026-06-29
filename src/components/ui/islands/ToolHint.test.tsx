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
    useUIStore.setState({ activeTool: 'select' });
  });
});

describe('ToolHint', () => {
  test('shows the canvas-navigation hint when the select tool is active', () => {
    setTool('select');
    render(<ToolHint />);

    expect(screen.getByRole('note')).toHaveTextContent(/move the canvas/i);
    expect(screen.getByText('Scroll wheel')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
  });

  test('surfaces the alt-drag link gesture on the select tool', () => {
    setTool('select');
    render(<ToolHint />);

    expect(screen.getByRole('note')).toHaveTextContent(/drag from one person onto another to link/i);
    expect(screen.getByText('Alt')).toBeInTheDocument();
  });

  test('renders nothing for tools without a hint', () => {
    setTool('text');
    const { container } = render(<ToolHint />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
