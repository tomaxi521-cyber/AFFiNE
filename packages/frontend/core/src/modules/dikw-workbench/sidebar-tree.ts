import { parseBoardRelation, type BoardRelation } from './board-graph';

export type SidebarBoardRow = {
  id: string;
  depth: number;
  hasChildren: boolean;
};

/** A forest of readable, non-trash ownership paths; never promote hidden
 * descendants to roots. Iterative, at most one visit per valid relation. */
export function sidebarBoardRows(
  relations: ReadonlyMap<string, BoardRelation>,
  visible: ReadonlySet<string>,
  expanded: ReadonlySet<string>
): SidebarBoardRow[] {
  const roots: string[] = [];
  const children = new Map<string, string[]>();
  for (const [id, raw] of relations) {
    const relation = parseBoardRelation(raw);
    if (!relation || relation.docId !== id || !visible.has(id)) continue;
    if (relation.parentId === null) roots.push(id);
    else {
      const list = children.get(relation.parentId) ?? [];
      list.push(id);
      children.set(relation.parentId, list);
    }
  }
  // Yjs insertion order can differ across clients after concurrent creation.
  roots.sort();
  for (const ids of children.values()) ids.sort();
  const rows: SidebarBoardRow[] = [];
  const seen = new Set<string>();
  const stack = roots.reverse().map(id => ({ id, depth: 0 }));
  while (stack.length) {
    const row = stack.pop()!;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const ids = row.depth < 1023 ? (children.get(row.id) ?? []) : [];
    rows.push({ ...row, hasChildren: ids.length > 0 });
    if (expanded.has(row.id)) {
      for (let i = ids.length - 1; i >= 0; i--) {
        stack.push({ id: ids[i], depth: row.depth + 1 });
      }
    }
  }
  return rows;
}
