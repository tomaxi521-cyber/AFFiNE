import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createSpaceDemo, type SpaceDemoDependencies } from './space-demo';

// Orchestration tests only: no real workspace, browser storage or native runtime.
vi.mock('@blocksuite/affine/model', () => ({
  NoteDisplayMode: { EdgelessOnly: 'edgeless' },
}));
vi.mock('@blocksuite/affine/store', () => ({
  Text: class {
    constructor(private readonly value: string) {}
    toString() { return this.value; }
  },
}));
const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock('nanoid', () => ({ nanoid: () => 'operation-' + ++ids.next }));

const JOURNAL_KEY = 'dikw:space-demo:v1:' + JSON.stringify(['local', '', 'ws']);
type Journal = {
  version: number;
  mainId?: string;
  layers: { operationId: string; docId?: string; notesSaved: boolean }[];
  complete: boolean;
};
type Block = {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  parent?: string;
};

function nativeStore(docId: string) {
  const root: Block = { id: docId + '-root', flavour: 'affine:page', props: {} };
  const surface: Block = { id: docId + '-surface', flavour: 'affine:surface', props: {}, parent: root.id };
  const blocks = new Map<string, Block>([[root.id, root], [surface.id, surface]]);
  return {
    blocks,
    readonly: false,
    root: root as Block | null,
    getBlocksByFlavour: vi.fn((flavour: string) =>
      [...blocks.values()].filter(block => block.flavour === flavour).map(model => ({ model }))),
    getBlock: vi.fn((id: string) => {
      const model = blocks.get(id);
      return model ? { model } : undefined;
    }),
    getParent: vi.fn((block: Block) => blocks.get(block.parent ?? '') ?? null),
    addBlock: vi.fn((flavour: string, props: Record<string, unknown>, parent: string) => {
      if (typeof props.id !== 'string' || blocks.has(props.id)) {
        throw new Error('Missing or duplicate deterministic block ID');
      }
      if (!blocks.has(parent)) throw new Error('Missing native parent');
      blocks.set(props.id, { id: props.id, flavour, props, parent });
      return props.id;
    }),
  };
}

function fixture() {
  const events: string[] = [];
  const stores = new Map<string, ReturnType<typeof nativeStore>>();
  const relations = new Map<string, { parentId: string; operationId: string }>();
  const records = new Set(['main']);
  const release = vi.fn();
  const releasePriority = vi.fn();
  const waitForSyncReady = vi.fn(async () => {});
  const docs = {
    list: { doc$: vi.fn((id: string) => ({
      value: records.has(id) ? { trash$: { value: false } } : undefined,
    })) },
    open: vi.fn((id: string) => {
      const blockSuiteDoc = stores.get(id);
      if (!blockSuiteDoc) throw new Error('Only new demo layers may be opened');
      return { doc: {
        blockSuiteDoc, waitForSyncReady,
        addPriorityLoad: vi.fn(() => releasePriority),
      }, release };
    }),
  };
  const service = {
    relations$: { value: relations },
    ensureMainBoard: vi.fn(async () => {
      const persisted = JSON.parse(localStorage.getItem(JOURNAL_KEY)!) as Journal;
      expect(persisted.layers.map(layer => layer.operationId)).toEqual([
        'operation-1', 'operation-2', 'operation-3',
      ]);
      events.push('main');
      return 'main';
    }),
    createChild: vi.fn(async (parentId: string, title: string, operationId: string) => {
      const id = 'doc-' + operationId;
      events.push('child:' + title);
      if (!stores.has(id)) stores.set(id, nativeStore(id));
      records.add(id);
      relations.set(id, { parentId, operationId });
      return id;
    }),
  };
  const can = vi.fn(async (_action: string, _id?: string): Promise<boolean | undefined> => true);
  const engine = { doc: {
    waitForDocReady: vi.fn(async (_id: string) => { events.push('root-ready'); }),
    waitForUpdated: vi.fn(async (id: string) => { events.push('saved:' + id); }),
  } };
  const workspace = { id: 'ws', flavour: 'local', openOptions: { isSharedMode: false }, engine };
  const deps = { service, docs, guard: { can }, workspace, serverId: '' } as unknown as SpaceDemoDependencies;
  const journal = () => JSON.parse(localStorage.getItem(JOURNAL_KEY)!) as Journal;
  return { deps, service, docs, can, workspace, stores, records, engine, events,
    release, releasePriority, waitForSyncReady, journal };
}

