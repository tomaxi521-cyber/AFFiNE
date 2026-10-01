/** Workspace board ownership. Ordinary document references never enter this graph. */
export interface BoardRelation {
  version: 1;
  docId: string;
  parentId: string | null;
  operationId: string;
}

export type BoardPath = {
  ids: string[];
  problem: 'missing' | 'cycle' | 'limit' | null;
};

/** Read untrusted/synchronised metadata defensively; do not coerce it. */
export function parseBoardRelation(value: unknown): BoardRelation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.docId !== 'string' || !record.docId ||
    typeof record.operationId !== 'string' || !record.operationId ||
    !(record.parentId === null || (typeof record.parentId === 'string' && record.parentId.length > 0)) ||
    record.parentId === record.docId
  ) return null;
  return {
    version: 1,
    docId: record.docId,
    parentId: record.parentId as string | null,
    operationId: record.operationId,
  };
}

/** No recursion: corrupt or remotely merged edges cannot hang the UI. */
export function getBoardPath(
  docId: string,
  relations: ReadonlyMap<string, BoardRelation>,
  limit = 1024
): BoardPath {
  const ids: string[] = [];
  const visited = new Set<string>();
  let current: string | null = docId;
  while (current !== null) {
    if (visited.has(current)) return { ids: ids.reverse(), problem: 'cycle' };
    if (ids.length >= limit) return { ids: ids.reverse(), problem: 'limit' };
    const relation = relations.get(current);
    if (!relation || relation.docId !== current) return { ids: ids.reverse(), problem: 'missing' };
    visited.add(current);
    ids.push(current);
    current = relation.parentId;
  }
  return { ids: ids.reverse(), problem: null };
}

/** Fresh children only. Reparenting requires a separate conflict/undo contract. */
export function validateNewChild(
  childId: string,
  parentId: string,
  relations: ReadonlyMap<string, BoardRelation>
): void {
  if (!childId || !parentId || childId === parentId) throw new Error('Invalid board relationship');
  if (relations.has(childId)) throw new Error('Board already has an ownership relationship');
  const parentPath = getBoardPath(parentId, relations);
  if (parentPath.problem) throw new Error('Parent board hierarchy is unavailable');
}
