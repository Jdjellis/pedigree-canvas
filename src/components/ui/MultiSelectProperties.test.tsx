import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import {
  usePedigreeStore,
  createDefaultDocument,
  createDefaultIndividual,
} from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity, VitalStatus, RelationshipType, TwinType } from '../../types/enums';
import type { LegendEntry, ParentChildRelationship, PartnershipRelationship } from '../../types/pedigree';
import { PropertiesPanel } from './PropertiesPanel';

function selectPeople(ids: string[]) {
  act(() => {
    useUIStore.setState({
      selectedIds: new Set(ids),
      selectedConnection: null,
      propertiesPanelOpen: true,
    });
  });
}

beforeEach(() => {
  act(() => {
    usePedigreeStore.getState().setDocument(createDefaultDocument());
    useUIStore.setState({
      selectedIds: new Set<string>(),
      selectedConnection: null,
      propertiesPanelOpen: false,
    });
  });
});

describe('MultiSelectProperties — header & identity', () => {
  it('shows a count header when more than one person is selected', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', genderIdentity: GenderIdentity.Man });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', genderIdentity: GenderIdentity.Man });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByText('2 people selected')).toBeInTheDocument();
  });

  it('shows the shared gender as active when all agree', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', genderIdentity: GenderIdentity.Woman });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', genderIdentity: GenderIdentity.Woman });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Woman' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no active gender button when the selection is mixed', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', genderIdentity: GenderIdentity.Man });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', genderIdentity: GenderIdentity.Woman });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Man' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Woman' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes a gender change to every selected person', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', genderIdentity: GenderIdentity.Man });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', genderIdentity: GenderIdentity.Woman });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Non-binary' }));
    });

    const docAfter = usePedigreeStore.getState().document;
    expect(docAfter.individuals.a.genderIdentity).toBe(GenderIdentity.NonBinary);
    expect(docAfter.individuals.b.genderIdentity).toBe(GenderIdentity.NonBinary);
  });
});

describe('MultiSelectProperties — vital status & adoption', () => {
  it('sets vital status on every selected person', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a' });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b' });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Deceased' })));

    const after = usePedigreeStore.getState().document;
    expect(after.individuals.a.vitalStatus).toBe(VitalStatus.Deceased);
    expect(after.individuals.b.vitalStatus).toBe(VitalStatus.Deceased);
  });

  it('shows the cause-of-death field only when every selected person is deceased', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', vitalStatus: VitalStatus.Deceased });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', vitalStatus: VitalStatus.Alive });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    const { rerender } = render(<PropertiesPanel />);
    expect(screen.queryByPlaceholderText(/Cause of death|Mixed/i)).not.toBeInTheDocument();

    act(() => {
      usePedigreeStore.getState().updateIndividuals(['b'], { vitalStatus: VitalStatus.Deceased });
    });
    rerender(<PropertiesPanel />);
    expect(screen.getByLabelText('Cause of Death')).toBeInTheDocument();
  });

  it('renders the adopted checkbox as indeterminate when the selection is mixed', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', adopted: true });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b' });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('checkbox', { name: 'Adopted' })).toBePartiallyChecked();
  });

  it('marks all selected adopted when toggled from mixed', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', adopted: true });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b' });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Adopted' })));

    const after = usePedigreeStore.getState().document;
    expect(after.individuals.a.adopted).toBe(true);
    expect(after.individuals.b.adopted).toBe(true);
  });
});

function entry(id: string, name: string, applicableTo?: 'man' | 'woman'): LegendEntry {
  return { id, quarter: 'topLeft', fillColor: '#c00', fillPattern: 'solid', name, applicableTo };
}

describe('MultiSelectProperties — conditions', () => {
  it('checks the condition when all selected people have it', () => {
    const doc = createDefaultDocument();
    doc.legendConfig.entries = [entry('x', 'Cancer')];
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', conditionIds: ['x'] });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', conditionIds: ['x'] });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('checkbox', { name: /Cancer/ })).toBeChecked();
  });

  it('shows an indeterminate condition checkbox when only some have it', () => {
    const doc = createDefaultDocument();
    doc.legendConfig.entries = [entry('x', 'Cancer')];
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', conditionIds: ['x'] });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', conditionIds: [] });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('checkbox', { name: /Cancer/ })).toBePartiallyChecked();
  });

  it('applies the condition to all when toggled from indeterminate', () => {
    const doc = createDefaultDocument();
    doc.legendConfig.entries = [entry('x', 'Cancer')];
    doc.individuals['a'] = createDefaultIndividual({ id: 'a', conditionIds: ['x'] });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b', conditionIds: [] });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('checkbox', { name: /Cancer/ })));

    const after = usePedigreeStore.getState().document;
    expect(after.individuals.a.conditionIds).toContain('x');
    expect(after.individuals.b.conditionIds).toContain('x');
  });

  it('only writes a gender-specific condition to applicable people', () => {
    const doc = createDefaultDocument();
    doc.legendConfig.entries = [entry('brca', 'BRCA (women)', 'woman')];
    doc.individuals['w'] = createDefaultIndividual({ id: 'w', genderIdentity: GenderIdentity.Woman, conditionIds: [] });
    doc.individuals['m'] = createDefaultIndividual({ id: 'm', genderIdentity: GenderIdentity.Man, conditionIds: [] });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['w', 'm']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('checkbox', { name: /BRCA/ })));

    const after = usePedigreeStore.getState().document;
    expect(after.individuals.w.conditionIds).toContain('brca');
    expect(after.individuals.m.conditionIds).not.toContain('brca');
  });
});

