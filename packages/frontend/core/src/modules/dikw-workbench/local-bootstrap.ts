import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { BoardRepository, BOARD_GRAPH_MAP } from './board-repository';
import { decodeMainBoardSeed, type DecodedMainBoardSeed, type MainBoardSeed } from './bootstrap';

const DATABASE = 'dikw-main-board-seeds-v1';
const STORE = 'seeds';

export interface LocalSeedRecord {
  version: 1;
  instance: string;
  seed: MainBoardSeed;
}

export interface LocalSeedStorage {
  get(key: string): Promise<unknown>;
  /** Must commit atomically, and MUST NOT overwrite an existing record. */
  add(key: string, record: LocalSeedRecord): Promise<void>;
  close(): void;
}

export interface LocalBootstrapOptions {
  workspaceId: string;
  flavour: string;
  rootDoc: Y.Doc;
  /** Must resolve only after the local storage root has been loaded. */
  waitForRootLoaded(): Promise<void>;
  /** Caller must reject sharedMode and require Guard === true; checked inside lock. */
  assertWritable(): Promise<void>;
}

export type LocalBootstrapResult = { docId: string; seed?: DecodedMainBoardSeed };

/** Stable Yjs identity of the nested pages container, not a mutable state vector.
 * Existing metadata has no independent instance ID. A same-ID import replacing
 * pages is therefore a conflict, never permission to replay an old workspace. */
export function localRootInstance(root: Y.Doc): string {
  const pages = root.getMap('meta').get('pages');
  if (!(pages instanceof Y.Array) || root.store.pendingStructs || root.store.pendingDs) {
    throw new Error('本地工作区元数据尚未完整载入');
  }
  const identity = Y.createRelativePositionFromTypeIndex(pages, 0).type;
  if (!identity) throw new Error('无法确认本地工作区实例');
  return identity.client + ':' + identity.clock;
}

function mainId(root: Y.Doc): string | undefined {
  const repository = new BoardRepository(root);
  const relations = repository.snapshot();
  // Do not interpret damaged graph metadata as an empty workspace.
  for (const key of root.getMap(BOARD_GRAPH_MAP).keys()) {
    if (key.startsWith('board:') && !relations.has(key.slice(6))) {
      throw new Error('白板关系损坏，需要修复');
    }
  }
  const roots = [...relations.values()].filter(record => record.parentId === null);
  if (roots.length > 1 || (relations.size > 0 && roots.length === 0)) {
    throw new Error('主白板关系冲突，需要修复');
  }
  return roots[0]?.docId;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** No live DocsService, no live callbacks, and no engine connections. Native
 * initialization runs exactly once on an isolated document before persistence. */
export async function createLocalMainBoardSeed(rootUpdate: Uint8Array, workspaceId: string): Promise<MainBoardSeed> {
  const [{ WorkspaceImpl }, { initDocFromProps }] = await Promise.all([
    import('../workspace/impls/workspace'),
    import('../../blocksuite/initialization'),
  ]);
  const root = new Y.Doc({ guid: workspaceId });
  const collection = new WorkspaceImpl({ id: workspaceId, rootDoc: root });
  try {
    Y.applyUpdate(root, rootUpdate);
    localRootInstance(root);
    if (mainId(root)) throw new Error('主白板已经存在');
    const docId = nanoid();
    const native = collection.createDoc(docId);
    const store = native.getStore({ id: docId });
    initDocFromProps(store, undefined, { title: '主白板', primaryMode: 'edgeless' });
    collection.meta.setDocMeta(docId, { title: '主白板' });
    new BoardRepository(root).registerMain(docId, 'bootstrap:local:' + workspaceId);
    const seed: MainBoardSeed = {
      version: 1, docId,
      rootUpdate: base64(Y.encodeStateAsUpdate(root)),
      contentUpdate: base64(Y.encodeStateAsUpdate(native.spaceDoc)),
    };
    decodeMainBoardSeed(seed);
    return seed;
  } finally {
    collection.dispose();
    root.destroy();
  }
}

export function openLocalSeedStorage(): Promise<LocalSeedStorage> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('本地主白板初始化暂不可用：IndexedDB不可用'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let abandoned = false;
    const fail = (error: unknown) => { abandoned = true; reject(error); };
    request.onblocked = () => fail(new Error('本地主白板初始化暂不可用：IndexedDB升级被阻塞'));
    request.onerror = () => fail(request.error ?? new Error('无法打开本地主白板存储'));
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve({
        get: key => new Promise((done, failed) => {
          const transaction = db.transaction(STORE, 'readonly');
          const read = transaction.objectStore(STORE).get(key);
          transaction.oncomplete = () => done(read.result);
          transaction.onabort = () => failed(transaction.error ?? new Error('读取主白板种子失败'));
          transaction.onerror = () => failed(transaction.error ?? new Error('读取主白板种子失败'));
        }),
        add: (key, record) => new Promise((done, failed) => {
          const transaction = db.transaction(STORE, 'readwrite', { durability: 'strict' });
          transaction.objectStore(STORE).add(record, key);
          // Resolve only after IDB commit, never on the individual request success.
          transaction.oncomplete = () => done();
          transaction.onabort = () => failed(transaction.error ?? new Error('保存主白板种子失败'));
          transaction.onerror = () => failed(transaction.error ?? new Error('保存主白板种子失败'));
        }),
        close: () => db.close(),
      });
    };
  });
}

