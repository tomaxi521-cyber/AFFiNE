import { expect, test } from 'vitest';
import { Doc } from 'yjs';
import { BoardRepository } from './board-repository';
import { assertBoardCanBeRemoved } from './board-protection';

test('main cannot be trashed or permanently deleted', () => {
  const root = new Doc(); new BoardRepository(root).registerMain('main', 'op');
  expect(() => assertBoardCanBeRemoved(root, 'main', false)).toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'main', true)).toThrow();
});
test('child can be restored from trash; hard removal cannot orphan descendants', () => {
  const root = new Doc(); const repo = new BoardRepository(root);
  repo.registerMain('main', 'op'); repo.registerChild('child', 'main', 'child-op');
  expect(() => assertBoardCanBeRemoved(root, 'child', false)).not.toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'child', true)).toThrow();
  expect(repo.path('child').ids).toEqual(['main', 'child']);
  expect(() => assertBoardCanBeRemoved(root, 'legacy', true)).not.toThrow();
});