let storage: Map<string, string>;
beforeEach(() => {
  ids.next = 0;
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
  // Serialize tasks like browser Web Locks, including recovery after rejection.
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', { locks: {
    request: vi.fn((key: string, task: () => Promise<unknown>) => {
      const result = (tails.get(key) ?? Promise.resolve()).then(task);
      tails.set(key, result.catch(() => {}));
      return result;
    }),
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe('explicit spatial demo orchestration', () => {
  test('persists all IDs first and creates only the three native layers with save barriers', async () => {
    const f = fixture();
    await expect(createSpaceDemo(f.deps)).resolves.toBe('doc-operation-1');
    expect(f.service.createChild.mock.calls).toEqual([
      ['main', '空间体验样板', 'operation-1'],
      ['doc-operation-1', '产品研究', 'operation-2'],
      ['doc-operation-2', '访谈分析', 'operation-3'],
    ]);
    expect(f.docs.open.mock.calls).toEqual([
      ['doc-operation-1'], ['doc-operation-2'], ['doc-operation-3'],
    ]);
    for (const [docId, store] of f.stores) {
      expect(store.addBlock).toHaveBeenCalledTimes(4);
      const note = [...store.blocks.values()].find(block => block.flavour === 'affine:note')!;
      expect(note.id).toBe('dikw-space-demo-v1-' + docId.slice(4) + '-note');
      expect(note.parent).toBe(store.root!.id);
      const paragraphs = [...store.blocks.values()].filter(block => block.flavour === 'affine:paragraph');
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs.every(block => block.parent === note.id)).toBe(true);
      expect(String(paragraphs[0].props.text)).toContain('合成示例');
    }
    expect(f.events[0]).toBe('root-ready');
    expect(f.events.indexOf('saved:doc-operation-1')).toBeLessThan(f.events.indexOf('child:产品研究'));
    expect(f.events.at(-1)).toBe('saved:ws');
    expect(f.journal().complete).toBe(true);
    expect(f.release).toHaveBeenCalledTimes(3);
    expect(f.releasePriority).toHaveBeenCalledTimes(3);
  });

  test('completed retries and concurrent clicks create no extra child or native fixture', async () => {
    const f = fixture();
    await Promise.all([createSpaceDemo(f.deps), createSpaceDemo(f.deps)]);
    const sample = f.stores.get('doc-operation-1')!;
    const paragraph = [...sample.blocks.values()].find(block => block.flavour === 'affine:paragraph')!;
    paragraph.props.text = 'user edited text';
    const note = [...sample.blocks.values()].find(block => block.flavour === 'affine:note')!;
    sample.blocks.delete(note.id);
    const savedJournal = localStorage.getItem(JOURNAL_KEY);
    await expect(createSpaceDemo(f.deps)).resolves.toBe('doc-operation-1');
    expect(localStorage.getItem(JOURNAL_KEY)).toBe(savedJournal);
    expect(f.service.ensureMainBoard).toHaveBeenCalledTimes(1);
    expect(f.service.createChild).toHaveBeenCalledTimes(3);
    expect(f.docs.open).toHaveBeenCalledTimes(3);
    expect(sample.addBlock).toHaveBeenCalledTimes(4);
    expect(sample.blocks.has(note.id)).toBe(false);
    expect(paragraph.props.text).toBe('user edited text');
  });

  test('failed content save retains all operation IDs and reuses existing fixture identities', async () => {
    const f = fixture();
    f.engine.doc.waitForUpdated.mockRejectedValueOnce(new Error('save failed'));
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('save failed');
    const before = f.journal();
    expect(before.complete).toBe(false);
    expect(before.layers[0]).toEqual({ operationId: 'operation-1', docId: 'doc-operation-1', notesSaved: false });
    const sample = f.stores.get('doc-operation-1')!;
    const blockIds = [...sample.blocks.keys()];
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.releasePriority).toHaveBeenCalledTimes(1);
    await expect(createSpaceDemo(f.deps)).resolves.toBe('doc-operation-1');
    expect(f.journal().layers.map(layer => layer.operationId)).toEqual(before.layers.map(layer => layer.operationId));
    expect([...sample.blocks.keys()]).toEqual(blockIds);
    expect(sample.addBlock).toHaveBeenCalledTimes(4);
    expect(f.service.createChild).toHaveBeenCalledTimes(3);
    expect(f.release).toHaveBeenCalledTimes(4);
    expect(f.releasePriority).toHaveBeenCalledTimes(4);
  });

  test('reserved child failure propagates and retries only the same operation', async () => {
    const f = fixture();
    f.service.createChild.mockRejectedValue(new Error('reserved; recovery required'));
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('reserved');
    const journal = localStorage.getItem(JOURNAL_KEY);
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('reserved');
    expect(localStorage.getItem(JOURNAL_KEY)).toBe(journal);
    expect(f.service.createChild.mock.calls).toEqual([
      ['main', '空间体验样板', 'operation-1'], ['main', '空间体验样板', 'operation-1'],
    ]);
    expect(f.docs.open).not.toHaveBeenCalled();
    expect(f.stores.size).toBe(0);
  });

  test.each([false, undefined])('fails closed when create permission is %s', async permission => {
    const f = fixture();
    f.can.mockResolvedValue(permission);
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('创建白板权限');
    expect(f.service.ensureMainBoard).not.toHaveBeenCalled();
    expect(f.service.createChild).not.toHaveBeenCalled();
    expect(f.docs.open).not.toHaveBeenCalled();
    expect(f.journal().layers.every(layer => !layer.docId)).toBe(true);
  });

  test.each(['Doc_Read', 'Doc_Update'])('denied main %s permission prevents all child/content writes', async denied => {
    const f = fixture();
    f.can.mockImplementation(async action => action !== denied);
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('权限');
    expect(f.service.createChild).not.toHaveBeenCalled();
    expect(f.docs.open).not.toHaveBeenCalled();
  });

  test('permission revoked during native sync prevents fixture changes and releases handles', async () => {
    const f = fixture();
    f.waitForSyncReady.mockImplementation(async () => {
      f.can.mockImplementation(async action => action !== 'Doc_Update');
    });
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('权限');
    expect(f.stores.get('doc-operation-1')!.addBlock).not.toHaveBeenCalled();
    expect(f.service.createChild).toHaveBeenCalledTimes(1);
    expect(f.journal().layers[0].notesSaved).toBe(false);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.releasePriority).toHaveBeenCalledTimes(1);
  });

  test.each(['readonly', 'missing-root'])('native %s stops writes without initialization', async state => {
    const f = fixture();
    f.waitForSyncReady.mockImplementation(async () => {
      const store = f.stores.get('doc-operation-1')!;
      if (state === 'readonly') store.readonly = true;
      else store.root = null;
    });
    await expect(createSpaceDemo(f.deps)).rejects.toThrow();
    expect(f.stores.get('doc-operation-1')!.addBlock).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.releasePriority).toHaveBeenCalledTimes(1);
  });

  test.each(['{', 'null', '{"version":1,"layers":[],"complete":false}'])('corrupt journal %s is never replaced', async raw => {
    const f = fixture();
    localStorage.setItem(JOURNAL_KEY, raw);
    await expect(createSpaceDemo(f.deps)).rejects.toThrow();
    expect(localStorage.getItem(JOURNAL_KEY)).toBe(raw);
    expect(f.service.ensureMainBoard).not.toHaveBeenCalled();
    expect(f.service.createChild).not.toHaveBeenCalled();
    expect(f.docs.open).not.toHaveBeenCalled();
    expect(ids.next).toBe(0);
  });

  test('shared mode and unavailable browser locks cannot create or journal', async () => {
    const f = fixture();
    f.workspace.openOptions.isSharedMode = true;
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('分享模式');
    f.workspace.openOptions.isSharedMode = false;
    vi.stubGlobal('navigator', {});
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('不支持安全创建');
    expect(storage.size).toBe(0);
    expect(f.service.ensureMainBoard).not.toHaveBeenCalled();
  });

  test('unavailable durable storage stops before main or child creation', async () => {
    const f = fixture();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    });
    await expect(createSpaceDemo(f.deps)).rejects.toThrow('quota');
    expect(f.service.ensureMainBoard).not.toHaveBeenCalled();
    expect(f.service.createChild).not.toHaveBeenCalled();
  });
});
