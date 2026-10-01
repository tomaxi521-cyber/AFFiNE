import { describe, expect, test } from 'vitest';
import {
  getBoardPath,
  parseBoardRelation,
  validateNewChild,
  type BoardRelation,
} from './board-graph';

const relation = (docId: string, parentId: string | null): BoardRelation => ({
  version: 1,
  docId,
  parentId,
  operationId: 'op-' + docId,
});
const graph = () =>
  new Map([
    ['root', relation('root', null)],
    ['child', relation('child', 'root')],
    ['leaf', relation('leaf', 'child')],
  ]);

describe('DIKW board ownership graph', () => {
  test('resolves main → child → grandchild without changing storage', () => {
    const state = graph();
    expect(getBoardPath('leaf', state)).toEqual({
      ids: ['root', 'child', 'leaf'],
      problem: null,
    });
    expect(state.size).toBe(3);
  });
  test('rejects malformed, unsupported and self-parent metadata', () => {
    for (const value of [
      null,
      [],
      {},
      { ...relation('a', null), version: 2 },
      relation('a', 'a'),
      { ...relation('a', null), parentId: 3 },
    ]) {
      expect(parseBoardRelation(value)).toBeNull();
    }
    expect(parseBoardRelation(relation('a', null))).toEqual(
      relation('a', null)
    );
  });
  test('reports missing parents instead of silently rewriting ownership', () => {
    const state = graph();
    state.delete('child');
    expect(getBoardPath('leaf', state)).toEqual({
      ids: ['leaf'],
      problem: 'missing',
    });
    expect(state.get('leaf')?.parentId).toBe('child');
  });
  test('bounds corrupt merged cycles', () => {
    const state = graph();
    state.set('root', relation('root', 'leaf'));
    expect(getBoardPath('leaf', state).problem).toBe('cycle');
  });
  test('has traversal protection without imposing a two-level UI limit', () => {
    expect(getBoardPath('leaf', graph(), 2).problem).toBe('limit');
    expect(getBoardPath('leaf', graph()).problem).toBeNull();
  });
  test('independent roots do not affect paths or permit child cycles', () => {
    const state = graph();
    state.set('project', { ...relation('project', null), rootKind: 'project' });
    state.set('project-child', relation('project-child', 'project'));
    expect(getBoardPath('project-child', state).ids).toEqual([
      'project',
      'project-child',
    ]);
    expect(getBoardPath('leaf', state).ids).toEqual(['root', 'child', 'leaf']);
    expect(() => validateNewChild('new', 'project-child', state)).not.toThrow();
    expect(() => validateNewChild('project', 'project-child', state)).toThrow();
    state.set('child', relation('child', 'leaf'));
    expect(() => validateNewChild('new', 'child', state)).toThrow();
    expect(getBoardPath('project-child', state).problem).toBeNull();
  });
  test('project marker is retained only for valid root records', () => {
    const project = { ...relation('project', null), rootKind: 'project' };
    expect(parseBoardRelation(project)).toEqual(project);
    expect(parseBoardRelation({ ...project, parentId: 'parent' })).toBeNull();
    expect(parseBoardRelation({ ...project, rootKind: 'unknown' })).toBeNull();
  });
  test('only permits fresh children of valid parents', () => {
    expect(() => validateNewChild('new', 'leaf', graph())).not.toThrow();
    expect(() => validateNewChild('child', 'leaf', graph())).toThrow();
    expect(() => validateNewChild('new', 'missing', graph())).toThrow();
    expect(() => validateNewChild('root', 'root', graph())).toThrow();
  });
});
