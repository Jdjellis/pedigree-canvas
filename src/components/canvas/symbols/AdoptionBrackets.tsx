import { Line } from 'react-konva';
import { LINE_WIDTH } from '../../../utils/constants';
import { adoptionBracketPolylines } from './adoptionBracketGeometry';

interface AdoptionBracketsProps {
  /** Stroke colour (matches the symbol outline / selection colour). */
  strokeColor: string;
}

/**
 * Square brackets drawn around an adopted individual's symbol, per NSGC/Bennett
 * nomenclature. Rendered inside the symbol's translated Group, so the bracket
 * geometry is centred on (0,0). Non-interactive — purely decorative.
 */
export function AdoptionBrackets({ strokeColor }: AdoptionBracketsProps) {
  const { left, right } = adoptionBracketPolylines();
  return (
    <>
      <Line points={left} stroke={strokeColor} strokeWidth={LINE_WIDTH} listening={false} />
      <Line points={right} stroke={strokeColor} strokeWidth={LINE_WIDTH} listening={false} />
    </>
  );
}
