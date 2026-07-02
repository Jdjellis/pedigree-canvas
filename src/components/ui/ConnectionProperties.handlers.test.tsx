/**
 * RTL tests for the ConnectionProperties EDIT handlers (as opposed to the render
 * branches covered in ConnectionProperties.test.tsx): editing the consanguinity
 * degree and infertility cause, changing status / childlessness / line-of-descent
 * via the segmented controls, ungrouping twins, and the two remove buttons that
 * also clear the connection selection.
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import {
  usePedigreeStore,
  createDefaultDocument,
  createDefaultIndividual,
} from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType, TwinType } from '../../types/enums';
import type {
  ParentChildRelationship,
  PartnershipRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { PropertiesPanel } from './PropertiesPanel';

function makePartnership(
  overrides: Partial<PartnershipRelationship> = {},
): PartnershipRelationship {
  return {
    id: 'union1',
    type: RelationshipType.Partnership,
    partner1Id: 'p1',
    partner2Id: 'p2',
    childrenIds: [],
    ...overrides,
  };
}

function makeLink(overrides: Partial<ParentChildRelationship> = {}): ParentChildRelationship {
  return {
    id: 'link1',
    type: RelationshipType.ParentChild,
    parentPartnershipId: 'union1',
    childId: 'child',
    ...overrides,
  };
}

function makeTwinGroup(twinType: TwinType): TwinGroup {
  return { id: 'tw1', twinType, individualIds: ['t1', 't2'], parentPartnershipId: 'union1' };
}

function selectPartnership(p: PartnershipRelationship) {
  const doc = createDefaultDocument();
  doc.partnerships[p.id] = p;
  act(() => {
    usePedigreeStore.getState().setDocument(doc);
    useUIStore.setState({
      selectedConnection: { kind: 'partnership', id: p.id },
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

describe('ConnectionProperties partnership edit handlers', () => {
  it('changes the relationship status via the segmented control', () => {
    selectPartnership(makePartnership());
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Separated' }));
    expect(usePedigreeStore.getState().document.partnerships['union1'].type).toBe(
      RelationshipType.Separation,
    );
  });

  it('edits the consanguinity degree', () => {
    selectPartnership(makePartnership({ type: RelationshipType.Consanguinity }));
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByPlaceholderText('e.g. 1st cousins'), {
      target: { value: '2nd cousins' },
    });
    expect(
      usePedigreeStore.getState().document.partnerships['union1'].consanguinityDegree,
    ).toBe('2nd cousins');
  });

  it('sets an infertility childless status and edits the cause', () => {
    selectPartnership(makePartnership());
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Infertility' }));
    expect(usePedigreeStore.getState().document.partnerships['union1'].childlessStatus).toBe(
      'infertility',
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. azoospermia'), {
      target: { value: 'azoospermia' },
    });
    expect(usePedigreeStore.getState().document.partnerships['union1'].childlessReason).toBe(
      'azoospermia',
    );
  });

  it('parks the infertility cause when leaving it, then restores it on return', () => {
    selectPartnership(
      makePartnership({ childlessStatus: 'infertility', childlessReason: 'azoospermia' }),
    );
    render(<PropertiesPanel />);

    // Leaving infertility hides its cause; the no-children field starts blank.
    fireEvent.click(screen.getByRole('button', { name: 'No children' }));
    let p = usePedigreeStore.getState().document.partnerships['union1'];
    expect(p.childlessStatus).toBe('noChildren');
    expect(p.childlessReason).toBeUndefined();

    // Returning to infertility restores the parked cause instead of losing it.
    fireEvent.click(screen.getByRole('button', { name: 'Infertility' }));
    p = usePedigreeStore.getState().document.partnerships['union1'];
    expect(p.childlessStatus).toBe('infertility');
    expect(p.childlessReason).toBe('azoospermia');
  });

  it('removes the relationship and clears the connection selection', () => {
    selectPartnership(makePartnership());
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove relationship' }));
    expect(usePedigreeStore.getState().document.partnerships['union1']).toBeUndefined();
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });
});

describe('ConnectionProperties parent-child edit handlers', () => {
  function selectLink(link: ParentChildRelationship) {
    const doc = createDefaultDocument();
    doc.individuals['child'] = createDefaultIndividual({ id: 'child', displayName: 'Kid' });
    doc.individuals['p1'] = createDefaultIndividual({ id: 'p1', displayName: 'Dad' });
    doc.individuals['p2'] = createDefaultIndividual({ id: 'p2', displayName: 'Mum' });
    doc.partnerships['union1'] = makePartnership();
    doc.parentChildLinks[link.id] = link;
    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'parentChild', id: link.id },
        propertiesPanelOpen: true,
      });
    });
  }

  it('toggles the line of descent to adoptive', () => {
    selectLink(makeLink({ isAdoptive: false }));
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Adoptive' }));
    expect(usePedigreeStore.getState().document.parentChildLinks['link1'].isAdoptive).toBe(true);
  });

  it('removes the line of descent and clears the connection selection', () => {
    selectLink(makeLink());
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove line of descent' }));
    expect(usePedigreeStore.getState().document.parentChildLinks['link1']).toBeUndefined();
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });
});

describe('ConnectionProperties twin edit handlers', () => {
  function selectTwin(twinType: TwinType) {
    const doc = createDefaultDocument();
    doc.twinGroups['tw1'] = makeTwinGroup(twinType);
    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'twin', id: 'tw1' },
        propertiesPanelOpen: true,
      });
    });
  }

  it('changes the zygosity type', () => {
    selectTwin(TwinType.Monozygotic);
    render(<PropertiesPanel />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: TwinType.Dizygotic },
    });
    expect(usePedigreeStore.getState().document.twinGroups['tw1'].twinType).toBe(
      TwinType.Dizygotic,
    );
  });

  it('ungroups the twins and clears the connection selection', () => {
    selectTwin(TwinType.Monozygotic);
    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Ungroup twins' }));
    expect(usePedigreeStore.getState().document.twinGroups['tw1']).toBeUndefined();
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });
});
