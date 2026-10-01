import { describe, it, expect } from 'vitest';
import { sidebarBoardRows } from './sidebar-tree';
import type { BoardRelation } from './board-graph';
const graph = (pairs: [string, string | null][]) =>
  new Map(
    pairs.map(([docId, parentId]) => [
      docId,
      { version: 1, docId, parentId, operationId: docId } as BoardRelation,
    ])
  );
const g = graph([
  ['r', null],
  ['a', 'r'],
  ['b', 'r'],
  ['c', 'a'],
  ['orphan', 'missing'],
  ['x', 'y'],
  ['y', 'x'],
]);
const all = new Set(g.keys());
describe('sidebar ownership tree', () => {
  it('collapses by default', () =>
    expect(sidebarBoardRows(g, all, new Set()).map(r => r.id)).toEqual(['r']));
  it('expands true ownership in depth-first order', () =>
    expect(
      sidebarBoardRows(g, all, new Set(['r', 'a'])).map(r => [r.id, r.depth])
    ).toEqual([
      ['r', 0],
      ['a', 1],
      ['c', 2],
      ['b', 1],
    ]));
  it('hides denied or trashed ancestors and their descendants', () =>
    expect(
      sidebarBoardRows(g, new Set(['r', 'b', 'c']), new Set(['r', 'a'])).map(
        r => r.id
      )
    ).toEqual(['r', 'b']));
  it('shows multiple roots without promoting hidden descendants', () => {
    expect(sidebarBoardRows(g, new Set(['a']), all)).toEqual([]);
    const forest = graph([
      ['s', null],
      ['r', null],
      ['a', 'r'],
      ['b', 's'],
      ['c', 'b'],
    ]);
    expect(
      sidebarBoardRows(
        forest,
        new Set(forest.keys()),
        new Set(forest.keys())
      ).map(r => [r.id, r.depth])
    ).toEqual([
      ['r', 0],
      ['a', 1],
      ['s', 0],
      ['b', 1],
      ['c', 2],
    ]);
    const visible = new Set(['r', 'a', 'b', 'c']);
    expect(
      sidebarBoardRows(forest, visible, new Set(forest.keys())).map(r => r.id)
    ).toEqual(['r', 'a']);
    visible.add('s');
    expect(
      sidebarBoardRows(forest, visible, new Set(forest.keys())).map(r => r.id)
    ).toEqual(['r', 'a', 's', 'b', 'c']);
  });
  it('bounds depth and excludes disconnected cycles', () => {
    const deep = graph(
      Array.from(
        { length: 1100 },
        (_, i) => ['n' + i, i ? 'n' + (i - 1) : null] as [string, string | null]
      )
    );
    const ids = new Set(deep.keys());
    expect(sidebarBoardRows(deep, ids, ids)).toHaveLength(1024);
    expect(sidebarBoardRows(g, all, all).map(r => r.id)).toEqual([
      'r',
      'a',
      'c',
      'b',
    ]);
  });
  it('does not mutate ownership or expansion', () => {
    const before = JSON.stringify([...g]);
    sidebarBoardRows(g, all, all);
    expect(JSON.stringify([...g])).toBe(before);
    expect(all.size).toBe(7);
  });
});
