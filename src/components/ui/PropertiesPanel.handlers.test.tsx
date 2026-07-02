/**
 * RTL tests for the PropertiesPanel field-edit handlers.
 *
 * The panel early-returns to the empty state unless both `propertiesPanelOpen`
 * and a single selected individual exist, so each test seeds both stores via
 * `seedIndividual` before rendering and asserts the pedigree store updates.
 *
 * These complement PropertiesPanel.test.tsx (adoption / stillbirth branches) by
 * exercising the identity, condition, investigation, clinical-note, vital-status,
 * role, and notes handlers that were otherwise untested.
 */
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import {
  usePedigreeStore,
  createDefaultDocument,
  createDefaultIndividual,
} from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity, SexAssignedAtBirth, VitalStatus } from '../../types/enums';
import type { Individual, LegendEntry } from '../../types/pedigree';
import { PropertiesPanel } from './PropertiesPanel';

function seedIndividual(overrides: Partial<Individual> = {}, entries: LegendEntry[] = []) {
  const ind = createDefaultIndividual({ id: 'ind-1', ...overrides });
  const doc = createDefaultDocument();
  doc.individuals['ind-1'] = ind;
  doc.legendConfig.entries = entries;

  act(() => {
    usePedigreeStore.getState().setDocument(doc);
    useUIStore.setState({
      selectedIds: new Set(['ind-1']),
      selectedConnection: null,
      propertiesPanelOpen: true,
    });
  });
}

function current(): Individual {
  return usePedigreeStore.getState().document.individuals['ind-1'];
}

/**
 * The panel has several "Add" submit buttons live at once (investigation, plus
 * whichever inline form is open), so scope the click to the `.noteForm`
 * container that owns `input`.
 */
function clickAddNear(input: HTMLElement) {
  const form = input.closest('div');
  fireEvent.click(within(form as HTMLElement).getByRole('button', { name: 'Add' }));
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

describe('PropertiesPanel identity handlers', () => {
  it('edits the display name and clears it back to undefined when blank', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    const nameInput = screen.getByPlaceholderText('Name or initials');
    fireEvent.change(nameInput, { target: { value: 'AB' } });
    expect(current().displayName).toBe('AB');

    fireEvent.change(nameInput, { target: { value: '' } });
    expect(current().displayName).toBeUndefined();
  });

  it('changes gender identity via the icon buttons', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Woman' }));
    expect(current().genderIdentity).toBe(GenderIdentity.Woman);
  });

  it('sets and clears sex assigned at birth', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    const select = screen.getByDisplayValue('Not specified');
    fireEvent.change(select, { target: { value: SexAssignedAtBirth.AFAB } });
    expect(current().sexAssignedAtBirth).toBe(SexAssignedAtBirth.AFAB);

    fireEvent.change(select, { target: { value: '' } });
    expect(current().sexAssignedAtBirth).toBeUndefined();
  });
});

describe('PropertiesPanel condition handlers', () => {
  const entry: LegendEntry = {
    id: 'cond-1',
    name: 'Cancer',
    fillColor: '#dc2626',
    quarter: 'topRight',
    fillPattern: 'solid',
  };

  it('toggles an applicable condition on and off', () => {
    seedIndividual({}, [entry]);
    render(<PropertiesPanel />);

    const checkbox = screen.getByRole('checkbox', { name: /Cancer/ });
    fireEvent.click(checkbox);
    expect(current().conditionIds).toContain('cond-1');

    fireEvent.click(checkbox);
    expect(current().conditionIds).not.toContain('cond-1');
  });

  it('creates a new condition inline and applies it to the individual', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Condition' }));
    const nameInput = screen.getByPlaceholderText('Condition name');
    fireEvent.change(nameInput, { target: { value: 'Diabetes' } });
    clickAddNear(nameInput);

    const doc = usePedigreeStore.getState().document;
    const added = doc.legendConfig.entries.find((e) => e.name === 'Diabetes');
    expect(added).toBeDefined();
    expect(current().conditionIds).toContain(added!.id);
    // Form reset — the add button reappears.
    expect(screen.getByRole('button', { name: '+ Add Condition' })).toBeInTheDocument();
  });

  it('does not create a condition when the name is only whitespace', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Condition' }));
    const nameInput = screen.getByPlaceholderText('Condition name');
    // Enter with a blank name is a no-op (submit guarded).
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(usePedigreeStore.getState().document.legendConfig.entries).toHaveLength(0);
  });

  it('cancels the add-condition form via Escape', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Condition' }));
    const nameInput = screen.getByPlaceholderText('Condition name');
    fireEvent.change(nameInput, { target: { value: 'Temp' } });
    fireEvent.keyDown(nameInput, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('Condition name')).not.toBeInTheDocument();
    expect(usePedigreeStore.getState().document.legendConfig.entries).toHaveLength(0);
  });
});

