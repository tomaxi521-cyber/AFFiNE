import { expect, test } from 'vitest';
import * as Y from 'yjs';
import { ContentRepository, CONTENT_KIND_MAP } from './content-repository';

test('existing content is unclassified until explicitly assigned', () => {
  const root = new Y.Doc(); const repo = new ContentRepository(root);
  expect(repo.getKind('existing')).toBeNull();
  expect(root.getMap(CONTENT_KIND_MAP).size).toBe(0);
});
test('ownership survives Yjs replay and changing it never copies a document', () => {
  const root = new Y.Doc(); const repo = new ContentRepository(root);
  repo.assign('doc', 'knowledge'); repo.assign('doc', 'artifact');
  const other = new Y.Doc(); Y.applyUpdate(other, Y.encodeStateAsUpdate(root));
  expect(new ContentRepository(other).getKind('doc')).toBe('artifact');
  expect(root.getMap(CONTENT_KIND_MAP).size).toBe(1);
  expect(root.getMap('meta').size).toBe(0);
});
test('unknown schema is preserved rather than overwritten', () => {
  const root = new Y.Doc(); root.getMap(CONTENT_KIND_MAP).set('doc', {version: 9, kind: 'knowledge'});
  const repo = new ContentRepository(root);
  expect(() => repo.assign('doc', 'artifact')).toThrow();
  expect(root.getMap(CONTENT_KIND_MAP).get('doc')).toEqual({version: 9, kind: 'knowledge'});
});
