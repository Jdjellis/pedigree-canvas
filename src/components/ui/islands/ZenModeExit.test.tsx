import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { ZenModeExit } from './ZenModeExit';
import { useUIStore } from '../../../stores/uiStore';

describe('ZenModeExit', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ zenMode: false });
  });

  it('renders nothing while zen mode is off', () => {
    const { container } = render(<ZenModeExit />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an "Exit zen mode" button while zen mode is on', () => {
    useUIStore.setState({ zenMode: true });
    render(<ZenModeExit />);
    expect(
      screen.getByRole('button', { name: /exit zen mode/i })
    ).toBeInTheDocument();
  });

  it('clicking the button leaves zen mode', () => {
    useUIStore.setState({ zenMode: true });
    render(<ZenModeExit />);

    fireEvent.click(screen.getByRole('button', { name: /exit zen mode/i }));

    expect(useUIStore.getState().zenMode).toBe(false);
  });
});
