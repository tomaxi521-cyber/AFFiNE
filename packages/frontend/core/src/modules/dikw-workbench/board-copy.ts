import { Transformer, type DocSnapshot, type Store } from '@blocksuite/affine/store';
import { nanoid } from 'nanoid';

import type { DocsService } from '../doc';
import type { GuardService } from '../permissions';
import type { WorkspaceService } from '../workspace';
import { getAFFiNEWorkspaceSchema } from '../workspace/global-schema';
import { getBoardPath, parseBoardRelation, type BoardRelation } from './board-graph';
import { BOARD_GRAPH_MAP, BoardRepository } from './board-repository';
import {
  assertCopySnapshotEqual, BOARD_COPY_LIMITS, canonicalSnapshot,
  inspectCopySnapshot, remapCopySnapshot, snapshotBlocks, type CopyIdentity,
} from './board-copy-snapshot';
import { insertChildBoardPortal, type BoardPlacement } from './service';

export interface CopyBoardDependencies {
  docs: DocsService;
  workspace: WorkspaceService['workspace'];
  guard: GuardService;
  serverId?: string;
}

type CopyNode = {
  sourceId: string;
  sourceParentId: string | null;
  docId: string;
  parentId: string;
  snapshot: DocSnapshot;
};
type CopyPlan = {
  version: 1;
  sourceId: string;
  parentId: string;
  operationId: string;
  placement?: BoardPlacement;
  nodes: CopyNode[];
};
type Phase = 'planned' | 'writing' | 'saved';
type Journal = { plan: CopyPlan; phases: Phase[]; complete: boolean };
const OPERATIONS = 'dikw:board-copy:v1';
const DATABASE = 'dikw-board-copy-v1';

export class DikwBoardCopyError extends Error {
  constructor(readonly docId: string, readonly operationId: string, cause: unknown) {
    super('白板复制未完全完成；保留已有内容，请使用原操作重试或恢复，不会删除或覆盖内容', { cause });
    this.name = 'DikwBoardCopyError';
  }
}

/** Fail closed on corrupt synchronized graph entries, instead of silently losing a child. */
export function collectOwnedBoardTree(
  sourceId: string, relations: ReadonlyMap<string, BoardRelation>
): BoardRelation[] {
  if (getBoardPath(sourceId, relations).problem) throw new Error('源白板归属关系不可用');
  const result: BoardRelation[] = [];
  const pending = [sourceId];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.shift()!;
    const relation = relations.get(id);
    if (!relation || seen.has(id)) throw new Error('白板归属子树损坏');
    seen.add(id);
    result.push(relation);
    if (result.length > BOARD_COPY_LIMITS.documents) throw new Error('一次最多复制 32 个所属白板');
    pending.push(...[...relations.values()].filter(r => r.parentId === id).map(r => r.docId).sort());
  }
  return result;
}

function strictGraph(deps: CopyBoardDependencies) {
  const graph = new Map<string, BoardRelation>();
  for (const [key, value] of deps.workspace.rootYDoc.getMap(BOARD_GRAPH_MAP)) {
    if (!key.startsWith('board:')) continue;
    const relation = parseBoardRelation(value);
    if (!relation || key !== 'board:' + relation.docId) throw new Error('白板归属记录损坏，需要恢复');
    graph.set(relation.docId, relation);
  }
  return graph;
}

function validatePlacement(p?: BoardPlacement) {
  if (p !== undefined && (!p || ![p.x, p.y, p.width, p.height].every(Number.isFinite) ||
      p.width < 160 || p.height < 100 || p.width > 10000 || p.height > 10000)) {
    throw new Error('白板放置区域无效');
  }
}

/** Completion is the transaction commit, not merely the request's success event. */
async function journalAccess(key: string, value?: Journal): Promise<Journal | undefined> {
  if (typeof indexedDB === 'undefined') throw new Error('当前环境不支持持久化复制恢复');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('operations');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('复制恢复数据库被阻塞'));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise<Journal | undefined>((resolve, reject) => {
      const tx = db.transaction('operations', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('operations');
      const request = value ? store.put(value, key) : store.get(key);
      let result: Journal | undefined;
      request.onsuccess = () => { if (!value) result = request.result as Journal | undefined; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('复制恢复记录保存失败'));
      tx.onerror = () => reject(tx.error ?? new Error('复制恢复记录保存失败'));
    });
  } finally { db.close(); }
}

