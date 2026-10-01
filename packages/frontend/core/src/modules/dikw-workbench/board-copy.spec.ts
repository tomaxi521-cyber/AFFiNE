import 'fake-indexeddb/auto';

import type { BlockSnapshot, DocSnapshot } from '@blocksuite/affine/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { collectOwnedBoardTree, copyBoardTree, type CopyBoardDependencies, DikwBoardCopyError } from './board-copy';
import { snapshotBlocks } from './board-copy-snapshot';
import { BoardRepository } from './board-repository';

const hooks = vi.hoisted(() => ({ importCount: 0, partial: false, portalFailure: false, portals: [] as string[], nextId: 0 }));
vi.mock('nanoid', () => ({ nanoid: () => 'allocated-' + ++hooks.nextId }));
vi.mock('../workspace/global-schema', () => ({ getAFFiNEWorkspaceSchema: () => ({}) }));
vi.mock('./service', () => ({
  insertChildBoardPortal: (_store: unknown, target: string) => {
    if (hooks.portalFailure) throw new Error('portal unavailable');
    if (!hooks.portals.includes(target)) hooks.portals.push(target);
  },
}));
vi.mock('@blocksuite/affine/store', () => {
  // The test setup may install Symbol.dispose after mocked class creation.
  if (!Symbol.dispose) Object.defineProperty(Symbol, 'dispose', { value: Symbol.for('Symbol.dispose') });
  return { Transformer: class {
    docToSnapshot(store: FakeStore) { return store.snapshot ? structuredClone(store.snapshot) : undefined; }
    snapshotToModelData(block: BlockSnapshot) { return { id: block.id, flavour: block.flavour, props: block.props }; }
    async snapshotToBlock(root: BlockSnapshot, store: FakeStore) {
      hooks.importCount++;
      const blocks = structuredClone(root);
      if (hooks.partial) blocks.children.pop(); // Simulates native silent filtering, truthy return.
      store.replace({ type: 'page', meta: { id: store.id, title: '', createDate: 1, tags: [] }, blocks });
      return { id: blocks.id };
    }
    [Symbol.dispose]() {}
  }};
});

const block = (id: string, flavour: string, props: Record<string, unknown> = {}, children: BlockSnapshot[] = []): BlockSnapshot => ({ type: 'block', id, flavour, props, children });
function snapshot(id: string, child?: string): DocSnapshot {
  return { type: 'page', meta: { id, title: 'Title ' + id, createDate: 1, tags: [] }, blocks:
    block(id + '-root', 'affine:page', {}, [
      block(id + '-surface', 'affine:surface', { elements: {} }, child ? [
        block(id + '-portal', 'affine:embed-synced-doc', { pageId: child, params: { mode: 'edgeless' } }),
      ] : []),
      block(id + '-note', 'affine:note', { xywh: '[1,2,300,200]' }, [block(id + '-text', 'affine:paragraph', { text: 'immutable source' })]),
    ]),
  };
}
class FakeStore {
  history = { undoManager: { clear: vi.fn() } };
  readonly = false;
  spaceDoc = new Y.Doc();
  snapshot?: DocSnapshot;
  constructor(readonly id: string, initial?: DocSnapshot) { if (initial) this.replace(initial); }
  replace(value: DocSnapshot) {
    this.snapshot = value;
    const raw = this.spaceDoc.getMap('blocks');
    raw.clear();
    for (const b of snapshotBlocks(value.blocks)) raw.set(b.id, { flavour: b.flavour });
  }
  get root() { return this.snapshot?.blocks; }
  get meta() { return this.snapshot?.meta; }
  getAllModels() { return this.snapshot ? snapshotBlocks(this.snapshot.blocks) : []; }
  getBlocksByFlavour(flavour: string) { return this.getAllModels().filter(b => b.flavour === flavour).map(model => ({ model })); }
}
let fixtureId = 0;
function fixture() {
  const rootYDoc = new Y.Doc();
  const repository = new BoardRepository(rootYDoc);
  repository.registerMain('parent', 'main');
  repository.registerChild('source', 'parent', 'source-op');
  repository.registerChild('child', 'source', 'child-op');
  repository.registerChild('external', 'parent', 'external-op');
  const stores = new Map([
    ['parent', new FakeStore('parent', snapshot('parent'))],
    ['source', new FakeStore('source', snapshot('source', 'child'))],
    ['child', new FakeStore('child', snapshot('child'))],
    ['external', new FakeStore('external', snapshot('external'))],
  ]);
  const records = new Map([...stores].map(([id, store]) => [id, {
    trash$: { value: false },
    setMeta: (meta: { title: string }) => { if (store.snapshot) Object.assign(store.snapshot.meta, meta); },
  }]));
  const release = vi.fn();
  const priorityRelease = vi.fn();
  const docs = {
    list: { doc$: (id: string) => ({ value: records.get(id) }) },
    createDoc: vi.fn((options: { id: string; skipInit: boolean; primaryMode: string }) => {
      const store = new FakeStore(options.id);
      stores.set(options.id, store);
      records.set(options.id, { trash$: { value: false }, setMeta: meta => { Object.assign(store.snapshot!.meta, meta); } });
      return { id: options.id };
    }),
    open: vi.fn((id: string) => ({ doc: {
      blockSuiteDoc: stores.get(id)!, waitForSyncReady: async () => {}, addPriorityLoad: () => priorityRelease,
    }, release })),
  };
  const engine = { doc: {
    waitForDocLoaded: vi.fn(async (_id: string) => {}),
    waitForDocReady: vi.fn(async (_id: string) => {}),
    waitForUpdated: vi.fn(async (_id: string) => {}),
  } };
  const workspace = {
    id: 'copy-spec-' + ++fixtureId, flavour: 'local', rootYDoc, engine, openOptions: { isSharedMode: false },
    docCollection: { getDoc: (id: string) => stores.has(id) ? { getStore: () => stores.get(id) } : null,
      blobSync: { get: vi.fn(async () => new Blob(['test'])) } },
  };
  const guard = { can: vi.fn(async (_action: string, _id?: string): Promise<boolean | undefined> => true) };
  const deps = { docs, workspace, guard, serverId: 'test' } as unknown as CopyBoardDependencies;
  return { deps, docs, stores, records, repository, engine, guard, workspace, release, priorityRelease };
}

