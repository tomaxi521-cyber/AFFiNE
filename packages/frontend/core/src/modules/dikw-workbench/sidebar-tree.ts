import type { BoardRelation } from './board-graph';
export type SidebarBoardRow = { id: string; depth: number; hasChildren: boolean };
/** Only a unique root and readable, non-trash ownership paths; never ordinary embeds. */
export function sidebarBoardRows(relations: ReadonlyMap<string, BoardRelation>, visible: ReadonlySet<string>, expanded: ReadonlySet<string>): SidebarBoardRow[] {
  const roots = [...relations.values()].filter(r => r.parentId === null);
  if (roots.length !== 1 || !visible.has(roots[0].docId)) return [];
  const children = new Map<string, string[]>();
  for (const r of relations.values()) if (r.parentId && visible.has(r.docId)) {
    const list = children.get(r.parentId) ?? []; list.push(r.docId); children.set(r.parentId, list);
  }
  const rows: SidebarBoardRow[] = [], seen = new Set<string>();
  const stack = [{id: roots[0].docId, depth: 0}];
  while (stack.length) {
    const row = stack.pop()!; if (seen.has(row.id)) continue; seen.add(row.id);
    const ids = children.get(row.id) ?? [];
    rows.push({...row, hasChildren: ids.length > 0});
    if (expanded.has(row.id)) for (let i=ids.length-1;i>=0;i--) stack.push({id:ids[i],depth:row.depth+1});
  }
  return rows;
}
