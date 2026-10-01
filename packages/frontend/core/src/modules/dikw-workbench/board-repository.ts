import type { Doc } from 'yjs';
import {
  getBoardPath,
  isLegacyBoardRoot,
  parseBoardRelation,
  validateNewChild,
  type BoardRelation,
} from './board-graph';

export const BOARD_GRAPH_MAP = 'dikw:board-graph:v1';

/** Owns metadata only. Does not create/delete documents or grant permissions. */
export class BoardRepository {
  constructor(private readonly root: Doc) {}

  private get records() {
    // Named top-level maps merge concurrent distinct keys. Never replace a nested map.
    return this.root.getMap<unknown>(BOARD_GRAPH_MAP);
  }

  snapshot(): Map<string, BoardRelation> {
    const result = new Map<string, BoardRelation>();
    for (const [key, value] of this.records) {
      if (!key.startsWith('board:')) continue;
      const relation = parseBoardRelation(value);
      if (relation && key === 'board:' + relation.docId)
        result.set(relation.docId, relation);
    }
    return result;
  }

  observe(listener: () => void): () => void {
    this.records.observe(listener);
    return () => this.records.unobserve(listener);
  }

  /** Called ONLY after the separately coordinated main-board bootstrap. */
  registerMain(docId: string, operationId: string): BoardRelation {
    if (!docId || !operationId) throw new Error('Invalid main board identity');
    const otherRoot = [...this.snapshot().values()].find(
      r => isLegacyBoardRoot(r) && r.docId !== docId
    );
    if (otherRoot) throw new Error('Main board already registered');
    return this.insert({ version: 1, docId, parentId: null, operationId });
  }

  /** Independent project root, not a second legacy bootstrap. */
  registerProject(docId: string, operationId: string): BoardRelation {
    return this.insert({
      version: 1,
      docId,
      parentId: null,
      operationId,
      rootKind: 'project',
    });
  }

  registerChild(
    docId: string,
    parentId: string,
    operationId: string
  ): BoardRelation {
    const record: BoardRelation = { version: 1, docId, parentId, operationId };
    const existing = this.records.get('board:' + docId);
    if (existing !== undefined) return this.insert(record); // Idempotent retry, not reparenting.
    validateNewChild(docId, parentId, this.snapshot());
    return this.insert(record);
  }

  path(docId: string) {
    return getBoardPath(docId, this.snapshot());
  }

  private insert(record: BoardRelation): BoardRelation {
    if (!parseBoardRelation(record)) throw new Error('Invalid board metadata');
    const key = 'board:' + record.docId;
    const raw = this.records.get(key);
    if (raw !== undefined) {
      const existing = parseBoardRelation(raw);
      if (
        !existing ||
        existing.docId !== record.docId ||
        existing.parentId !== record.parentId ||
        existing.operationId !== record.operationId ||
        existing.rootKind !== record.rootKind
      ) {
        throw new Error('Conflicting board metadata; repair required');
      }
      return existing;
    }
    // Caller must retain docId + operationId across retries. New children use unique IDs.
    for (const existing of this.snapshot().values()) {
      if (existing.operationId === record.operationId)
        throw new Error('Operation already belongs to another board');
    }
    this.root.transact(() => this.records.set(key, record));
    return record;
  }
}
