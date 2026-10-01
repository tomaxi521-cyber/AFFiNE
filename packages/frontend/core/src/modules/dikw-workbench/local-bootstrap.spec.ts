import { describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { BoardRepository } from './board-repository';
import { decodeMainBoardSeed, type MainBoardSeed } from './bootstrap';
import {
  createLocalMainBoardSeed,
  localRootInstance,
  prepareLocalMainBoardSeed,
  type LocalBootstrapOptions,
  type LocalSeedRecord,
  type LocalSeedStorage,
} from './local-bootstrap';

function root() {
  const doc = new Y.Doc();
  doc.getMap('meta').set('pages', new Y.Array());
  return doc;
}
function clone(doc: Y.Doc) {
  const copy = new Y.Doc(); Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc)); return copy;
}
const base64 = (doc: Y.Doc) => btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));

// Coordinator tests deliberately avoid application schema setup. A separate
// native-generator test below exercises the real Store/Workspace initialization.
function syntheticSeed(update: Uint8Array): MainBoardSeed {
  const doc = new Y.Doc(); Y.applyUpdate(doc, update);
  const pages = doc.getMap('meta').get('pages') as Y.Array<unknown>;
  pages.push([new Y.Map([['id', 'main']])]);
  new BoardRepository(doc).registerMain('main', 'bootstrap');
  const content = new Y.Doc();
  const children = new Y.Array(); children.push(['surface']);
  content.getMap('blocks').set('page', new Y.Map<unknown>([
    ['sys:id', 'page'], ['sys:flavour', 'affine:page'], ['sys:children', children],
  ]));
  content.getMap('blocks').set('surface', new Y.Map([
    ['sys:id', 'surface'], ['sys:flavour', 'affine:surface'],
  ]));
  return { version: 1, docId: 'main', rootUpdate: base64(doc), contentUpdate: base64(content) };
}

function fixture(doc = root()) {
  const records = new Map<string, unknown>();
  const storage: LocalSeedStorage = {
    get: vi.fn(async key => records.get(key)),
    add: vi.fn(async (key: string, record: LocalSeedRecord) => {
      if (records.has(key)) throw new Error('duplicate');
      records.set(key, record);
    }),
    close: vi.fn(),
  };
  let tail: Promise<unknown> = Promise.resolve();
  const dependencies = {
    lock: <T>(_key: string, task: () => Promise<T>): Promise<T> => {
      const pending = tail.then(task); tail = pending.catch(() => {}); return pending;
    },
    openStorage: vi.fn(async () => storage),
    createSeed: vi.fn(async (update: Uint8Array) => syntheticSeed(update)),
  };
  const options: LocalBootstrapOptions = {
    workspaceId: 'ws', flavour: 'local', rootDoc: doc,
    waitForRootLoaded: vi.fn(async () => {}), assertWritable: vi.fn(async () => {}),
  };
  return { records, storage, dependencies, options };
}

