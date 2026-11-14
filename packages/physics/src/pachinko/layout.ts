import { BOARD } from '@jackpotsyndicate/contracts';
import type { PegDef, PegKind } from '@jackpotsyndicate/contracts';

/**
 * The baseline pinfield from the design blueprint: 5 staggered rows of 7/6
 * pegs, two splitter gates on row 1, one bumper in the middle of row 2.
 * Content authors can start from this and edit the result.
 */
export function makeStandardPegLayout(): PegDef[] {
  const pegs: PegDef[] = [];
  const rows = 5;
  const startY = 52;
  const chuteTop = BOARD.SPLIT_Y - BOARD.CHUTE_H;
  const rowSpacing = (chuteTop - startY - 10) / rows;
  let id = 0;
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0 ? 7 : 6;
    const colSpacing = BOARD.W / (cols + 1);
    for (let c = 1; c <= cols; c++) {
      const x = c * colSpacing + (r % 2 === 1 ? colSpacing * 0.15 : 0);
      const y = startY + r * rowSpacing;
      let kind: PegKind = 'gold';
      if (r === 1 && (c === 2 || c === cols - 1)) kind = 'splitter';
      else if (r === 2 && c === Math.ceil(cols / 2)) kind = 'bumper';
      pegs.push({ id: id++, x, y, kind, radius: kind === 'bumper' ? 11 : 5.5 });
    }
  }
  return pegs;
}
