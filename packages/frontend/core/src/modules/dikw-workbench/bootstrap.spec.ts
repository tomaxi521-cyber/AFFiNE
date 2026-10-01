import { describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { BoardRepository } from './board-repository';
import { decodeMainBoardSeed, fetchMainBoardSeed, localMainBoardUnavailable } from './bootstrap';

function seed() {
  const root = new Y.Doc();
  new BoardRepository(root).registerMain('main', 'bootstrap');
  root.getMap('meta').set('pages', new Y.Array());
  (root.getMap('meta').get('pages') as Y.Array<unknown>).push([new Y.Map([['id', 'main']])]);
  const content = new Y.Doc();
  const children = new Y.Array(); children.push(['surface']);
  content.getMap('blocks').set('page', new Y.Map<unknown>([['sys:id', 'page'], ['sys:flavour', 'affine:page'], ['sys:children', children]]));
  content.getMap('blocks').set('surface', new Y.Map([['sys:id', 'surface'], ['sys:flavour', 'affine:surface']]));
  const encode = (doc: Y.Doc) => btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
  return { version: 1, docId: 'main', rootUpdate: encode(root), contentUpdate: encode(content) };
}

describe('cloud main board seed', () => {
  test('decodes original structs; applying a seed twice cannot duplicate blocks', () => {
    const decoded = decodeMainBoardSeed(seed());
    const content = new Y.Doc();
    Y.applyUpdate(content, decoded.contentUpdate);
    Y.applyUpdate(content, decoded.contentUpdate);
    expect(content.getMap('blocks').size).toBe(2);
  });
  test('does not erase edits made after the seed', () => {
    const decoded = decodeMainBoardSeed(seed());
    const content = new Y.Doc();
    Y.applyUpdate(content, decoded.contentUpdate);
    content.getMap('blocks').set('user-content', 'keep');
    Y.applyUpdate(content, decoded.contentUpdate);
    expect(content.getMap('blocks').get('user-content')).toBe('keep');
  });
  test('rejects malformed, mismatched and incomplete bundles', () => {
    expect(() => decodeMainBoardSeed(null)).toThrow();
    expect(() => decodeMainBoardSeed({ ...seed(), version: 2 })).toThrow();
    expect(() => decodeMainBoardSeed({ ...seed(), docId: 'other' })).toThrow();
    expect(() => decodeMainBoardSeed({ ...seed(), contentUpdate: 'AA==' })).toThrow();
    expect(() => decodeMainBoardSeed({ ...seed(), rootUpdate: '!!' })).toThrow();
  });
  test('uses only the authenticated bootstrap API', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(seed())));
    await fetchMainBoardSeed(fetcher, 'workspace/a');
    expect(fetcher).toHaveBeenCalledWith('/api/workspaces/workspace%2Fa/dikw/main-board', {
      method: 'POST', credentials: 'include',
    });
  });
  test('HTTP failure cannot become a local create fallback', async () => {
    await expect(fetchMainBoardSeed(async () => new Response('', { status: 403 }), 'ws')).rejects.toThrow('403');
  });
  test('unsupported local bootstrap fails explicitly', () => {
    expect(localMainBoardUnavailable).toThrow('本地主白板初始化暂不可用');
  });
});
