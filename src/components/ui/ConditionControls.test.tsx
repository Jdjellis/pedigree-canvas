import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ConditionColorPicker,
  ConditionQuarterGrid,
  ConditionPatternPicker,
} from './ConditionControls';
import { COLOR_OPTIONS, PATTERN_OPTIONS } from './legendOptions';

describe('ConditionColorPicker', () => {
  it('marks the selected colour pressed and reports the clicked colour', () => {
    const onChange = vi.fn();
    render(
      <ConditionColorPicker value={COLOR_OPTIONS[0].value} onChange={onChange} />,
    );

    expect(
      screen.getByRole('button', { name: COLOR_OPTIONS[0].label }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: COLOR_OPTIONS[1].label }),
    ).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: COLOR_OPTIONS[1].label }));
    expect(onChange).toHaveBeenCalledWith(COLOR_OPTIONS[1].value);
  });
});

describe('ConditionQuarterGrid', () => {
  it('renders four quarter cells and reports the clicked quarter', () => {
    const onChange = vi.fn();
    render(<ConditionQuarterGrid value="topRight" onChange={onChange} />);

    expect(
      screen.getByRole('button', { name: 'Top-Right' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Bottom-Left' }));
    expect(onChange).toHaveBeenCalledWith('bottomLeft');
  });
});

describe('ConditionPatternPicker', () => {
  it('marks the selected pattern pressed and reports the clicked pattern', () => {
    const onChange = vi.fn();
    render(
      <ConditionPatternPicker value="solid" color="#1a1a1a" onChange={onChange} />,
    );

    expect(
      screen.getByRole('button', { name: PATTERN_OPTIONS[0].label }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Dots' }));
    expect(onChange).toHaveBeenCalledWith('dots');
  });
});
