import { ConflictException } from '@nestjs/common';
import * as Y from 'yjs';

export const MAIN_BOARD_TITLE = '主白板';
export const BOARD_GRAPH_MAP = 'dikw:board-graph:v1';

export interface MainBoardBundle {
  version: 1;
  docId: string;
  /** Full Yjs V1 root state, including the existing nested meta.pages parent. */
  rootUpdate: string;
  /** Yjs V1 update for the empty AFFiNE content document. */
  contentUpdate: string;
}

/** Only root metadata is loaded; never load any existing content document. */
export function createMainBoardRootUpdate(
  rootUpdate: Uint8Array,
  workspaceId: string,
  docId: string,
  now = Date.now()
): Buffer {
  const root = new Y.Doc({ guid: workspaceId });
  try {
    try {
      Y.applyUpdate(root, rootUpdate);
    } catch {
      throw new ConflictException('Workspace root is not ready');
    }
    const pages = root.getMap('meta').get('pages');
    if (
      !(pages instanceof Y.Array) ||
      root.store.pendingStructs ||
      root.store.pendingDs
    ) {
      // Never replace the array: its parent identity is workspace-specific.
      throw new ConflictException('Workspace root meta.pages is not ready');
    }
    if (
      pages
        .toArray()
        .some(page => page instanceof Y.Map && page.get('id') === docId)
    ) {
      throw new ConflictException('Main board document ID already exists');
    }
    const graph = root.getMap(BOARD_GRAPH_MAP);
    for (const [key, relation] of graph) {
      if (!key.startsWith('board:')) continue;
      const parentId = relation instanceof Y.Map
        ? relation.get('parentId')
        : relation && typeof relation === 'object'
          ? (relation as { parentId?: unknown }).parentId
          : undefined;
      if (parentId === null) {
        // A local workspace may already have a main board before cloud import.
        // Do not silently establish a second root or adopt unrelated seed bytes.
        throw new ConflictException('Workspace already has a main board relation');
      }
    }
    root.transact(() => {
      pages.push([
        new Y.Map<unknown>([
          ['id', docId],
          ['title', MAIN_BOARD_TITLE],
          ['createDate', now],
          ['tags', new Y.Array()],
        ]),
      ]);
      graph.set('board:' + docId, {
        version: 1,
        docId,
        parentId: null,
        operationId: 'bootstrap:' + workspaceId,
      });
    });
    // A delta alone depends on the particular workspace's nested Y.Array.
    // Persist the complete update so an empty/offline client can apply it as-is.
    return Buffer.from(Y.encodeStateAsUpdate(root));
  } finally {
    root.destroy();
  }
}
