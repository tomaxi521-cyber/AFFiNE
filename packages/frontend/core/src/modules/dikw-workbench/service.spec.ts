import type { Store } from '@blocksuite/affine/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { BoardRepository } from './board-repository';
import { DikwChildCreationError, DikwWorkbenchService, insertLinkedCard } from './service';

// Test the orchestration against actual Yjs and repository, without booting an
// application/provider or talking to a real workspace/server.
vi.mock('nanoid', () => ({ nanoid: () => 'child' }));
vi.mock('@toeverything/infra', () => ({
  Service: class { disposables: (() => void)[] = []; },
  LiveData: class<T> {
    constructor(public value: T) {}
    setValue(value: T) { this.value = value; }
  },
}));

function cardStore() {
  const surface = { id: 'surface', children: [] as { id: string }[] };
  const cards: { model: { id: string; props: Record<string, unknown> } }[] = [];
  const store = {
    readonly: false,
    getBlocksByFlavour: vi.fn((flavour: string) => flavour === 'affine:surface' ? [{ model: surface }] : cards),
    addBlock: vi.fn((_flavour: string, props: Record<string, unknown>) => {
      const id = 'card-' + cards.length;
      cards.push({ model: { id, props } }); surface.children.push({ id }); return id;
    }),
  };
  return { store, cards };
}

function fixture(main = true) {
  const rootYDoc = new Y.Doc();
  const repository = new BoardRepository(rootYDoc);
  if (main) repository.registerMain('main', 'bootstrap');
  const { store, cards } = cardStore();
  const release = vi.fn();
  const releasePriority = vi.fn();
  const docs = {
    createDoc: vi.fn(() => ({ id: 'child' })),
    open: vi.fn(() => ({ doc: {
      blockSuiteDoc: store,
      waitForSyncReady: vi.fn(async () => {}),
      addPriorityLoad: vi.fn(() => releasePriority),
    }, release })),
    list: { doc$: vi.fn(() => ({ value: { trash$: { value: false } } })) },
  };
  const engine = { doc: {
    waitForDocReady: vi.fn(async (_id: string) => {}),
    waitForDocLoaded: vi.fn(async (_id: string) => {}),
    waitForUpdated: vi.fn(async (_id: string) => {}),
    storage: { pushDocUpdate: vi.fn(async (_update: { docId: string; bin: Uint8Array }) => {}) },
  } };
  const nativeDoc = { spaceDoc: new Y.Doc(), load: vi.fn() };
  const workspace = { id: 'ws', flavour: 'affine', openOptions: { isSharedMode: false }, rootYDoc, engine,
    docCollection: { getDoc: vi.fn(() => nativeDoc) },
  };
  const can = vi.fn(async (_action: string, _docId?: string): Promise<boolean | undefined> => true);
  const fetch = vi.fn(async (): Promise<Response> => { throw new Error('offline'); });
  type Args = ConstructorParameters<typeof DikwWorkbenchService>;
  const service = new DikwWorkbenchService(
    docs as unknown as Args[0], { workspace } as unknown as Args[1],
    { server: { id: 'server', fetch } } as unknown as Args[2],
    { can } as unknown as Args[3], repository
  );
  return { service, workspace, engine, docs, can, fetch, repository, store, cards, release, releasePriority };
}

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, task: () => Promise<unknown>) => task() } });
});
afterEach(() => vi.unstubAllGlobals());