function siblingDoc(childIds: string[]) {
  const doc = createDefaultDocument();
  const union: PartnershipRelationship = {
    id: 'union1',
    type: RelationshipType.Partnership,
    partner1Id: 'p1',
    partner2Id: 'p2',
    childrenIds: childIds,
  };
  doc.partnerships['union1'] = union;
  for (const id of childIds) {
    doc.individuals[id] = createDefaultIndividual({ id });
    const link: ParentChildRelationship = {
      id: `link-${id}`,
      type: RelationshipType.ParentChild,
      parentPartnershipId: 'union1',
      childId: id,
      isAdoptive: false,
    };
    doc.parentChildLinks[link.id] = link;
  }
  return doc;
}

describe('MultiSelectProperties — twins', () => {
  it('hides the twins section when the selection is not one sibship', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({ id: 'a' });
    doc.individuals['b'] = createDefaultIndividual({ id: 'b' }); // founders, no shared sibship
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.queryByText('Twins')).not.toBeInTheDocument();
  });

  it('offers the three zygosity buttons for two ungrouped siblings', () => {
    act(() => usePedigreeStore.getState().setDocument(siblingDoc(['a', 'b'])));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Group as monozygotic twins' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group as dizygotic twins' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Group as twins of unknown zygosity' }),
    ).toBeInTheDocument();
  });

  it('creates a twin group when a zygosity button is clicked', () => {
    act(() => usePedigreeStore.getState().setDocument(siblingDoc(['a', 'b'])));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Group as dizygotic twins' })));

    const groups = Object.values(usePedigreeStore.getState().document.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Dizygotic);
    expect([...groups[0].individualIds].sort()).toEqual(['a', 'b']);
  });

  it('offers add-to-existing when one selected sibling is already grouped, and merges', () => {
    const doc = siblingDoc(['a', 'b', 'c']);
    doc.twinGroups['tg1'] = {
      id: 'tg1',
      twinType: TwinType.Monozygotic,
      individualIds: ['a', 'b'],
      parentPartnershipId: 'union1',
    };
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['b', 'c']);

    render(<PropertiesPanel />);
    const addButton = screen.getByRole('button', { name: 'Add to twin group' });
    act(() => fireEvent.click(addButton));

    const tg = usePedigreeStore.getState().document.twinGroups['tg1'];
    expect([...tg.individualIds].sort()).toEqual(['a', 'b', 'c']);
    expect(tg.twinType).toBe(TwinType.Monozygotic);
  });

  it('mixed selection (grouped + ungrouped) offers both add and ungroup', () => {
    const doc = siblingDoc(['a', 'b', 'c']);
    doc.twinGroups['tg1'] = {
      id: 'tg1',
      twinType: TwinType.Monozygotic,
      individualIds: ['a', 'b'],
      parentPartnershipId: 'union1',
    };
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['b', 'c']); // b is grouped, c is not

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Add to twin group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ungroup twins' })).toBeInTheDocument();
  });

  it('selecting an entire existing twin group offers only Ungroup (no no-op Add)', () => {
    const doc = siblingDoc(['a', 'b']);
    doc.twinGroups['tg1'] = {
      id: 'tg1',
      twinType: TwinType.Dizygotic,
      individualIds: ['a', 'b'],
      parentPartnershipId: 'union1',
    };
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Ungroup twins' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to twin group' })).not.toBeInTheDocument();
  });

  it('Ungroup twins dissolves the group the selection belongs to', () => {
    const doc = siblingDoc(['a', 'b', 'c']);
    doc.twinGroups['tg1'] = {
      id: 'tg1',
      twinType: TwinType.Monozygotic,
      individualIds: ['a', 'b'],
      parentPartnershipId: 'union1',
    };
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    render(<PropertiesPanel />);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Ungroup twins' })));

    expect(Object.values(usePedigreeStore.getState().document.twinGroups)).toHaveLength(0);
  });

  it('hides the twins section when selected siblings are in different sibships', () => {
    const doc = createDefaultDocument();
    doc.partnerships['u1'] = { id: 'u1', type: RelationshipType.Partnership, childrenIds: ['a'] };
    doc.individuals['a'] = createDefaultIndividual({ id: 'a' });
    doc.parentChildLinks['la'] = {
      id: 'la', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'a', isAdoptive: false,
    };
    doc.partnerships['u2'] = { id: 'u2', type: RelationshipType.Partnership, childrenIds: ['c'] };
    doc.individuals['c'] = createDefaultIndividual({ id: 'c' });
    doc.parentChildLinks['lc'] = {
      id: 'lc', type: RelationshipType.ParentChild, parentPartnershipId: 'u2', childId: 'c', isAdoptive: false,
    };
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'c']);

    render(<PropertiesPanel />);
    expect(screen.queryByText('Twins')).not.toBeInTheDocument();
  });
});

describe('MultiSelectProperties — write discipline', () => {
  it('does not write to the document when a Mixed selection is rendered without interaction', () => {
    const doc = createDefaultDocument();
    doc.individuals['a'] = createDefaultIndividual({
      id: 'a', genderIdentity: GenderIdentity.Man, vitalStatus: VitalStatus.Alive,
    });
    doc.individuals['b'] = createDefaultIndividual({
      id: 'b', genderIdentity: GenderIdentity.Woman, vitalStatus: VitalStatus.Deceased,
    });
    act(() => usePedigreeStore.getState().setDocument(doc));
    selectPeople(['a', 'b']);

    const before = usePedigreeStore.getState().document;
    render(<PropertiesPanel />);
    const after = usePedigreeStore.getState().document;

    // No control was touched, so no store write should have occurred — the
    // document object is referentially identical.
    expect(after).toBe(before);
    expect(after.individuals.a.genderIdentity).toBe(GenderIdentity.Man);
    expect(after.individuals.b.genderIdentity).toBe(GenderIdentity.Woman);
  });
});
