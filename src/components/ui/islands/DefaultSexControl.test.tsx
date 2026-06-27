import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefaultSexControl } from './DefaultSexControl';
import { useUIStore } from '../../../stores/uiStore';

describe('DefaultSexControl', () => {
  beforeEach(() => {
    useUIStore.getState().setDefaultSex('unknown');
  });

  test('marks the current default as pressed', () => {
    render(<DefaultSexControl />);
    expect(screen.getByRole('button', { name: 'Unknown' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Male' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a segment updates the store', () => {
    render(<DefaultSexControl />);
    screen.getByRole('button', { name: 'Female' }).click();
    expect(useUIStore.getState().defaultSex).toBe('female');
  });
});