describe('PropertiesPanel investigation handlers', () => {
  it('adds an investigation and skips exact duplicates', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByPlaceholderText('Label (e.g. BRCA1)'), {
      target: { value: 'BRCA1' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Result / description (e.g. Pathogenic variant)'),
      { target: { value: 'Pathogenic' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(current().investigations).toEqual([
      { label: 'BRCA1', description: 'Pathogenic' },
    ]);

    // Re-adding the exact same label+description is a no-op.
    fireEvent.change(screen.getByPlaceholderText('Label (e.g. BRCA1)'), {
      target: { value: 'BRCA1' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Result / description (e.g. Pathogenic variant)'),
      { target: { value: 'Pathogenic' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(current().investigations).toHaveLength(1);
  });

  it('adds an investigation via the Enter key', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    const labelInput = screen.getByPlaceholderText('Label (e.g. BRCA1)');
    fireEvent.change(labelInput, { target: { value: 'CFTR' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    expect(current().investigations).toEqual([{ label: 'CFTR', description: '' }]);
  });

  it('removes an investigation', () => {
    seedIndividual({ investigations: [{ label: 'MLH1', description: 'VUS' }] });
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(current().investigations).toHaveLength(0);
  });
});

describe('PropertiesPanel clinical-note handlers', () => {
  it('adds a note with a parsed age of onset', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Note' }));
    const noteInput = screen.getByPlaceholderText('Clinical note / condition');
    fireEvent.change(noteInput, { target: { value: 'Migraine' } });
    fireEvent.change(screen.getByPlaceholderText('Age of onset (optional)'), {
      target: { value: '35' },
    });
    clickAddNear(noteInput);

    expect(current().conditions).toHaveLength(1);
    expect(current().conditions[0]).toMatchObject({ name: 'Migraine', ageOfOnset: 35 });
  });

  it('adds a note without an age (ageOfOnset stays undefined)', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Note' }));
    const nameInput = screen.getByPlaceholderText('Clinical note / condition');
    fireEvent.change(nameInput, { target: { value: 'Asthma' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(current().conditions[0]).toMatchObject({ name: 'Asthma' });
    expect(current().conditions[0].ageOfOnset).toBeUndefined();
  });

  it('removes a clinical note', () => {
    seedIndividual({ conditions: [{ id: 'c1', name: 'Gout' }] });
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(current().conditions).toHaveLength(0);
  });
});

describe('PropertiesPanel vital-status handlers', () => {
  it('sets the age for a living individual', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByPlaceholderText('Age'), { target: { value: '42' } });
    expect(current().age).toBe(42);
  });

  it('sets a cause of death when deceased', () => {
    seedIndividual({ vitalStatus: VitalStatus.Deceased });
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByPlaceholderText('Cause of death'), {
      target: { value: 'MI' },
    });
    expect(current().causeOfDeath).toBe('MI');
  });

  it('switches vital status to Deceased', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Deceased' }));
    expect(current().vitalStatus).toBe(VitalStatus.Deceased);
  });

  it('edits the gestational age for a stillbirth', () => {
    seedIndividual({ vitalStatus: VitalStatus.Stillborn });
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByPlaceholderText('e.g. 20 wk'), {
      target: { value: '22 wk' },
    });
    expect(current().gestationalAge).toBe('22 wk');
  });
});

describe('PropertiesPanel role and notes handlers', () => {
  it('marks the individual as proband, then consultand, then none', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Proband' }));
    expect(current().isProband).toBe(true);
    expect(current().isConsultand).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Consultand' }));
    expect(current().isProband).toBe(false);
    expect(current().isConsultand).toBe(true);

    const roleGroup = screen.getByRole('group', { name: 'Pedigree role' });
    fireEvent.click(within(roleGroup).getByRole('button', { name: 'None' }));
    expect(current().isProband).toBe(false);
    expect(current().isConsultand).toBe(false);
  });

  it('toggles the plain Adopted checkbox (no parent links)', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    const checkbox = screen.getByRole('checkbox', { name: 'Adopted' });
    fireEvent.click(checkbox);
    expect(current().adopted).toBe(true);

    fireEvent.click(checkbox);
    expect(current().adopted).toBeUndefined();
  });

  it('edits the free-text notes and clears them back to undefined', () => {
    seedIndividual();
    render(<PropertiesPanel />);

    const textarea = screen.getByPlaceholderText('Internal notes...');
    fireEvent.change(textarea, { target: { value: 'follow up' } });
    expect(current().notes).toBe('follow up');

    fireEvent.change(textarea, { target: { value: '' } });
    expect(current().notes).toBeUndefined();
  });
});
