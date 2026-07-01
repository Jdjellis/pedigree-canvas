import { render, screen } from '@testing-library/react';
import { PrivacyBadge } from './PrivacyBadge';

test('renders with accessible label "Privacy information"', () => {
  render(<PrivacyBadge />);
  expect(
    screen.getByLabelText('Privacy information'),
  ).toBeInTheDocument();
});

test('carries a tooltip describing the privacy guarantee', () => {
  render(<PrivacyBadge />);
  expect(screen.getByTitle(/none of your data leaves your device/i)).toBeInTheDocument();
});