describe('local main board once-only coordinator', () => {
  test('nested pages identity survives edits and clones but distinguishes a recreated workspace', () => {
    const doc = root(); const original = localRootInstance(doc);
    (doc.getMap('meta').get('pages') as Y.Array<unknown>).push([new Y.Map([['id', 'existing']])]);
    expect(localRootInstance(doc)).toBe(original);
    expect(localRootInstance(clone(doc))).toBe(original);
    expect(localRootInstance(root())).not.toBe(original);
  });
  test('unloaded metadata cannot create or persist a seed', async () => {
    const f = fixture(new Y.Doc());
    await expect(prepareLocalMainBoardSeed(f.options, f.dependencies)).rejects.toThrow('载入');
    expect(f.dependencies.createSeed).not.toHaveBeenCalled();
    expect(f.storage.add).not.toHaveBeenCalled();
  });
  test('load barrier completes before guard, generation or IDB access', async () => {
    const f = fixture(); let release!: () => void;
    f.options.waitForRootLoaded = () => new Promise<void>(resolve => { release = resolve; });
    const pending = prepareLocalMainBoardSeed(f.options, f.dependencies);
    await Promise.resolve();
    expect(f.options.assertWritable).not.toHaveBeenCalled();
    expect(f.dependencies.openStorage).not.toHaveBeenCalled();
    release(); await pending;
  });
  test('two stale tabs receive identical committed structs; live roots stay untouched', async () => {
    const f = fixture(); const other = { ...f.options, rootDoc: clone(f.options.rootDoc) };
    const before = Y.encodeStateAsUpdate(f.options.rootDoc);
    const [a, b] = await Promise.all([
      prepareLocalMainBoardSeed(f.options, f.dependencies),
      prepareLocalMainBoardSeed(other, f.dependencies),
    ]);
    expect(a).toEqual(b); expect(a.seed).toBeDefined();
    expect(f.dependencies.createSeed).toHaveBeenCalledTimes(1);
    expect(f.storage.add).toHaveBeenCalledTimes(1);
    expect(Y.encodeStateAsUpdate(f.options.rootDoc)).toEqual(before);
  });
  test('crash after seed commit before live apply reuses bundle', async () => {
    const f = fixture(); const first = await prepareLocalMainBoardSeed(f.options, f.dependencies);
    const restarted = { ...f.options, rootDoc: clone(f.options.rootDoc) };
    expect(await prepareLocalMainBoardSeed(restarted, f.dependencies)).toEqual(first);
    expect(f.dependencies.createSeed).toHaveBeenCalledTimes(1);
  });
  test('same workspaceId with another root instance conflicts instead of replaying', async () => {
    const f = fixture(); await prepareLocalMainBoardSeed(f.options, f.dependencies);
    await expect(prepareLocalMainBoardSeed({ ...f.options, rootDoc: root() }, f.dependencies)).rejects.toThrow('实例冲突');
    expect(f.dependencies.createSeed).toHaveBeenCalledTimes(1);
  });
  test('permission failure happens before persistence and generation', async () => {
    const f = fixture(); f.options.assertWritable = async () => { throw new Error('denied'); };
    await expect(prepareLocalMainBoardSeed(f.options, f.dependencies)).rejects.toThrow('denied');
    expect(f.dependencies.openStorage).not.toHaveBeenCalled();
    expect(f.dependencies.createSeed).not.toHaveBeenCalled();
  });
  test('persistence failure returns no seed and leaves live root unchanged', async () => {
    const f = fixture(); const before = Y.encodeStateAsUpdate(f.options.rootDoc);
    f.storage.add = async () => { throw new Error('quota'); };
    await expect(prepareLocalMainBoardSeed(f.options, f.dependencies)).rejects.toThrow('quota');
    expect(Y.encodeStateAsUpdate(f.options.rootDoc)).toEqual(before);
    expect(f.storage.close).toHaveBeenCalled();
  });
  test('existing main neither creates nor requires write permission', async () => {
    const f = fixture(); new BoardRepository(f.options.rootDoc).registerMain('existing', 'old');
    expect(await prepareLocalMainBoardSeed(f.options, f.dependencies)).toEqual({ docId: 'existing' });
    expect(f.options.assertWritable).not.toHaveBeenCalled();
    expect(f.dependencies.openStorage).not.toHaveBeenCalled();
  });
  test('corrupt cache is never replaced with a second bootstrap', async () => {
    const f = fixture(); f.records.set(JSON.stringify(['local', 'ws']), { version: 99 });
    await expect(prepareLocalMainBoardSeed(f.options, f.dependencies)).rejects.toThrow();
    expect(f.dependencies.createSeed).not.toHaveBeenCalled();
    expect(f.storage.add).not.toHaveBeenCalled();
  });
  test('cloud workspaces cannot bootstrap through the local coordinator', async () => {
    const f = fixture(); f.options.flavour = 'affine';
    await expect(prepareLocalMainBoardSeed(f.options, f.dependencies)).rejects.toThrow('本地工作区');
    expect(f.dependencies.openStorage).not.toHaveBeenCalled();
  });
});

describe('native isolated local seed generation', () => {
  test('preserves original nested metadata and produces native valid blank content', async () => {
    const live = root();
    (live.getMap('meta').get('pages') as Y.Array<unknown>).push([new Y.Map([['id', 'keep']])]);
    const update = Y.encodeStateAsUpdate(live);
    const seed = decodeMainBoardSeed(await createLocalMainBoardSeed(update, 'ws'));
    expect(Y.encodeStateAsUpdate(live)).toEqual(update);
    const loaded = clone(live);
    Y.applyUpdate(loaded, seed.rootUpdate); Y.applyUpdate(loaded, seed.rootUpdate);
    expect(localRootInstance(loaded)).toBe(localRootInstance(live));
    const pages = loaded.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>;
    expect(pages.toArray().map(page => page.get('id'))).toEqual(['keep', seed.docId]);
    const content = new Y.Doc();
    Y.applyUpdate(content, seed.contentUpdate); Y.applyUpdate(content, seed.contentUpdate);
    expect(content.getMap('blocks').size).toBe(4);
  }, 30000);
});