function validateJournal(value: Journal, sourceId: string, parentId: string, operationId: string, placement?: BoardPlacement) {
  const p = value?.plan;
  if (!p || p.version !== 1 || p.sourceId !== sourceId || p.parentId !== parentId || p.operationId !== operationId ||
      canonicalSnapshot(p.placement) !== canonicalSnapshot(placement) || !Array.isArray(p.nodes) ||
      !p.nodes.length || p.nodes.length > BOARD_COPY_LIMITS.documents || !Array.isArray(value.phases) ||
      value.phases.length !== p.nodes.length || !value.phases.every(s => ['planned', 'writing', 'saved'].includes(s)) ||
      typeof value.complete !== 'boolean') throw new Error('复制操作记录损坏或操作参数发生变化');
  const docs = new Set<string>();
  const sources = new Set<string>();
  const ids = new Set<string>();
  let count = 0;
  for (const [index, node] of p.nodes.entries()) {
    if (!node.docId || docs.has(node.docId) || !node.sourceId || sources.has(node.sourceId) ||
        node.snapshot?.meta.id !== node.docId ||
        (index === 0 ? node.sourceId !== sourceId || node.parentId !== parentId : !docs.has(node.parentId))) {
      throw new Error('复制计划的文档归属或标识损坏');
    }
    docs.add(node.docId);
    sources.add(node.sourceId);
    for (const id of inspectCopySnapshot(node.snapshot).ids) {
      if (ids.has(id)) throw new Error('复制计划内容标识冲突');
      ids.add(id);
      count++;
    }
  }
  if ([...docs].some(id => sources.has(id)) || count > BOARD_COPY_LIMITS.objects ||
      new TextEncoder().encode(canonicalSnapshot(p)).byteLength > BOARD_COPY_LIMITS.bytes ||
      (value.complete && value.phases.some(s => s !== 'saved'))) throw new Error('复制计划超过限制或身份冲突');
}

function makeTransformer(deps: CopyBoardDependencies) {
  return new Transformer({
    schema: getAFFiNEWorkspaceSchema(),
    blobCRUD: deps.workspace.docCollection.blobSync,
    docCRUD: {
      create: () => { throw new Error('复制转换器不得隐式创建文档'); },
      get: id => deps.workspace.docCollection.getDoc(id)?.getStore({ id }) ?? null,
      delete: () => { throw new Error('复制转换器不得删除文档'); },
    },
    // No replaceId middleware: it randomizes unresolved references and misses element IDs.
  });
}

async function withDoc<T>(deps: CopyBoardDependencies, id: string, task: (store: Store) => Promise<T>, emptyShell = false): Promise<T> {
  const opened = deps.docs.open(id);
  let releasePriority: (() => void) | undefined;
  try {
    releasePriority = opened.doc.addPriorityLoad(100);
    await opened.doc.waitForSyncReady();
    // A fresh skipInit shell has no update yet: ready would deadlock before import.
    if (!emptyShell) await deps.workspace.engine.doc.waitForDocReady(id);
    return await task(opened.doc.blockSuiteDoc);
  } finally {
    releasePriority?.();
    opened.release();
  }
}

function available(deps: CopyBoardDependencies, id: string) {
  if (deps.docs.list.doc$(id).value?.trash$.value !== false) throw new Error('白板不存在或已在回收站：' + id);
}
async function authorize(deps: CopyBoardDependencies, parentId: string, sourceIds: string[]) {
  if (deps.workspace.openOptions.isSharedMode) throw new Error('分享模式不能复制白板');
  if (await deps.guard.can('Workspace_CreateDoc') !== true || await deps.guard.can('Doc_Update', parentId) !== true) {
    throw new Error('没有创建白板或编辑父白板权限');
  }
  available(deps, parentId);
  for (const id of sourceIds) {
    if (await deps.guard.can('Doc_Read', id) !== true) throw new Error('没有读取所属白板权限：' + id);
    available(deps, id);
  }
  if (deps.workspace.openOptions.isSharedMode) throw new Error('分享模式不能复制白板');
}

function exportExact(transformer: Transformer, store: Store): DocSnapshot {
  const snapshot = transformer.docToSnapshot(store);
  if (!snapshot) throw new Error('无法导出完整白板快照');
  const blocks = snapshotBlocks(snapshot.blocks);
  const ids = new Set(blocks.map(b => b.id));
  // Both raw CRDT and instantiated models: detect unsupported/orphan blocks filtered by export.
  const raw = store.spaceDoc.getMap('blocks');
  if (raw.size !== ids.size || [...raw.keys()].some(id => !ids.has(id)) ||
      store.getAllModels().length !== ids.size || store.getAllModels().some(m => !ids.has(m.id))) {
    throw new Error('快照未包含全部白板内容，拒绝有损复制');
  }
  inspectCopySnapshot(snapshot);
  return JSON.parse(canonicalSnapshot(snapshot)) as DocSnapshot;
}

