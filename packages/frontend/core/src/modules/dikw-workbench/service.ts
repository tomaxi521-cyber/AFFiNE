import type { Store } from '@blocksuite/affine/store';
import { LiveData, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { applyUpdate } from 'yjs';

import type { WorkspaceServerService } from '../cloud';
import type { DocsService } from '../doc';
import type { GuardService } from '../permissions';
import type { WorkspaceService } from '../workspace';
import type { BoardRelation } from './board-graph';
import { BoardRepository } from './board-repository';
import { fetchMainBoardSeed, type DecodedMainBoardSeed } from './bootstrap';
import { ensureLocalMainBoardSeed } from './local-bootstrap';

const CHILD_OPERATIONS = 'dikw:child-operations:v1';
type ChildOperation = { parentId: string; title: string; docId: string; state: 'reserved' | 'created' };

function parseChildOperation(value: unknown): ChildOperation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error('子白板操作记录损坏，需要恢复');
  const op = value as Partial<ChildOperation>;
  if (!op.parentId || typeof op.parentId !== 'string' || !op.docId || typeof op.docId !== 'string' ||
      !op.title || typeof op.title !== 'string' || (op.state !== 'reserved' && op.state !== 'created')) {
    throw new Error('子白板操作记录损坏，需要恢复');
  }
  return op as ChildOperation;
}

/** A partial success is recoverable: the UI may navigate to docId and retry
 * with operationId. Never delete user content to compensate for a card failure. */
export class DikwChildCreationError extends Error {
  constructor(
    readonly docId: string,
    readonly operationId: string,
    cause: unknown
  ) {
    super('子白板创建未完全完成；已有内容不会删除，请检查子白板或使用原操作重试', { cause });
    this.name = 'DikwChildCreationError';
  }
}

