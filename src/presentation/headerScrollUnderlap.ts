/** Extend an existing column scroller beneath its stationary sibling headers.
 * Sticky headers already inside the scroller need no layout adjustment. */
export function headerScrollUnderlaps(headers: HTMLElement[], scroller: HTMLElement, root: HTMLElement) {
  const connections: Array<{ branch: HTMLElement; scroller: HTMLElement; height: number; headers: HTMLElement[] }> = [];
  let branch = scroller;
  for (let parent = branch.parentElement; parent && root.contains(parent); branch = parent, parent = parent.parentElement) {
    if (scroller.contains(parent) || ['fixed', 'absolute'].includes(getComputedStyle(branch).position)) continue;
    const style = getComputedStyle(parent);
    if (!style.display.includes('flex') || style.flexDirection !== 'column') continue;
    const siblings = Array.from(parent.children) as HTMLElement[];
    const stack: HTMLElement[] = [];
    for (let index = siblings.indexOf(branch) - 1; index >= 0; index--) {
      const sibling = siblings[index];
      if (!sibling.getBoundingClientRect().height) continue;
      const ownsHeader = headers.some(header => (sibling === header || sibling.contains(header)) && !['fixed', 'absolute'].includes(getComputedStyle(header).position));
      if (!ownsHeader) break;
      stack.unshift(sibling);
    }
    if (!stack.length || stack.some(header => scroller.contains(header))) continue;
    const top = stack[0].getBoundingClientRect().top;
    const bottom = stack[stack.length - 1].getBoundingClientRect().bottom;
    const contentTop = branch.getBoundingClientRect().top;
    // Preserve screens already using an under-header layout, including chat.
    if (contentTop < bottom - 1 || contentTop - top <= 1) continue;
    connections.push({ branch, scroller, height: contentTop - top, headers: headers.filter(header => stack.some(sibling => sibling === header || sibling.contains(header))) });
  }
  return connections;
}

export function headerScrollUnderlap(headers: HTMLElement[], scroller: HTMLElement, root: HTMLElement) {
  return headerScrollUnderlaps(headers, scroller, root)[0] ?? null;
}

export function applyHeaderScrollUnderlaps(connections: ReturnType<typeof headerScrollUnderlaps>) {
  const branches = new Map(connections.map(connection => [connection.branch, connection]));
  const contents = new Map<HTMLElement, number>();
  const contentBranches = new Map<HTMLElement, Set<HTMLElement>>();
  const shiftedHeaders = new Set<HTMLElement>();
  const values: Array<[HTMLElement, string, string]> = [];
  for (const { branch, height } of branches.values()) {
    values.push([branch, '--fixed-header-height', `${height}px`], [branch, '--fixed-header-margin', getComputedStyle(branch).marginTop || '0px']);
  }
  // Side-by-side panes can share one outer body. Move that body only once,
  // while compensating each pane's independent content and reading position.
  for (const { branch, scroller, height } of connections) {
    const seen = contentBranches.get(scroller) ?? new Set<HTMLElement>();
    if (seen.has(branch)) continue;
    seen.add(branch); contentBranches.set(scroller, seen);
    contents.set(scroller, (contents.get(scroller) ?? 0) + height);
  }
  for (const [scroller, height] of contents) {
    const contentStyle = getComputedStyle(scroller);
    values.push([scroller, '--fixed-header-content-height', `${height}px`],
      [scroller, '--fixed-header-padding', contentStyle.paddingTop || '0px'],
      [scroller, '--fixed-header-scroll-padding', contentStyle.scrollPaddingTop === 'auto' ? '0px' : contentStyle.scrollPaddingTop || '0px']);
  }
  // Nested fixed controls retain their original place while their enclosing
  // body extends upward (for example New portal's title plus icon-search area).
  const headers = new Set(connections.flatMap(connection => connection.headers));
  for (const header of headers) {
    const offset = Array.from(branches.values()).reduce((total, connection) => total + (connection.branch.contains(header) && !connection.headers.includes(header) ? connection.height : 0), 0);
    if (!offset) continue;
    const top = getComputedStyle(header).top;
    values.push([header, '--fixed-header-top', !top || top === 'auto' ? '0px' : top], [header, '--fixed-header-offset', `${offset}px`]);
    shiftedHeaders.add(header);
  }
  const previous = values.map(([node, name]) => node.style.getPropertyValue(name));
  for (const [node, name, value] of values) node.style.setProperty(name, value);
  branches.forEach((_value, branch) => { branch.dataset.fixedHeaderUnderlap = ''; });
  contents.forEach((_value, scroller) => { scroller.dataset.fixedHeaderContent = ''; });
  shiftedHeaders.forEach(header => { header.dataset.fixedHeaderOffset = ''; });
  return () => {
    branches.forEach((_value, branch) => { delete branch.dataset.fixedHeaderUnderlap; });
    contents.forEach((_value, scroller) => { delete scroller.dataset.fixedHeaderContent; });
    shiftedHeaders.forEach(header => { delete header.dataset.fixedHeaderOffset; });
    values.forEach(([node, name], index) => {
      if (previous[index]) node.style.setProperty(name, previous[index]); else node.style.removeProperty(name);
    });
  };
}

export function applyHeaderScrollUnderlap(connection: NonNullable<ReturnType<typeof headerScrollUnderlap>>) {
  return applyHeaderScrollUnderlaps([connection]);
}
