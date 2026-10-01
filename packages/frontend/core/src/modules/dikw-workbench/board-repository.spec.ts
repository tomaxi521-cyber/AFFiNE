import { describe, expect, test } from 'vitest';
import * as Y from 'yjs';
import { BoardRepository, BOARD_GRAPH_MAP } from './board-repository';

function fixture() {
  const doc = new Y.Doc();
  const repository = new BoardRepository(doc);
  repository.registerMain('main', 'bootstrap');
  return { doc, repository };
}

describe('board metadata persistence', () => {
  test('round trips through native Yjs updates', () => {
    const { doc, repository } = fixture();
    repository.registerChild('child', 'main', 'op1');
    repository.registerChild('grandchild', 'child', 'op2');
    const reopened = new Y.Doc();
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(doc));
    expect(new BoardRepository(reopened).path('grandchild')).toEqual({ ids: ['main', 'child', 'grandchild'], problem: null });
  });
  test('concurrent distinct children survive bidirectional merge', () => {
    const a = fixture();
    const bDoc = new Y.Doc(); Y.applyUpdate(bDoc, Y.encodeStateAsUpdate(a.doc));
    const b = new BoardRepository(bDoc);
    a.repository.registerChild('a', 'main', 'op-a');
    b.registerChild('b', 'main', 'op-b');
    const updateA = Y.encodeStateAsUpdate(a.doc), updateB = Y.encodeStateAsUpdate(bDoc);
    Y.applyUpdate(a.doc, updateB); Y.applyUpdate(bDoc, updateA);
    expect([...a.repository.snapshot().keys()].sort()).toEqual(['a', 'b', 'main']);
    expect([...b.snapshot().keys()].sort()).toEqual(['a', 'b', 'main']);
  });
  test('retries do not duplicate relationships or permit reparenting', () => {
    const { repository } = fixture();
    repository.registerChild('a', 'main', 'op-a');
    repository.registerChild('a', 'main', 'op-a');
    expect(repository.snapshot().size).toBe(2);
    expect(() => repository.registerChild('a', 'other', 'op-a')).toThrow();
    expect(() => repository.registerChild('b', 'main', 'op-a')).toThrow();
    expect(() => repository.registerMain('other', 'another')).toThrow();
  });
  test('corrupt record is not silently overwritten', () => {
    const { doc, repository } = fixture();
    doc.getMap(BOARD_GRAPH_MAP).set('board:broken', { version: 99 });
    expect(() => repository.registerChild('broken', 'main', 'op')).toThrow();
    expect(repository.path('broken').problem).toBe('missing');
    expect(doc.getMap(BOARD_GRAPH_MAP).get('board:broken')).toEqual({ version: 99 });
  });
  test('unrelated reference records do not change parentage', () => {
    const { doc, repository } = fixture();
    repository.registerChild('a', 'main', 'op-a');
    doc.getMap('reference-test-fixture').set('ref', { source: 'elsewhere', target: 'a' });
    expect(repository.path('a').ids).toEqual(['main', 'a']);
  });
  test('observation can be disposed', () => {
    const { repository } = fixture();
    let changes = 0;
    const stop = repository.observe(() => changes++);
    repository.registerChild('a', 'main', 'op-a'); stop();
    repository.registerChild('b', 'main', 'op-b');
    expect(changes).toBe(1);
  });
});