export class DikwWorkbenchService extends Service {
  readonly relations$: LiveData<ReadonlyMap<string, BoardRelation>>;
  private mainTask?: Promise<string>;
  private readonly childTasks = new Map<string, { parentId: string; title: string; task: Promise<string> }>();

  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly guardService: GuardService,
    private readonly repository: BoardRepository
  ) {
    super();
    this.relations$ = new LiveData<ReadonlyMap<string, BoardRelation>>(repository.snapshot());
    this.disposables.push(repository.observe(() => this.relations$.setValue(repository.snapshot())));
  }

  private get workspace() { return this.workspaceService.workspace; }

  getPath(docId: string) { return this.repository.path(docId); }

  getChildren(parentId: string): BoardRelation[] {
    return [...this.repository.snapshot().values()].filter(r => r.parentId === parentId);
  }

  private assertWritable() {
    if (this.workspace.openOptions.isSharedMode) throw new Error('分享模式不能修改白板');
  }

  private async rootReady() {
    await this.workspace.engine.doc.waitForDocReady(this.workspace.id);
  }

  private async canCreate() {
    this.assertWritable();
    if (await this.guardService.can('Workspace_CreateDoc') !== true) {
      throw new Error('没有创建白板权限');
    }
    this.assertWritable();
  }

  private async canEdit(docId: string) {
    this.assertWritable();
    if (await this.guardService.can('Doc_Update', docId) !== true) {
      throw new Error('没有编辑白板权限');
    }
    this.assertWritable();
  }

  private mainId() {
    const roots = [...this.repository.snapshot().values()].filter(r => r.parentId === null);
    if (roots.length > 1) throw new Error('主白板关系冲突，需要修复');
    return roots[0]?.docId;
  }

  ensureMainBoard(): Promise<string> {
    return this.mainTask ??= this.ensureMain().finally(() => { this.mainTask = undefined; });
  }

  private async ensureMain(): Promise<string> {
    await this.workspace.engine.doc.waitForDocLoaded(this.workspace.id);
    // Existing cloud boards remain navigable offline. Opening is not a write;
    // native document permissions/loading still apply when the UI opens it.
    const existing = this.mainId();
    if (existing) return existing;
    await this.rootReady();
    const loadedMain = this.mainId();
    if (loadedMain) return loadedMain;
    this.assertWritable();
    await this.canCreate();
    let seed: DecodedMainBoardSeed;
    if (this.workspace.flavour === 'local') {
      const result = await ensureLocalMainBoardSeed({
        workspaceId: this.workspace.id, flavour: this.workspace.flavour, rootDoc: this.workspace.rootYDoc,
        waitForRootLoaded: () => this.workspace.engine.doc.waitForDocLoaded(this.workspace.id),
        assertWritable: () => this.canCreate(),
      });
      if (!result.seed) return result.docId;
      seed = result.seed;
    } else {
      const server = this.workspaceServerService.server;
      if (!server) throw new Error('工作区服务器尚未就绪');
      seed = await fetchMainBoardSeed(server.fetch, this.workspace.id);
    }
    await this.canCreate();
    const concurrent = this.mainId();
    if (concurrent && concurrent !== seed.docId) throw new Error('主白板关系冲突，需要修复');
    // Persist content before exposing root membership. A crash after the root
    // save must not leave an offline-visible main board with no cached body.
    await this.workspace.engine.doc.storage.pushDocUpdate({
      docId: seed.docId, bin: seed.contentUpdate,
    });
    this.assertWritable();
    applyUpdate(this.workspace.rootYDoc, seed.rootUpdate);
    const nativeDoc = this.workspace.docCollection.getDoc(seed.docId);
    if (!nativeDoc) throw new Error('主白板种子缺少文档记录');
    // Native load connects persistence listeners; no initializer is called.
    nativeDoc.load();
    applyUpdate(nativeDoc.spaceDoc, seed.contentUpdate);
    await this.workspace.engine.doc.waitForDocLoaded(seed.docId);
    await this.workspace.engine.doc.waitForUpdated(seed.docId);
    await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
    const opened = this.docsService.open(seed.docId);
    opened.release();
    return seed.docId;
  }

  createChild(parentId: string, title: string, operationId = nanoid()): Promise<string> {
    if (!parentId || !operationId || !title.trim()) return Promise.reject(new Error('请输入子白板标题'));
    const running = this.childTasks.get(operationId);
    if (running) {
      return running.parentId === parentId && running.title === title.trim() ? running.task : Promise.reject(new Error('操作已属于其他父白板'));
    }
    const task = this.createChildLocked(parentId, title.trim(), operationId)
      .finally(() => this.childTasks.delete(operationId));
    this.childTasks.set(operationId, { parentId, title: title.trim(), task });
    return task;
  }

  private async createChildLocked(parentId: string, title: string, operationId: string): Promise<string> {
    await this.rootReady();
    await this.canCreate();
    await this.canEdit(parentId);
    // Browser-local retries across tabs are serialized. Do not pretend an
    // in-memory mutex is cross-tab coordination on unsupported platforms.
    if (typeof navigator === 'undefined' || !navigator.locks) {
      throw new Error('当前环境不支持安全创建子白板');
    }
    return navigator.locks.request('dikw:child:' + this.workspace.id + ':' + operationId, async () => {
      await this.rootReady();
      await this.canCreate();
      await this.canEdit(parentId);
      if (this.repository.path(parentId).problem) throw new Error('父白板关系不可用');
      const operations = this.workspace.rootYDoc.getMap<ChildOperation>(CHILD_OPERATIONS);
      // Web Locks serialize tabs, but their in-memory Y roots may lag. A
      // durable browser journal is read while holding the lock, before create.
      const journalKey = 'dikw:child-operation:v1:' + JSON.stringify([
        this.workspace.flavour, this.workspaceServerService.server?.id ?? '',
        this.workspace.id, operationId,
      ]);
      const rawJournal = localStorage.getItem(journalKey);
      const journal = parseChildOperation(rawJournal === null ? undefined : JSON.parse(rawJournal));
      const synced = parseChildOperation(operations.get(operationId));
      const previous = journal ?? synced;
      const relation = [...this.repository.snapshot().values()].find(r => r.operationId === operationId);
      for (const op of [journal, synced]) {
        if (op && (op.parentId !== parentId || op.title !== title ||
            (previous && op.docId !== previous.docId))) throw new Error('同一操作不能改变父白板或标题');
      }
      if (relation && (relation.parentId !== parentId ||
          (previous && previous.docId !== relation.docId))) throw new Error('操作已属于其他白板');
      const docId = previous?.docId ?? relation?.docId ?? nanoid();
      if (previous?.state === 'reserved') {
        throw new DikwChildCreationError(docId, operationId, new Error('上次创建状态待恢复，请勿重复创建'));
      }
      const saveOperation = (state: ChildOperation['state']) => {
        const operation: ChildOperation = { parentId, title, docId, state };
        localStorage.setItem(journalKey, JSON.stringify(operation));
        operations.set(operationId, operation);
      };
      if (!previous && !relation) {
        // Preallocate a RANDOM child ID, reserve durably before native create.
        // An exception or crash stays reserved and NEVER re-runs initialization.
        saveOperation('reserved');
        await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
        await this.canCreate();
        await this.canEdit(parentId);
        try {
          const created = this.docsService.createDoc({ id: docId, title, primaryMode: 'edgeless' });
          if (created.id !== docId) throw new Error('创建中间件改变了子白板标识');
          await this.workspace.engine.doc.waitForDocLoaded(docId);
          await this.workspace.engine.doc.waitForUpdated(docId);
          saveOperation('created');
        } catch (cause) {
          throw new DikwChildCreationError(docId, operationId, cause);
        }
      }
      try {
        this.workspace.docCollection.getDoc(docId)?.load();
        await this.workspace.engine.doc.waitForDocLoaded(docId);
        await this.workspace.engine.doc.waitForUpdated(docId);
        saveOperation('created');
        this.repository.registerChild(docId, parentId, operationId);
        await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
        await this.addReference(parentId, docId);
        return docId;
      } catch (cause) {
        throw new DikwChildCreationError(docId, operationId, cause);
      }
    });
  }

  async addReference(source: string, target: string): Promise<void> {
    await this.rootReady();
    await this.canEdit(source);
    if (await this.guardService.can('Doc_Read', target) !== true) throw new Error('没有读取目标文档权限');
    if (this.docsService.list.doc$(target).value?.trash$.value !== false) throw new Error('目标文档不可用');
    if (this.docsService.list.doc$(source).value?.trash$.value !== false) throw new Error('源文档不可用');
    const opened = this.docsService.open(source);
    const releasePriority = opened.doc.addPriorityLoad(100);
    try {
      await opened.doc.waitForSyncReady();
      await this.canEdit(source);
      if (await this.guardService.can('Doc_Read', target) !== true) throw new Error('没有读取目标文档权限');
      this.assertWritable();
      if (this.docsService.list.doc$(source).value?.trash$.value !== false ||
          this.docsService.list.doc$(target).value?.trash$.value !== false) throw new Error('文档不可用');
      insertLinkedCard(opened.doc.blockSuiteDoc, target);
      await this.workspace.engine.doc.waitForUpdated(source);
    } finally {
      releasePriority();
      opened.release();
    }
  }
}

/** Inserts a native surface child; never use the move-to-linked-doc command.
 * Repeated retries reuse an existing card for the target. Ownership is untouched. */
export function insertLinkedCard(store: Store, target: string): void {
  if (store.readonly) throw new Error('白板为只读');
  const surface = store.getBlocksByFlavour('affine:surface')[0]?.model;
  if (!surface) throw new Error('源白板画布尚未就绪');
  const cards = store.getBlocksByFlavour('affine:embed-linked-doc');
  if (cards.some(({ model }) => (model.props as { pageId?: unknown }).pageId === target && surface.children.some(c => c.id === model.id))) return;
  const offset = surface.children.length * 40;
  store.addBlock('affine:embed-linked-doc', {
    pageId: target,
    xywh: '[' + offset + ',' + offset + ',364,390]',
    style: 'vertical',
  }, surface.id);
}
