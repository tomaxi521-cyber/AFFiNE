import { expect, test } from 'vitest';
import { Doc } from 'yjs';
import { BoardRepository } from './board-repository';
import { assertBoardCanBeRemoved } from './board-protection';

test('main cannot be trashed or permanently deleted', () => {
  const root = new Doc();
  new BoardRepository(root).registerMain('main', 'op');
  expect(() => assertBoardCanBeRemoved(root, 'main', false)).toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'main', true)).toThrow();
});
test('project roots may soft-trash with descendants, but ownership is never removed', () => {
  const root = new Doc();
  const repo = new BoardRepository(root);
  repo.registerMain('main', 'bootstrap');
  repo.registerProject('project', 'project-op');
  repo.registerChild('child', 'project', 'child-op');
  const before = [...repo.snapshot()];
  expect(() => assertBoardCanBeRemoved(root, 'project', false)).not.toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'project', true)).toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'child', true)).toThrow();
  expect([...repo.snapshot()]).toEqual(before);
  expect(repo.path('child').ids).toEqual(['project', 'child']);
});
test('child can be restored from trash; hard removal cannot orphan descendants', () => {
  const root = new Doc();
  const repo = new BoardRepository(root);
  repo.registerMain('main', 'op');
  repo.registerChild('child', 'main', 'child-op');
  expect(() => assertBoardCanBeRemoved(root, 'child', false)).not.toThrow();
  expect(() => assertBoardCanBeRemoved(root, 'child', true)).toThrow();
  expect(repo.path('child').ids).toEqual(['main', 'child']);
  expect(() => assertBoardCanBeRemoved(root, 'legacy', true)).not.toThrow();
});
