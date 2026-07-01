import { render, screen, fireEvent } from '@testing-library/react';
import { PrivacyBadge } from './PrivacyBadge';

test('renders a button with accessible name "Privacy information"', () => {
  render(<PrivacyBadge />);
  expect(
    screen.getByRole('button', { name: 'Privacy information' }),
  ).toBeInTheDocument();
});

test('tooltip text is embedded in CSS content (no native title delay)', () => {
  render(<PrivacyBadge />);
  // The tooltip is a CSS ::after pseudo-element; verify the button itself
  // has no title attribute that would trigger the slow native browser tooltip.
  const btn = screen.getByRole('button', { name: 'Privacy information' });
  expect(btn).not.toHaveAttribute('title');
});

test('popover is not visible on initial render', () => {
  render(<PrivacyBadge />);
  expect(
    screen.queryByText(/your data stays on your device/i),
  ).not.toBeInTheDocument();
});

test('clicking the badge opens the privacy popover', () => {
  render(<PrivacyBadge />);
  fireEvent.click(screen.getByRole('button', { name: 'Privacy information' }));
  expect(
    screen.getByText(/your data stays on your device/i),
  ).toBeInTheDocument();
});

test('clicking the badge a second time closes the popover', () => {
  render(<PrivacyBadge />);
  const btn = screen.getByRole('button', { name: 'Privacy information' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(
    screen.queryByText(/your data stays on your device/i),
  ).not.toBeInTheDocument();
});

test('pressing Escape while popover is open closes it', () => {
  render(<PrivacyBadge />);
  fireEvent.click(screen.getByRole('button', { name: 'Privacy information' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(
    screen.queryByText(/your data stays on your device/i),
  ).not.toBeInTheDocument();
});

test('aria-expanded reflects popover open/closed state', () => {
  render(<PrivacyBadge />);
  const btn = screen.getByRole('button', { name: 'Privacy information' });
  expect(btn).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(btn);
  expect(btn).toHaveAttribute('aria-expanded', 'true');
});
