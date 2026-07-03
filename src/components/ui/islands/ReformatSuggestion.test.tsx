import { render, screen, fireEvent, act } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import {
  usePedigreeStore,
  createDefaultDocument,
} from '../../../stores/pedigreeStore';
import type { LayoutDoc } from '../../../utils/treeLayout';
import { coupleWithSibship } from '../../../utils/__fixtures__/pedigrees';
import { reportedLayoutBugs } from '../../../utils/__fixtures__/reformatFixtures';
import { ReformatSuggestion } from './ReformatSuggestion';

/** Load a fixture's LayoutDoc slice into the real pedigree store. */
function seed(doc: LayoutDoc): void {
  usePedigreeStore.getState().setDocument({
    ...createDefaultDocument(),
    individuals: doc.individuals,
    partnerships: doc.partnerships,
    parentChildLinks: doc.parentChildLinks,
    twinGroups: doc.twinGroups ?? {},
  });
}

/** A document with a foreign node wedged between a couple → nudge should show. */
const tangled = (): LayoutDoc => reportedLayoutBugs().doc;
/** A tidy document → nudge should stay hidden. */
const tidy = (): LayoutDoc => coupleWithSibship().doc;

beforeEach(() => {
  useUIStore.setState({
    zenMode: false,
    editingLocked: false,
    reformatSuggestionDismissed: false,
  });
  seed(tidy());
});

test('shows the nudge when a relative is wedged between a couple', () => {
  seed(tangled());
  render(<ReformatSuggestion />);

  expect(screen.getByText('Layout looks tangled')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reformat' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Dismiss layout suggestion' })
  ).toBeInTheDocument();
});

test('renders nothing when the layout is already tidy', () => {
  seed(tidy());
  const { container } = render(<ReformatSuggestion />);

  expect(container).toBeEmptyDOMElement();
});

test('renders nothing in zen mode even when tangled', () => {
  seed(tangled());
  useUIStore.setState({ zenMode: true });
  const { container } = render(<ReformatSuggestion />);

  expect(container).toBeEmptyDOMElement();
});

test('renders nothing in view mode (read-only) even when tangled', () => {
  seed(tangled());
  useUIStore.setState({ editingLocked: true });
  const { container } = render(<ReformatSuggestion />);

  expect(container).toBeEmptyDOMElement();
});

test('clicking Reformat re-tidies the document and the nudge disappears', () => {
  seed(tangled());
  const before = usePedigreeStore.getState().document.individuals;

  render(<ReformatSuggestion />);
  fireEvent.click(screen.getByRole('button', { name: 'Reformat' }));

  // Positions changed …
  expect(usePedigreeStore.getState().document.individuals).not.toEqual(before);
  // … and the tangle (hence the nudge) is gone.
  expect(screen.queryByRole('button', { name: 'Reformat' })).not.toBeInTheDocument();
});

test('dismissing hides the nudge without reformatting', () => {
  seed(tangled());
  const before = usePedigreeStore.getState().document.individuals;

  render(<ReformatSuggestion />);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss layout suggestion' }));

  expect(useUIStore.getState().reformatSuggestionDismissed).toBe(true);
  expect(screen.queryByText('Layout looks tangled')).not.toBeInTheDocument();
  // Dismiss must not move anything — it is the opt-out.
  expect(usePedigreeStore.getState().document.individuals).toEqual(before);
});

test('the dismissal re-arms once the layout becomes tidy again', () => {
  seed(tangled());
  render(<ReformatSuggestion />);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss layout suggestion' }));
  expect(useUIStore.getState().reformatSuggestionDismissed).toBe(true);

  // The chart is fixed by other means (e.g. undo / manual). The effect re-arms
  // the one-shot so a future, distinct tangle can resurface the nudge.
  act(() => {
    seed(tidy());
  });

  expect(useUIStore.getState().reformatSuggestionDismissed).toBe(false);
});
