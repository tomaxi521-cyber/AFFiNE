import type { Doc } from 'yjs';
import { isLegacyBoardRoot, parseBoardRelation } from './board-graph';
import { BOARD_GRAPH_MAP } from './board-repository';

/** Product guard only; server synchronization remains the permission boundary. */
export function assertBoardCanBeRemoved(
  root: Doc,
  docId: string,
  permanently: boolean
): void {
  const raw = root.getMap(BOARD_GRAPH_MAP).get('board:' + docId);
  if (raw === undefined) return;
  const relation = parseBoardRelation(raw);
  if (!relation || relation.docId !== docId)
    throw new Error('白板关系损坏，请先恢复后再操作');
  if (isLegacyBoardRoot(relation)) throw new Error('主白板不能删除');
  // Project/child trash is reversible. Keep ownership edges intact so hiding a
  // trashed ancestor hides the whole subtree and restoring it restores the tree.
  if (permanently)
    throw new Error('项目及嵌套白板暂不支持永久删除，可在回收站恢复');
}
