import type { Store } from '@blocksuite/affine/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { BoardRepository } from './board-repository';
import { DikwChildCreationError, DikwWorkbenchService, insertChildBoardPortal, insertLinkedCard } from './service';

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

type TestBound = { x: number; y: number; w: number; h: number };
type TestModel = {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  elementBound?: TestBound;
  externalBound?: TestBound | null;
};

function cardStore() {
  const surface = {
    id: 'surface', children: [] as { id: string }[],
    elementModels: [] as TestModel[],
  };
  const cards: { model: TestModel }[] = [];
  const blocks: TestModel[] = [];
  const store = {
    readonly: false,
    getAllModels: vi.fn(() => [...blocks, ...cards.map(card => card.model)]),
    getBlocksByFlavour: vi.fn((flavour: string | string[]) => {
      if (flavour === 'affine:surface') return [{ model: surface }];
      const flavours = Array.isArray(flavour) ? flavour : [flavour];
      return cards.filter(card => flavours.includes(card.model.flavour));
    }),
    addBlock: vi.fn((flavour: string, props: Record<string, unknown>, _parent?: string) => {
      const id = 'card-' + cards.length;
      const [x, y, w, h] = JSON.parse(props.xywh as string) as number[];
      cards.push({ model: { id, flavour, props, elementBound: { x, y, w, h } } });
      surface.children.push({ id });
      return id;
    }),
  };
  return { store, cards, surface, blocks };
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
  test('local bootstrap with incomplete root fails without native create', async () => {
    const f = fixture(false); f.workspace.flavour = 'local';
    await expect(f.service.ensureMainBoard()).rejects.toThrow();
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
  test('creates random-ID native edgeless child once per operation and a synced surface portal', async () => {
    const f = fixture();
    const a = f.service.createChild('main', 'Child', 'op');
    const b = f.service.createChild('main', 'Child', 'op');
    expect(a).toBe(b); expect(await a).toBe('child');
    expect(await f.service.createChild('main', 'Child', 'op')).toBe('child');
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(f.docs.createDoc).toHaveBeenCalledWith({ id: 'child', title: 'Child', primaryMode: 'edgeless' });
    expect(f.store.addBlock).toHaveBeenCalledTimes(1);
    expect(f.store.addBlock).toHaveBeenCalledWith('affine:embed-synced-doc', {
      pageId: 'child', xywh: '[0,0,800,455]', style: 'syncedDoc', params: { mode: 'edgeless' },
    }, 'surface');
    expect(f.service.getPath('child').ids).toEqual(['main', 'child']);
    expect(f.service.relations$.value.has('child')).toBe(true);
  });
  test('child content save completes before created journal, graph or parent card', async () => {
    const f = fixture();
    let finish!: () => void;
    let started!: () => void;
    const reached = new Promise<void>(resolve => { started = resolve; });
    const saved = new Promise<void>(resolve => { finish = resolve; });
    f.engine.doc.waitForUpdated.mockImplementation(async id => {
      if (id === 'child') { started(); await saved; }
    });
    let complete = false;
    const task = f.service.createChild('main', 'Child', 'op').then(id => { complete = true; return id; });
    await reached;
    expect(complete).toBe(false);
    expect(f.repository.snapshot().has('child')).toBe(false);
    expect(f.store.addBlock).not.toHaveBeenCalled();
    expect(f.workspace.rootYDoc.getMap('dikw:child-operations:v1').get('op')).toMatchObject({state:'reserved'});
    finish();
    expect(await task).toBe('child');
  });
  test('created retry with missing native document fails recoverably without waiting or recreating', async () => {
    const f = fixture();
    await f.service.createChild('main', 'Child', 'op');
    f.workspace.docCollection.getDoc.mockReturnValue(null as never);
    f.engine.doc.waitForDocLoaded.mockClear();
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toBeInstanceOf(DikwChildCreationError);
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(f.engine.doc.waitForDocLoaded).not.toHaveBeenCalledWith('child');
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
  test('ordinary references stay linked even after a child portal exists for the same target', async () => {
    const f = fixture();
    await f.service.createChild('main', 'Child', 'op');
    const relation = f.repository.snapshot().get('child');
    const portal = structuredClone(f.cards[0].model.props);
    await f.service.addReference('main', 'child');
    await f.service.addReference('main', 'child');
    expect(f.cards.map(card => card.model.flavour)).toEqual([
      'affine:embed-synced-doc', 'affine:embed-linked-doc',
    ]);
    expect(f.cards[0].model.props).toEqual(portal);
    expect(f.cards[1].model.props).toEqual({
      pageId: 'child', xywh: '[40,40,364,390]', style: 'vertical',
    });
    expect(f.repository.snapshot().get('child')).toEqual(relation);
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
  });
  test.each(['affine:embed-linked-doc', 'affine:embed-synced-doc'])(
    'created operation reuses stored %s without converting or moving it', async flavour => {
      const f = fixture();
      f.repository.registerChild('child', 'main', 'op');
      f.workspace.rootYDoc.getMap('dikw:child-operations:v1').set('op', {
        parentId: 'main', title: 'Child', docId: 'child', state: 'created',
      });
      const props = { pageId: 'child', xywh: '[900,-200,400,300]', style: flavour === 'affine:embed-synced-doc' ? 'syncedDoc' : 'vertical', caption: 'Keep me', params: { mode: 'page' } };
      f.store.addBlock(flavour, structuredClone(props), 'surface');
      f.store.addBlock.mockClear();
      expect(await f.service.createChild('main', 'Child', 'op')).toBe('child');
      expect(f.store.addBlock).not.toHaveBeenCalled();
      expect(f.cards[0].model.props).toEqual(props);
      expect(f.cards[0].model.flavour).toBe(flavour);
      expect(f.docs.createDoc).not.toHaveBeenCalled();
      expect(f.engine.doc.waitForUpdated).toHaveBeenCalledWith('main');
    }
  );
  test('portal completion waits for the parent save and retries a failed save without duplicating', async () => {
    const f = fixture();
    f.engine.doc.waitForUpdated.mockImplementation(async id => {
      if (id === 'main') throw new Error('parent save failed');
    });
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toBeInstanceOf(DikwChildCreationError);
    expect(f.cards).toHaveLength(1);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.releasePriority).toHaveBeenCalledTimes(1);
    let finish!: () => void;
    let started!: () => void;
    const reached = new Promise<void>(resolve => { started = resolve; });
    const saved = new Promise<void>(resolve => { finish = resolve; });
    f.engine.doc.waitForUpdated.mockImplementation(async id => {
      if (id === 'main') { started(); await saved; }
    });
    let complete = false;
    const task = f.service.createChild('main', 'Child', 'op').then(() => { complete = true; });
    await reached;
    expect(complete).toBe(false);
    expect(f.cards).toHaveLength(1);
    finish(); await task;
    expect(f.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(f.store.addBlock).toHaveBeenCalledTimes(1);
  });
  test('child portal checks target read again after parent load and preserves partial child', async () => {
    const f = fixture();
    let reads = 0;
    f.can.mockImplementation(async action => action !== 'Doc_Read' || ++reads === 1);
    await expect(f.service.createChild('main', 'Child', 'op')).rejects.toBeInstanceOf(DikwChildCreationError);
    expect(reads).toBe(2);
    expect(f.store.addBlock).not.toHaveBeenCalled();
    expect(f.repository.path('child').ids).toEqual(['main', 'child']);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.releasePriority).toHaveBeenCalledTimes(1);
  });
  test('places portals beside root notes, native rotated bounds and surface primitives without moving content', () => {
    const { store, cards, surface, blocks } = cardStore();
    // Root note is intentionally NOT a surface child. Its native bound is used,
    // not an assumed child count or an unrotated/stale xywh string.
    blocks.push({
      id: 'note', flavour: 'affine:note', props: { xywh: '[0,0,10,10]' },
      elementBound: { x: -100, y: -200, w: 1500, h: 600 },
    });
    surface.elementModels.push({
      id: 'shape', flavour: 'shape', props: { xywh: '[0,0,10,10]' },
      elementBound: { x: 1300, y: 50, w: 900, h: 800 },
      externalBound: { x: 2000, y: -250, w: 400, h: 40 },
    });
    store.addBlock('affine:embed-linked-doc', { pageId: 'other', xywh: '[100,-50,364,390]', style: 'vertical' }, 'surface');
    const oldContent = structuredClone({ blocks, elements: surface.elementModels, card: cards[0] });
    insertChildBoardPortal(store as unknown as Store, 'child');
    expect(cards[1].model.props.xywh).toBe('[2464,-250,800,455]');
    insertChildBoardPortal(store as unknown as Store, 'another-child');
    expect(cards[2].model.props.xywh).toBe('[3328,-250,800,455]');
    expect({ blocks, elements: surface.elementModels, card: cards[0] }).toEqual(oldContent);
  });
  test('negative-coordinate note alone determines placement rather than the origin', () => {
    const { store, cards, blocks } = cardStore();
    blocks.push({
      id: 'note', flavour: 'affine:note', props: {},
      elementBound: { x: -1200, y: -300, w: 500, h: 100 },
    });
    insertChildBoardPortal(store as unknown as Store, 'child');
    expect(cards[0].model.props.xywh).toBe('[-636,-300,800,455]');
  });
  test.each(['affine:embed-linked-doc', 'affine:embed-synced-doc'])(
    'a %s inside a note is not mistaken for the parent surface entry', flavour => {
      const { store, cards, surface } = cardStore();
      store.addBlock(flavour, { pageId: 'child', xywh: '[0,0,400,300]' }, 'note');
      surface.children.length = 0; // Model the actual note parent instead of the fixture default.
      insertChildBoardPortal(store as unknown as Store, 'child');
      expect(cards).toHaveLength(2);
      expect(cards[1].model.flavour).toBe('affine:embed-synced-doc');
      expect(surface.children).toEqual([{ id: cards[1].model.id }]);
    }
  );
  test('invalid native geometry fails closed without adding a portal', () => {
    const { store, blocks } = cardStore();
    blocks.push({
      id: 'note', flavour: 'affine:note', props: {},
      elementBound: { x: NaN, y: 0, w: 100, h: 100 },
    });
    expect(() => insertChildBoardPortal(store as unknown as Store, 'child')).toThrow('坐标无效');
    expect(store.addBlock).not.toHaveBeenCalled();
  });
  test('missing native surface fails closed without adding a portal', () => {
    const { store } = cardStore();
    store.getBlocksByFlavour.mockReturnValue([]);
    expect(() => insertChildBoardPortal(store as unknown as Store, 'child')).toThrow('尚未就绪');
    expect(store.addBlock).not.toHaveBeenCalled();
  });
  test('readonly native store cannot receive a card', () => {
    const { store } = cardStore(); store.readonly = true;
    expect(() => insertLinkedCard(store as unknown as Store, 'target')).toThrow('只读');
    expect(() => insertChildBoardPortal(store as unknown as Store, 'target')).toThrow('只读');
    expect(store.addBlock).not.toHaveBeenCalled();
  });
});