async function freezePlan(deps: CopyBoardDependencies, sourceId: string, parentId: string, operationId: string, placement?: BoardPlacement): Promise<CopyPlan> {
  const graph = strictGraph(deps);
  if (getBoardPath(parentId, graph).problem) throw new Error('父白板归属关系不可用');
  const tree = collectOwnedBoardTree(sourceId, graph);
  await authorize(deps, parentId, tree.map(r => r.docId));
  // Check the destination has a usable native surface without creating anything.
  await withDoc(deps, parentId, async store => {
    if (store.readonly || !store.getBlocksByFlavour('affine:surface').length) throw new Error('父白板不可编辑或画布未就绪');
  });
  const snapshots = new Map<string, DocSnapshot>();
  const identities = new Map<string, CopyIdentity>();
  const transformer = makeTransformer(deps);
  try {
    let objects = 0;
    for (const relation of tree) {
      const snapshot = await withDoc(deps, relation.docId, async store => exportExact(transformer, store));
      const inventory = inspectCopySnapshot(snapshot);
      objects += inventory.ids.length;
      if (objects > BOARD_COPY_LIMITS.objects) throw new Error('一次最多复制 5000 个内容对象');
      for (const id of inventory.blobs) {
        if (!await deps.workspace.docCollection.blobSync.get(id)) throw new Error('媒体资源未就绪，无法复制');
      }
      // Validate every draft before mutation; native batch import otherwise filters
      // failed conversions silently. This does not create or update a document.
      for (const block of snapshotBlocks(snapshot.blocks)) {
        const draft = await transformer.snapshotToModelData(structuredClone(block));
        if (!draft || draft.id !== block.id || draft.flavour !== block.flavour) {
          throw new Error('白板内容无法无损转换：' + block.flavour);
        }
      }
      snapshots.set(relation.docId, snapshot);
      identities.set(relation.docId, { docId: nanoid(), ids: Object.fromEntries(inventory.ids.map(id => [id, nanoid()])) });
    }
    // Catch source edits and ownership changes while asynchronous preflight was running.
    for (const relation of tree) {
      await withDoc(deps, relation.docId, async store => {
        assertCopySnapshotEqual(snapshots.get(relation.docId)!, exportExact(transformer, store));
      });
    }
    if (canonicalSnapshot(tree) !== canonicalSnapshot(collectOwnedBoardTree(sourceId, strictGraph(deps)))) {
      throw new Error('源白板归属在预检期间发生变化，请重试');
    }
    return {
      version: 1, sourceId, parentId, operationId, ...(placement ? { placement: { ...placement } } : {}),
      nodes: tree.map((relation, index) => ({
        sourceId: relation.docId, sourceParentId: relation.parentId,
        docId: identities.get(relation.docId)!.docId,
        parentId: index === 0 ? parentId : identities.get(relation.parentId!)!.docId,
        snapshot: remapCopySnapshot(snapshots.get(relation.docId)!, identities),
      })),
    };
  } finally { transformer[Symbol.dispose](); }
}

/**
 * Copy owned descendants only. The durable local journal is intentionally retained.
 * A writing checkpoint with non-exact content requires recovery; NEVER reinitialize
 * or compensate by deleting documents. Web Locks cover tabs in this browser only.
 */