describe('workbench orchestration', () => {
  test('waits for root ready before reads or creation', async () => {
    const f = fixture();
    let resolve!: () => void;
    f.engine.doc.waitForDocLoaded.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    const task = f.service.ensureMainBoard();
    await Promise.resolve();
    expect(f.can).not.toHaveBeenCalled(); expect(f.docs.createDoc).not.toHaveBeenCalled();
    resolve(); expect(await task).toBe('main');
  });
  test('existing main works offline without POST or online permission request', async () => {
    const f = fixture();
    expect(await f.service.ensureMainBoard()).toBe('main');
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.can).not.toHaveBeenCalled();
    expect(f.engine.doc.waitForDocReady).not.toHaveBeenCalled();
  });
  test('cloud applies the same complete seed without createDoc and saves content first', async () => {
    const f = fixture(false);
    const seedRoot = new Y.Doc();
    new BoardRepository(seedRoot).registerMain('main', 'bootstrap');
    const pages = new Y.Array();
    seedRoot.getMap('meta').set('pages', pages);
    pages.push([new Y.Map([['id', 'main']])]);
    const content = new Y.Doc();
    const children = new Y.Array(); children.push(['surface']);
    content.getMap('blocks').set('page', new Y.Map<unknown>([['sys:id', 'page'], ['sys:flavour', 'affine:page'], ['sys:children', children]]));
    content.getMap('blocks').set('surface', new Y.Map([['sys:id', 'surface'], ['sys:flavour', 'affine:surface']]));
    const encode = (doc: Y.Doc) => btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    f.fetch.mockResolvedValue(new Response(JSON.stringify({
      version: 1, docId: 'main', rootUpdate: encode(seedRoot), contentUpdate: encode(content),
    })));
    f.engine.doc.storage.pushDocUpdate.mockImplementation(async () => {
      expect(f.repository.snapshot().size).toBe(0);
    });
    const a = f.service.ensureMainBoard(); const b = f.service.ensureMainBoard();
    expect(a).toBe(b); expect(await a).toBe('main');
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.docs.createDoc).not.toHaveBeenCalled();
    expect(f.workspace.docCollection.getDoc().spaceDoc.getMap('blocks').size).toBe(2);
    expect(f.repository.snapshot().get('main')?.parentId).toBe(null);
    expect(f.engine.doc.storage.pushDocUpdate).toHaveBeenCalledTimes(1);
  });
  test('first local bootstrap explicitly fails without creating', async () => {
    const f = fixture(false); f.workspace.flavour = 'local';
    await expect(f.service.ensureMainBoard()).rejects.toThrow('本地主白板初始化暂不可用');
    expect(f.docs.createDoc).not.toHaveBeenCalled();
  });
  test('shared mode never writes', async () => {
    const f = fixture(); f.workspace.openOptions.isSharedMode = true;
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toThrow('分享模式');
    await expect(f.service.addReference('main', 'target')).rejects.toThrow('分享模式');
    expect(f.docs.createDoc).not.toHaveBeenCalled(); expect(f.store.addBlock).not.toHaveBeenCalled();
  });
  test.each([false, undefined])('only strict true permits a write: %s', async permission => {
    const f = fixture(); f.can.mockResolvedValue(permission);
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toThrow();
    expect(f.docs.createDoc).not.toHaveBeenCalled();
  });
  test('creates random-ID native edgeless child once per operation and a real surface card', async () => {
    const f = fixture();
    const a = f.service.createChild('main', 'Child', 'op');
    const b = f.service.createChild('main', 'Child', 'op');
    expect(a).toBe(b); expect(await a).toBe('child');
    expect(await f.service.createChild('main', 'Child', 'op')).toBe('child');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(f.docs.createDoc).toHaveBeenCalledWith({ id: 'child', title: 'Child', primaryMode: 'edgeless' });
    expect(f.store.addBlock).toHaveBeenCalledTimes(1);
    expect(f.store.addBlock).toHaveBeenCalledWith('affine:embed-linked-doc', {
      pageId: 'child', xywh: '[0,0,364,390]', style: 'vertical',
    }, 'surface');
    expect(f.service.getPath('child').ids).toEqual(['main', 'child']);
    expect(f.service.relations$.value.has('child')).toBe(true);
  });
  test('same operation cannot change title after completion', async () => {
    const f = fixture();
    await f.service.createChild('main', 'Child', 'op');
    await expect(f.service.createChild('main', 'Different', 'op')).rejects.toThrow('不能改变');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
  });
  test('card failure preserves child and retries without reinitialization', async () => {
    const f = fixture(); f.store.addBlock.mockImplementationOnce(() => { throw new Error('card failed'); });
    const error = await f.service.createChild('main', 'Child', 'op').catch(e => e);
    expect(error).toBeInstanceOf(DikwChildCreationError);
    expect(error.docId).toBe('child'); expect(error.operationId).toBe('op');
    expect(f.repository.path('child').ids).toEqual(['main', 'child']);
    expect(await f.service.createChild('main', 'Child', 'op')).toBe('child');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalled(); expect(f.releasePriority).toHaveBeenCalled();
  });
  test('browser journal prevents second creation from a stale tab root', async () => {
    const a = fixture(); await a.service.createChild('main', 'Child', 'op');
    const staleTab = fixture();
    expect(await staleTab.service.createChild('main', 'Child', 'op')).toBe('child');
    expect(staleTab.docs.createDoc).not.toHaveBeenCalled();
  });
  test('missing browser locks and malformed operations cannot create', async () => {
    const f = fixture();
    vi.stubGlobal('navigator', {});
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toThrow('不支持');
    expect(f.docs.createDoc).not.toHaveBeenCalled();
  });
  test('corrupt synchronized operation record cannot create a second doc', async () => {
    const f = fixture();
    f.workspace.rootYDoc.getMap('dikw:child-operations:v1').set('op', { docId: 1 });
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toThrow('记录损坏');
    expect(f.docs.createDoc).not.toHaveBeenCalled();
  });
  test('ambiguous create failure keeps reservation and cannot create twice', async () => {
    const f = fixture(); f.docs.createDoc.mockImplementation(() => { throw new Error('middleware failed'); });
    const first = await f.service.createChild('main', 'Child', 'op').catch(e => e);
    expect(first).toBeInstanceOf(DikwChildCreationError); expect(first.docId).toBe('child');
    const retry = await f.service.createChild('main', 'Child', 'op').catch(e => e);
    expect(retry).toBeInstanceOf(DikwChildCreationError);
    expect(retry.cause.message).toContain('待恢复');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
  });
  test('reference requires source edit and target read but never changes relations', async () => {
    const f = fixture();
    await f.service.addReference('main', 'target');
    expect(f.can).toHaveBeenCalledWith('Doc_Update', 'main');
    expect(f.can).toHaveBeenCalledWith('Doc_Read', 'target');
    expect(f.repository.snapshot().size).toBe(1);
    f.can.mockImplementation(async action => action !== 'Doc_Read');
    await expect(f.service.addReference('main', 'denied')).rejects.toThrow();
    expect(f.store.addBlock).toHaveBeenCalledTimes(1);
  });
  test('readonly native store cannot receive a card', () => {
    const { store } = cardStore(); store.readonly = true;
    expect(() => insertLinkedCard(store as unknown as Store, 'target')).toThrow('只读');
    expect(store.addBlock).not.toHaveBeenCalled();
  });
});
