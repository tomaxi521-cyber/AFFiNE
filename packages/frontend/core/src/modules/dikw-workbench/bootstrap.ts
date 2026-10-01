import { applyUpdate, Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

import { BoardRepository } from './board-repository';

export interface MainBoardSeed {
  version: 1;
  docId: string;
  rootUpdate: string;
  contentUpdate: string;
}

export interface DecodedMainBoardSeed {
  docId: string;
  rootUpdate: Uint8Array;
  contentUpdate: Uint8Array;
}

/** Validate both halves before mutating any live document. Reuse server structs,
 * never manufacture an independently initialized document with the same ID. */
export function decodeMainBoardSeed(value: unknown): DecodedMainBoardSeed {
  if (!value || typeof value !== 'object') throw new Error('Invalid main board seed');
  const seed = value as Partial<MainBoardSeed>;
  if (seed.version !== 1 || typeof seed.docId !== 'string' || !seed.docId ||
      typeof seed.rootUpdate !== 'string' || typeof seed.contentUpdate !== 'string') {
    throw new Error('Invalid main board seed');
  }
  const decode = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const rootUpdate = decode(seed.rootUpdate);
  const contentUpdate = decode(seed.contentUpdate);
  const root = new YDoc();
  const content = new YDoc();
  try {
    applyUpdate(root, rootUpdate);
    applyUpdate(content, contentUpdate);
    const relation = new BoardRepository(root).snapshot().get(seed.docId);
    const pages = root.getMap('meta').get('pages');
    const hasPage = pages instanceof YArray && pages.toArray().some(
      page => page instanceof YMap && page.get('id') === seed.docId
    );
    const blocks = [...content.getMap('blocks').values()];
    const roots = blocks.filter((block): block is YMap<unknown> => block instanceof YMap && block.get('sys:flavour') === 'affine:page');
    const surfaces = blocks.filter((block): block is YMap<unknown> => block instanceof YMap && block.get('sys:flavour') === 'affine:surface');
    const children = roots[0]?.get('sys:children');
    const linkedSurface = children instanceof YArray && children.toArray().includes(surfaces[0]?.get('sys:id'));
    if (root.store.pendingStructs || root.store.pendingDs || content.store.pendingStructs || content.store.pendingDs ||
        !relation || relation.parentId !== null || !hasPage || roots.length !== 1 || surfaces.length !== 1 || !linkedSurface) {
      throw new Error('Incomplete main board seed');
    }
  } finally {
    root.destroy();
    content.destroy();
  }
  return { docId: seed.docId, rootUpdate, contentUpdate };
}

export async function fetchMainBoardSeed(
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  workspaceId: string
): Promise<DecodedMainBoardSeed> {
  const response = await fetcher(
    '/api/workspaces/' + encodeURIComponent(workspaceId) + '/dikw/main-board',
    { method: 'POST', credentials: 'include' }
  );
  if (!response.ok) throw new Error('Main board bootstrap failed: ' + response.status);
  return decodeMainBoardSeed(await response.json());
}

/** Intentionally fail closed until one persisted seed + cross-tab load barrier
 * can be guaranteed. A random/fixed-ID createDoc fallback is NOT safe. */
export function localMainBoardUnavailable(): never {
  throw new Error('本地主白板初始化暂不可用');
}
