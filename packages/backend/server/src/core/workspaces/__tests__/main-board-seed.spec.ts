import { ConflictException } from '@nestjs/common';
import test from 'ava';
import * as Y from 'yjs';

import {
  BOARD_GRAPH_MAP,
  createMainBoardRootUpdate,
} from '../main-board-seed';

function fixture() {
  const root = new Y.Doc();
  const pages = new Y.Array<Y.Map<unknown>>();
  root.getMap('meta').set('pages', pages);
  root.getMap('meta').set('name', 'existing workspace');
  pages.push([new Y.Map<unknown>([['id', 'old-doc'], ['title', 'Keep me']])]);
  return { root, pages };
}

test('full root seed preserves nested pages identity and old metadata', t => {
  const { root, pages } = fixture();
  const seed = createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'main', 123);
  Y.applyUpdate(root, seed);
  Y.applyUpdate(root, seed);
  t.is(root.getMap('meta').get('pages'), pages);
  t.deepEqual(pages.toJSON(), [
    { id: 'old-doc', title: 'Keep me' },
    { id: 'main', title: '主白板', createDate: 123, tags: [] },
  ]);
  t.is(root.getMap('meta').get('name'), 'existing workspace');
  t.deepEqual(root.getMap(BOARD_GRAPH_MAP).get('board:main'), {
    version: 1, docId: 'main', parentId: null, operationId: 'bootstrap:ws',
  });
  const emptyClient = new Y.Doc();
  Y.applyUpdate(emptyClient, seed);
  t.deepEqual(emptyClient.getMap('meta').toJSON(), root.getMap('meta').toJSON());
  t.is(emptyClient.store.pendingStructs, null);
  t.is(emptyClient.store.pendingDs, null);
  root.destroy();
  emptyClient.destroy();
});

test('replay does not undo concurrent append, rename, graph data or deletion', t => {
  const { root, pages } = fixture();
  const seed = createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'main');
  pages.get(0).set('title', 'Renamed concurrently');
  pages.push([new Y.Map([['id', 'concurrent-doc']])]);
  root.getMap(BOARD_GRAPH_MAP).set('board:other', { docId: 'other' });
  Y.applyUpdate(root, seed);
  t.is(pages.length, 3);
  t.is(pages.get(0).get('title'), 'Renamed concurrently');
  t.deepEqual(root.getMap(BOARD_GRAPH_MAP).get('board:other'), { docId: 'other' });
  pages.delete(0);
  Y.applyUpdate(root, seed);
  t.is(pages.length, 2);
  t.false(pages.toArray().some(page => page.get('id') === 'old-doc'));
  t.is(pages.toArray().filter(page => page.get('id') === 'main').length, 1);
  root.destroy();
});

test('each old workspace uses its own nested array parent', t => {
  const first = fixture();
  const second = fixture();
  for (const [index, { root, pages }] of [first, second].entries()) {
    const id = 'main-' + index;
    const seed = createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws-' + index, id);
    Y.applyUpdate(root, seed);
    t.is(root.getMap('meta').get('pages'), pages);
    t.is(pages.length, 2);
    t.is(pages.get(1).get('id'), id);
    root.destroy();
  }
});

test('missing, wrong-type and incomplete roots fail closed without replacement', t => {
  const root = new Y.Doc();
  t.throws(() => createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'main'), {
    instanceOf: ConflictException,
  });
  root.getMap('meta').set('pages', []);
  t.throws(() => createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'main'), {
    instanceOf: ConflictException,
  });
  t.throws(() => createMainBoardRootUpdate(new Uint8Array([255]), 'ws', 'main'), {
    instanceOf: ConflictException,
  });
  const ready = fixture();
  const state = Y.encodeStateVector(ready.root);
  ready.pages.push([new Y.Map([['id', 'pending']])]);
  t.throws(() => createMainBoardRootUpdate(Y.encodeStateAsUpdate(ready.root, state), 'ws', 'main'), {
    instanceOf: ConflictException,
  });
  root.destroy();
  ready.root.destroy();
});

test('imported local main relation is rejected rather than creating a second main', t => {
  for (const relation of [
    { version: 1, docId: 'local-main', parentId: null },
    new Y.Map<unknown>([['docId', 'local-main'], ['parentId', null]]),
  ]) {
    const { root, pages } = fixture();
    root.getMap(BOARD_GRAPH_MAP).set('board:local-main', relation);
    t.throws(() => createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'cloud-main'), {
      instanceOf: ConflictException,
    });
    t.is(pages.length, 1);
    root.destroy();
  }
});

test('accidental seed regeneration with same ID is rejected', t => {
  const { root } = fixture();
  const seed = createMainBoardRootUpdate(Y.encodeStateAsUpdate(root), 'ws', 'main');
  t.throws(() => createMainBoardRootUpdate(seed, 'ws', 'main'), {
    instanceOf: ConflictException,
  });
  root.destroy();
});