/** Separated dependencies keep the coordinator testable without a real user DB.
 * Production entry below always uses Web Locks, IndexedDB and native generation. */
export async function prepareLocalMainBoardSeed(
  options: LocalBootstrapOptions,
  dependencies: {
    lock<T>(key: string, task: () => Promise<T>): Promise<T>;
    openStorage(): Promise<LocalSeedStorage>;
    createSeed(rootUpdate: Uint8Array, workspaceId: string): Promise<MainBoardSeed>;
  }
): Promise<LocalBootstrapResult> {
  if (options.flavour !== 'local' || !options.workspaceId) throw new Error('只能初始化本地工作区');
  const key = JSON.stringify([options.flavour, options.workspaceId]);
  return dependencies.lock('dikw:main-board:v1:' + key, async () => {
    await options.waitForRootLoaded();
    const instance = localRootInstance(options.rootDoc);
    const existing = mainId(options.rootDoc);
    // Existing boards require neither IDB availability nor write permissions.
    // This path never generates or replays anything.
    if (existing) return { docId: existing };
    await options.assertWritable();
    const storage = await dependencies.openStorage();
    try {
      const cached = await storage.get(key);
      if (localRootInstance(options.rootDoc) !== instance) throw new Error('本地工作区实例已改变');
      if (cached !== undefined) {
        if (!cached || typeof cached !== 'object' || !('version' in cached) || cached.version !== 1 ||
            !('instance' in cached) || cached.instance !== instance || !('seed' in cached)) {
          throw new Error('同名本地工作区实例冲突，不能重放主白板种子');
        }
        const decoded = decodeMainBoardSeed(cached.seed);
        const seedRoot = new Y.Doc();
        try {
          Y.applyUpdate(seedRoot, decoded.rootUpdate);
          if (localRootInstance(seedRoot) !== instance) throw new Error('主白板种子实例不匹配');
        } finally { seedRoot.destroy(); }
        const currentMain = mainId(options.rootDoc);
        if (currentMain && currentMain !== decoded.docId) throw new Error('主白板关系冲突，需要修复');
        await options.assertWritable();
        return { docId: decoded.docId, seed: decoded };
      }
      const currentMain = mainId(options.rootDoc);
      if (currentMain) return { docId: currentMain };
      const seed = await dependencies.createSeed(Y.encodeStateAsUpdate(options.rootDoc), options.workspaceId);
      const decoded = decodeMainBoardSeed(seed);
      await options.assertWritable();
      if (localRootInstance(options.rootDoc) !== instance || mainId(options.rootDoc)) {
        throw new Error('本地工作区状态已改变，请重试');
      }
      // The caller cannot apply the new root or content before this commit.
      await storage.add(key, { version: 1, instance, seed });
      return { docId: decoded.docId, seed: decoded };
    } finally { storage.close(); }
  });
}

/** Caller replays returned seed content-first via native storage, then root and
 * content. Every tab obtains identical Y structs, even with a stale live root. */
export async function ensureLocalMainBoardSeed(options: LocalBootstrapOptions): Promise<LocalBootstrapResult> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('本地主白板初始化暂不可用：Web Locks不可用');
  }
  return prepareLocalMainBoardSeed(options, {
    lock: (key, task) => navigator.locks.request(key, task),
    openStorage: openLocalSeedStorage,
    createSeed: createLocalMainBoardSeed,
  });
}
