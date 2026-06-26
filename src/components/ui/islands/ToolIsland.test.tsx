import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import { ToolIsland } from './ToolIsland';

beforeEach(() => {
  // Reset activeTool to its initial value before each test.
  useUIStore.getState().setActiveTool('select');
});

test('renders three tool buttons — Select, Hand, Add Person', () => {
  render(<ToolIsland />);

  expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hand' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();
});

test('clicking Select activates the select tool in the store', () => {
  // Start from a non-select state so the click is a real change.
  useUIStore.getState().setActiveTool('hand');

  render(<ToolIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Select' }));

  expect(useUIStore.getState().activeTool).toBe('select');
});

test('clicking Hand activates the hand tool in the store', () => {
  render(<ToolIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Hand' }));

  expect(useUIStore.getState().activeTool).toBe('hand');
});

test('clicking Add Person activates the male tool in the store', () => {
  render(<ToolIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Person' }));

  expect(useUIStore.getState().activeTool).toBe('male');
});

test('Select button has buttonActive styling when activeTool is select', () => {
  // Pre-condition: store is already 'select' from beforeEach.
  render(<ToolIsland />);
  const selectBtn = screen.getByRole('button', { name: 'Select' });
  // The active class name contains 'buttonActive' (CSS Modules mangles the full
  // class name but the substring is stable in test environments).
  expect(selectBtn.className).toMatch(/buttonActive/);
});

test('Hand button has buttonActive styling when activeTool is hand', () => {
  useUIStore.getState().setActiveTool('hand');
  render(<ToolIsland />);
  const handBtn = screen.getByRole('button', { name: 'Hand' });
  expect(handBtn.className).toMatch(/buttonActive/);
});
