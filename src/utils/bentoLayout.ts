type Cell = { key: string; span: number; baseRows: number; rows: number };
export type BentoPosition = { column: number; row: number; rows: number };

/** Match dense idle packing, then grow vertically in those same column slots. */
export function layoutBento(cells: Cell[], columns: number): Map<string, BentoPosition> {
  // Home cells each fill one column. Those columns have no gaps, so a running
  // end finds exactly the same first free slot without scanning every 4px row.
  if (cells.every(cell => cell.span === 1 && Number.isInteger(cell.baseRows) && cell.baseRows > 0)) {
    const baselineEnds = Array(columns).fill(0) as number[];
    const expandedEnds = Array(columns).fill(0) as number[];
    const positions = new Map<string, BentoPosition>();
    for (const cell of cells) {
      let column = 0;
      for (let candidate = 1; candidate < columns; candidate++) {
        if (baselineEnds[candidate] < baselineEnds[column]) column = candidate;
      }
      const row = Math.max(baselineEnds[column], expandedEnds[column]);
      baselineEnds[column] += cell.baseRows;
      expandedEnds[column] = row + cell.rows;
      positions.set(cell.key, { column, row, rows: cell.rows });
    }
    return positions;
  }
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