export async function copyBoardTree(
  deps: CopyBoardDependencies, sourceId: string, parentId: string, operationId: string, placement?: BoardPlacement
): Promise<string> {
  if (![sourceId, parentId, operationId].every(id => typeof id === 'string' && id.trim())) throw new Error('复制白板参数无效');
  validatePlacement(placement);
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('当前环境不支持安全的跨标签页复制');
  const key = JSON.stringify([deps.workspace.flavour, deps.serverId ?? '', deps.workspace.id, operationId]);
  return navigator.locks.request('dikw:board-copy:' + key, async () => {
    await deps.workspace.engine.doc.waitForDocReady(deps.workspace.id);
    const operations = deps.workspace.rootYDoc.getMap(OPERATIONS);
    let journal = await journalAccess(key);
    if (!journal) {
      if (operations.has(operationId)) throw new Error('此操作已在其他环境开始，缺少原始快照；请在原浏览器恢复');
      const plan = await freezePlan(deps, sourceId, parentId, operationId, placement);
      journal = { plan, phases: plan.nodes.map(() => 'planned'), complete: false };
      validateJournal(journal, sourceId, parentId, operationId, placement);
      // The immutable plan and every identity are durable BEFORE any native create.
      await journalAccess(key, journal);
    } else {
      try { validateJournal(journal, sourceId, parentId, operationId, placement); }
      catch (cause) {
        // Existing plans may already own native documents: keep the UI's retry identity.
        throw new DikwBoardCopyError(journal?.plan?.nodes?.[0]?.docId ?? '', operationId, cause);
      }
    }
    const { plan } = journal;
    const rootId = plan.nodes[0].docId;
    try {
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSnapshot(plan))))]
        .map(n => n.toString(16).padStart(2, '0')).join('');
      const marker = { version: 1, sourceId, parentId, operationId, docIds: plan.nodes.map(n => n.docId), digest };
      const previous = operations.get(operationId);
      if (previous !== undefined && canonicalSnapshot(previous) !== canonicalSnapshot(marker)) throw new Error('同步复制操作身份冲突');
      await authorize(deps, parentId, plan.nodes.map(n => n.sourceId));
      if (getBoardPath(parentId, strictGraph(deps)).problem) throw new Error('父白板归属关系不可用');
      if (!previous) {
        operations.set(operationId, marker);
        await deps.workspace.engine.doc.waitForUpdated(deps.workspace.id);
      }
      if (journal.complete) return rootId;
      const transformer = makeTransformer(deps);
      try {
        for (const [index, node] of plan.nodes.entries()) {
          if (journal.phases[index] === 'saved') { available(deps, node.docId); continue; }
          const fresh = journal.phases[index] === 'planned';
          if (fresh) {
            if (deps.workspace.docCollection.getDoc(node.docId) || deps.docs.list.doc$(node.docId).value) throw new Error('预分配文档标识已存在');
            await authorize(deps, parentId, plan.nodes.map(n => n.sourceId));
            journal.phases[index] = 'writing';
            await journalAccess(key, journal);
            const created = deps.docs.createDoc({ id: node.docId, skipInit: true, primaryMode: 'edgeless' });
            if (created.id !== node.docId) throw new Error('创建中间件改变了复制文档标识');
          }
          available(deps, node.docId);
          await withDoc(deps, node.docId, async store => {
            if (store.readonly) throw new Error('复制目标不可编辑');
            if (fresh) {
              if (store.spaceDoc.getMap('blocks').size || store.root || store.getAllModels().length) throw new Error('新文档已有内容，拒绝覆盖');
              await transformer.snapshotToBlock(structuredClone(node.snapshot.blocks), store);
              // Transformer may swallow/filter failures and still return a model.
              assertCopySnapshotEqual(node.snapshot, exportExact(transformer, store));
              deps.docs.list.doc$(node.docId).value!.setMeta({ title: node.snapshot.meta.title });
              // Native initialization is a baseline, never a user undo step.
              // Do not clear history on recovery or previously saved copies.
              store.history.undoManager.clear();
            } else {
              // A crash after insertion but before checkpoint is safe ONLY on exact match.
              assertCopySnapshotEqual(node.snapshot, exportExact(transformer, store));
              if (store.meta?.title !== node.snapshot.meta.title) throw new Error('复制标题尚未完整保存，需要恢复');
            }
            await deps.workspace.engine.doc.waitForUpdated(node.docId);
            await deps.workspace.engine.doc.waitForUpdated(deps.workspace.id);
            assertCopySnapshotEqual(node.snapshot, exportExact(transformer, store));
          }, true);
          journal.phases[index] = 'saved';
          await journalAccess(key, journal);
        }
      } finally { transformer[Symbol.dispose](); }
      // All bodies are saved before ANY ownership edge, then publish parent-first.
      await authorize(deps, parentId, plan.nodes.map(n => n.sourceId));
      const repository = new BoardRepository(deps.workspace.rootYDoc);
      for (const node of plan.nodes) {
        available(deps, node.docId);
        repository.registerChild(node.docId, node.parentId, operationId + ':copy:' + node.docId);
      }
      await deps.workspace.engine.doc.waitForUpdated(deps.workspace.id);
      await withDoc(deps, parentId, async store => {
        await authorize(deps, parentId, []);
        available(deps, rootId);
        insertChildBoardPortal(store, rootId, plan.placement);
        await deps.workspace.engine.doc.waitForUpdated(parentId);
      });
      journal.complete = true;
      await journalAccess(key, journal);
      return rootId;
    } catch (cause) { throw new DikwBoardCopyError(rootId, operationId, cause); }
  });
}