beforeEach(() => {
  hooks.importCount = 0; hooks.partial = false; hooks.portalFailure = false; hooks.portals = [];
  const tasks = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', { locks: { request: (key: string, run: () => Promise<unknown>) => {
    const task = (tasks.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    tasks.set(key, task);
    return task;
  } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('owned board tree copy orchestration', () => {
  test('copies all owned descendants and no external sibling, remaps portals, saves before graph', async () => {
    const f = fixture();
    const before = JSON.stringify([...f.stores].map(([id, s]) => [id, s.snapshot]));
    const calls: string[] = [];
    f.engine.doc.waitForUpdated.mockImplementation(async id => { calls.push(id); });
    const root = await copyBoardTree(f.deps, 'source', 'parent', 'copy');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
    expect(f.docs.createDoc.mock.calls.every(([o]) => o.skipInit === true && o.primaryMode === 'edgeless')).toBe(true);
    const graph = f.repository.snapshot();
    const descendants = [...graph.values()].filter(r => r.parentId === root);
    expect(graph.get(root)?.parentId).toBe('parent');
    expect(descendants).toHaveLength(1);
    expect(f.stores.get(root)!.snapshot!.blocks.children[0].children[0].props.pageId).toBe(descendants[0].docId);
    expect(hooks.portals).toEqual([root]);
    expect(f.stores.get(root)!.history.undoManager.clear).toHaveBeenCalledOnce();
    expect(f.stores.get('source')!.history.undoManager.clear).not.toHaveBeenCalled();
    expect(calls).toContain(root);
    expect(JSON.stringify([...f.stores].filter(([id]) => ['parent', 'source', 'child', 'external'].includes(id)).map(([id, s]) => [id, s.snapshot]))).toBe(before);
    expect(f.release).toHaveBeenCalledTimes(f.docs.open.mock.calls.length);
    expect(f.priorityRelease).toHaveBeenCalledTimes(f.docs.open.mock.calls.length);
  });

  test('fresh locally initialized sources and empty targets do not require a nonempty read', async () => {
    const f = fixture();
    f.engine.doc.waitForDocReady.mockImplementation(async id => {
      if (id !== f.workspace.id) throw new Error('local content is not a nonempty read');
    });
    await copyBoardTree(f.deps, 'source', 'parent', 'local-ready');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
    expect(f.engine.doc.waitForDocLoaded).toHaveBeenCalled();
  });

  test('same-operation concurrent calls reuse persisted identities and do not duplicate', async () => {
    const f = fixture();
    const result = await Promise.all([
      copyBoardTree(f.deps, 'source', 'parent', 'same'),
      copyBoardTree(f.deps, 'source', 'parent', 'same'),
    ]);
    expect(result[0]).toBe(result[1]);
    expect(f.stores.get(result[0])!.history.undoManager.clear).toHaveBeenCalledOnce();
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
    expect(hooks.importCount).toBe(2);
    expect(hooks.portals).toHaveLength(1);
  });

  test.each(['denied', 'trash', 'unsupported', 'corrupt-graph'])('preflight %s writes no documents or graph', async mode => {
    const f = fixture();
    if (mode === 'denied') f.guard.can.mockImplementation(async (action, id) => !(action === 'Doc_Read' && id === 'child'));
    if (mode === 'trash') f.records.get('child')!.trash$.value = true;
    if (mode === 'unsupported') f.stores.get('child')!.snapshot!.blocks.children[1].flavour = 'affine:database';
    if (mode === 'corrupt-graph') f.workspace.rootYDoc.getMap('dikw:board-graph:v1').set('board:broken', { parentId: 'source' });
    const before = [...f.repository.snapshot()];
    await expect(copyBoardTree(f.deps, 'source', 'parent', mode)).rejects.toThrow();
    expect(f.docs.createDoc).not.toHaveBeenCalled();
    expect([...f.repository.snapshot()]).toEqual(before);
    expect(hooks.portals).toHaveLength(0);
  });

  test('silent partial native import fails, publishes no graph, and never replays or overwrites edits', async () => {
    const f = fixture();
    hooks.partial = true;
    const before = [...f.repository.snapshot()];
    await expect(copyBoardTree(f.deps, 'source', 'parent', 'partial')).rejects.toBeInstanceOf(DikwBoardCopyError);
    expect([...f.repository.snapshot()]).toEqual(before);
    const id = f.docs.createDoc.mock.calls[0][0].id;
    f.stores.get(id)!.snapshot!.blocks.props.userEdit = 'keep me';
    hooks.partial = false;
    await expect(copyBoardTree(f.deps, 'source', 'parent', 'partial')).rejects.toBeInstanceOf(DikwBoardCopyError);
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(hooks.importCount).toBe(1);
    expect(f.stores.get(id)!.snapshot!.blocks.props.userEdit).toBe('keep me');
    expect(hooks.portals).toHaveLength(0);
  });

  test('saved bodies survive failed portal then retry, even after edits to clone and source', async () => {
    const f = fixture();
    hooks.portalFailure = true;
    await expect(copyBoardTree(f.deps, 'source', 'parent', 'portal')).rejects.toBeInstanceOf(DikwBoardCopyError);
    const root = f.docs.createDoc.mock.calls[0][0].id;
    f.stores.get(root)!.snapshot!.blocks.props.userEdit = 'keep';
    f.stores.get('source')!.snapshot!.blocks.props.laterSourceEdit = 'not copied';
    hooks.portalFailure = false;
    expect(await copyBoardTree(f.deps, 'source', 'parent', 'portal')).toBe(root);
    expect(f.stores.get(root)!.snapshot!.blocks.props).toEqual({ userEdit: 'keep' });
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
    expect(hooks.importCount).toBe(2);
    expect(hooks.portals).toEqual([root]);
  });

  test('save-barrier failure is recoverable only when the completed snapshot still matches exactly', async () => {
    const f = fixture();
    let fail = true;
    f.engine.doc.waitForUpdated.mockImplementation(async id => {
      if (id.startsWith('allocated-') && fail) { fail = false; throw new Error('storage unavailable'); }
    });
    await expect(copyBoardTree(f.deps, 'source', 'parent', 'save')).rejects.toBeInstanceOf(DikwBoardCopyError);
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    const firstId = f.docs.createDoc.mock.calls[0][0].id;
    expect(await copyBoardTree(f.deps, 'source', 'parent', 'save')).toBe(firstId);
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
    expect(hooks.importCount).toBe(2); // Never imported first document twice.
  });

  test('rejects changed operation parameters and a synchronized operation without local plan', async () => {
    const f = fixture();
    await copyBoardTree(f.deps, 'source', 'parent', 'parameters');
    await expect(copyBoardTree(f.deps, 'child', 'parent', 'parameters')).rejects.toBeInstanceOf(DikwBoardCopyError);
    f.workspace.rootYDoc.getMap('dikw:board-copy:v1').set('other-browser', { docIds: ['reserved'] });
    await expect(copyBoardTree(f.deps, 'source', 'parent', 'other-browser')).rejects.toThrow('原浏览器');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(2);
  });

  test('explicit subtree cap rejects oversized ownership before copying', () => {
    const f = fixture();
    for (let i = 0; i < 33; i++) f.repository.registerChild('extra-' + i, 'source', 'extra-op-' + i);
    expect(() => collectOwnedBoardTree('source', f.repository.snapshot())).toThrow('32');
  });
});
