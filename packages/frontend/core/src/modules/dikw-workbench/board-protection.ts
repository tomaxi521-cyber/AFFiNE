import type { Doc } from 'yjs';
import { parseBoardRelation } from './board-graph';
import { BOARD_GRAPH_MAP } from './board-repository';

/** Product guard only; server synchronization remains the permission boundary. */
export function assertBoardCanBeRemoved(root: Doc, docId: string, permanently: boolean): void {
  const raw = root.getMap(BOARD_GRAPH_MAP).get('board:' + docId);
  if (raw === undefined) return;
  const relation = parseBoardRelation(raw);
  if (!relation) throw new Error('白板关系损坏，请先恢复后再操作');
  if (relation.parentId === null) throw new Error('主白板不能删除');
  if (permanently) throw new Error('嵌套白板暂不支持永久删除，可在回收站恢复');
}
