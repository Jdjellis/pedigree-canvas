import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('SegmentedControl', () => {
  it('renders all option labels', () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('sets aria-pressed=true only on the active option', () => {
    render(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByText('Beta').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Alpha').closest('button')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Gamma').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked option value', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not call onChange when the active option is clicked', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies aria-label to the group when provided', () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="Test group" />);
    expect(screen.getByRole('group', { name: 'Test group' })).toBeInTheDocument();
  });
});
