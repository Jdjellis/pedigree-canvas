import { Layer } from 'react-konva';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
} from '../../types/pedigree';
import type { ConnectionSelection } from '../../stores/uiStore';
import { PartnershipLine } from './PartnershipLine';
import { ParentChildLine } from './ParentChildLine';
import { TwinConnector } from './TwinConnector';
import { IndividualChildlessLine } from './IndividualChildlessLine';

interface ConnectionsLayerProps {
  partnerships: Record<string, PartnershipRelationship>;
  parentChildLinks: Record<string, ParentChildRelationship>;
  twinGroups: Record<string, TwinGroup>;
  individuals: Record<string, Individual>;
  selectedConnection: ConnectionSelection | null;
  hoveredConnection: ConnectionSelection | null;
}

/**
 * Renders all relationship lines on a dedicated Konva Layer.
 *
 * All data is passed as props from react-dom context (CanvasContainer)
 * because Zustand subscriptions do not work inside react-konva's
 * custom reconciler.
 */
export function ConnectionsLayer({
  partnerships,
  parentChildLinks,
  twinGroups,
  individuals,
  selectedConnection,
  hoveredConnection,
}: ConnectionsLayerProps) {
  return (
    <Layer>
      {Object.values(partnerships).map((partnership) => (
        <PartnershipLine
          key={`p-${partnership.id}`}
          partnership={partnership}
          individuals={individuals}
          selectedConnection={selectedConnection}
          hoveredConnection={hoveredConnection}
        />
      ))}
      {Object.values(partnerships).map((partnership) => (
        <ParentChildLine
          key={`pc-${partnership.id}`}
          partnership={partnership}
          individuals={individuals}
          parentChildLinks={parentChildLinks}
          twinGroups={twinGroups}
          selectedConnection={selectedConnection}
          hoveredConnection={hoveredConnection}
        />
      ))}
      {Object.values(twinGroups).map((twinGroup) => (
        <TwinConnector
          key={`tw-${twinGroup.id}`}
          twinGroup={twinGroup}
          individuals={individuals}
          partnerships={partnerships}
          selectedConnection={selectedConnection}
          hoveredConnection={hoveredConnection}
        />
      ))}
      {Object.values(individuals).map((individual) => (
        <IndividualChildlessLine
          key={`icl-${individual.id}`}
          individual={individual}
          partnerships={partnerships}
        />
      ))}
    </Layer>
  );
}
