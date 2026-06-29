import { render, screen, act } from '@testing-library/react';
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

function makeLink(
  id: string,
  childId: string,
  parentPartnershipId: string,
  isAdoptive?: boolean,
): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive };
}

function makePartnership(
  id: string,
  type: PartnershipRelationship['type'],
  consanguinityDegree?: string,
): PartnershipRelationship {
  return { id, type, partner1Id: 'p1', partner2Id: 'p2', childrenIds: [], consanguinityDegree };
}

function makeTwinGroup(id: string, twinType: TwinType): TwinGroup {
  return { id, twinType, individualIds: ['t1', 't2'], parentPartnershipId: 'union1' };
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

describe('ConnectionProperties via PropertiesPanel', () => {
  it('renders the line-of-descent control for a parent-child edge', () => {
    const doc = createDefaultDocument();
    doc.individuals['p1'] = createDefaultIndividual({ id: 'p1', displayName: 'Dad' });
    doc.individuals['p2'] = createDefaultIndividual({ id: 'p2', displayName: 'Mum' });
    doc.individuals['child'] = createDefaultIndividual({ id: 'child', displayName: 'Kid' });
    doc.partnerships['union1'] = { ...makePartnership('union1', RelationshipType.Partnership) };
    doc.parentChildLinks['link1'] = makeLink('link1', 'child', 'union1', false);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'parentChild', id: 'link1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);

    expect(screen.getByRole('group', { name: 'Line of descent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Biological' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Adoptive' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the relationship-status control and shows the degree input only when consanguineous', () => {
    const doc = createDefaultDocument();
    doc.partnerships['union1'] = makePartnership('union1', RelationshipType.Consanguinity, '1st cousins');

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'union1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);

    expect(screen.getByRole('group', { name: 'Relationship status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consanguineous' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByDisplayValue('1st cousins')).toBeInTheDocument();
  });

  it('does not show the degree input for a plain partnership', () => {
    const doc = createDefaultDocument();
    doc.partnerships['union1'] = makePartnership('union1', RelationshipType.Partnership);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'union1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.queryByPlaceholderText('e.g. 1st cousins')).not.toBeInTheDocument();
  });

  it('renders the zygosity control for a twin connector', () => {
    const doc = createDefaultDocument();
    doc.twinGroups['tw1'] = makeTwinGroup('tw1', TwinType.Monozygotic);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'twin', id: 'tw1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Ungroup twins' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue(TwinType.Monozygotic);
  });

  it('shows the empty state when the selected connection no longer exists', () => {
    act(() => {
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'missing' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.getByText(/Select an individual/i)).toBeInTheDocument();
  });
});
