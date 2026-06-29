import { render, screen, fireEvent } from '@testing-library/react';
import { GenderIconButtons } from './GenderIconButtons';
import { GenderIdentity } from '../../types/enums';

describe('GenderIconButtons', () => {
  it('renders a button for each gender identity option', () => {
    render(<GenderIconButtons value={GenderIdentity.Unknown} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Man' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Woman' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Non-binary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unknown' })).toBeInTheDocument();
  });

  it('marks the active option with aria-pressed=true', () => {
    render(<GenderIconButtons value={GenderIdentity.Woman} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Woman' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Man' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked GenderIdentity value', () => {
    const onChange = vi.fn();
    render(<GenderIconButtons value={GenderIdentity.Unknown} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Non-binary' }));
    expect(onChange).toHaveBeenCalledWith(GenderIdentity.NonBinary);
  });
});
