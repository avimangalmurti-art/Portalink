type Cell = { key: string; span: number; baseRows: number; rows: number };
export type BentoPosition = { column: number; row: number; rows: number };

/** Match dense idle packing, then grow vertically in those same column slots. */
export function layoutBento(cells: Cell[], columns: number): Map<string, BentoPosition> {
  const occupied: boolean[][] = [];
  const baseline = cells.map((cell, index) => {
    let row = 0;
    let column = 0;
    search: for (;; row++) {
      for (column = 0; column <= columns - cell.span; column++) {
        let fits = true;
        for (let y = row; y < row + cell.baseRows && fits; y++) {
          for (let x = column; x < column + cell.span; x++) {
            if (occupied[y]?.[x]) { fits = false; break; }
          }
        }
        if (fits) break search;
      }
    }
    for (let y = row; y < row + cell.baseRows; y++) {
      occupied[y] ??= [];
      for (let x = column; x < column + cell.span; x++) occupied[y][x] = true;
    }
    return { ...cell, row, column, index };
  });
  const ends = Array(columns).fill(0) as number[];
  const positions = new Map<string, BentoPosition>();
  for (const cell of baseline.sort((a, b) => a.row - b.row || a.index - b.index)) {
    const row = Math.max(cell.row, ...ends.slice(cell.column, cell.column + cell.span));
    positions.set(cell.key, { column: cell.column, row, rows: cell.rows });
    for (let x = cell.column; x < cell.column + cell.span; x++) ends[x] = row + cell.rows;
  }
  return positions;
}
