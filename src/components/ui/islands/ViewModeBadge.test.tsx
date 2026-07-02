import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { ViewModeBadge } from './ViewModeBadge';
import { useUIStore } from '../../../stores/uiStore';

describe('ViewModeBadge', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ editingLocked: false });
  });

  it('renders nothing when editing is unlocked', () => {
    const { container } = render(<ViewModeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a "View only" badge while in view mode', () => {
    useUIStore.setState({ editingLocked: true });
    render(<ViewModeBadge />);
    expect(screen.getByRole('button', { name: /view only/i })).toBeInTheDocument();
  });

  it('clicking the badge leaves view mode (unlocks editing)', () => {
    useUIStore.setState({ editingLocked: true });
    render(<ViewModeBadge />);

    fireEvent.click(screen.getByRole('button', { name: /view only/i }));

    expect(useUIStore.getState().editingLocked).toBe(false);
  });
});
