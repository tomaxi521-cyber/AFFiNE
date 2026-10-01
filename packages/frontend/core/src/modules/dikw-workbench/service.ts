import type { SurfaceBlockModel } from '@blocksuite/affine/blocks/surface';
import type { GfxModel } from '@blocksuite/affine/std/gfx';
import type { Store } from '@blocksuite/affine/store';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { LiveData, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { applyUpdate } from 'yjs';

import type { WorkspaceServerService } from '../cloud';
import type { DocsService } from '../doc';
import type { GuardService } from '../permissions';
import type { WorkspaceService } from '../workspace';
import { isLegacyBoardRoot, type BoardRelation } from './board-graph';
import { BoardRepository } from './board-repository';
import { fetchMainBoardSeed, type DecodedMainBoardSeed } from './bootstrap';
import { ensureLocalMainBoardSeed } from './local-bootstrap';

const CHILD_OPERATIONS = 'dikw:child-operations:v1';
const PROJECT_OPERATIONS = 'dikw:project-operations:v1';
type ProjectOperation = {
  title: string;
  docId: string;
  state: 'reserved' | 'created';
};

function parseProjectOperation(value: unknown): ProjectOperation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('项目操作记录损坏，需要恢复');
  const op = value as Partial<ProjectOperation>;
  if (
    typeof op.docId !== 'string' ||
    !op.docId ||
    typeof op.title !== 'string' ||
    !op.title.trim() ||
    (op.state !== 'reserved' && op.state !== 'created')
  )
    throw new Error('项目操作记录损坏，需要恢复');
  return op as ProjectOperation;
}

/** Reserved operations never rerun native initialization after an ambiguous crash. */
export class DikwProjectCreationError extends Error {
  constructor(
    readonly docId: string,
    readonly operationId: string,
    cause: unknown
  ) {
    super('项目创建未完全完成；已有内容不会删除，请检查项目或使用原操作重试', {
      cause,
    });
    this.name = 'DikwProjectCreationError';
  }
}
export type BoardPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};
function validPlacement(p: BoardPlacement | undefined): boolean {
  return (
    p === undefined ||
    (!!p &&
      [p.x, p.y, p.width, p.height].every(Number.isFinite) &&
      p.width >= 160 &&
      p.height >= 100 &&
      p.width <= 10000 &&
      p.height <= 10000)
  );
}
type ChildOperation = {
  parentId: string;
  title: string;
  docId: string;
  state: 'reserved' | 'created';
  placement?: BoardPlacement;
};

function parseChildOperation(value: unknown): ChildOperation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object')
    throw new Error('子白板操作记录损坏，需要恢复');
  const op = value as Partial<ChildOperation>;
  if (
    !op.parentId ||
    typeof op.parentId !== 'string' ||
    !op.docId ||
    typeof op.docId !== 'string' ||
    !op.title ||
    typeof op.title !== 'string' ||
    !validPlacement(op.placement) ||
    (op.state !== 'reserved' && op.state !== 'created')
  ) {
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
    super(
      '子白板创建未完全完成；已有内容不会删除，请检查子白板或使用原操作重试',
      { cause }
    );
    this.name = 'DikwChildCreationError';
  }
}

export class DikwWorkbenchService extends Service {
  readonly relations$: LiveData<ReadonlyMap<string, BoardRelation>>;
  private mainTask?: Promise<string>;
  private readonly projectTasks = new Map<
    string,
    { title: string; task: Promise<string> }
  >();
  private readonly childTasks = new Map<
    string,
    {
      parentId: string;
      title: string;
      placement?: BoardPlacement;
      task: Promise<string>;
    }
  >();

  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly guardService: GuardService,
    private readonly repository: BoardRepository
  ) {
    super();
    this.relations$ = new LiveData<ReadonlyMap<string, BoardRelation>>(
      repository.snapshot()
    );
    this.disposables.push(
      repository.observe(() => this.relations$.setValue(repository.snapshot()))
    );
  }

  private get workspace() {
    return this.workspaceService.workspace;
  }

  getPath(docId: string) {
    return this.repository.path(docId);
  }

  getChildren(parentId: string): BoardRelation[] {
    return [...this.repository.snapshot().values()].filter(
      r => r.parentId === parentId
    );
  }

  private assertWritable() {
    if (this.workspace.openOptions.isSharedMode)
      throw new Error('分享模式不能修改白板');
  }

  private async rootReady() {
    await this.workspace.engine.doc.waitForDocReady(this.workspace.id);
  }

  private async canCreate() {
    this.assertWritable();
    if ((await this.guardService.can('Workspace_CreateDoc')) !== true) {
      throw new Error('没有创建白板权限');
    }
    this.assertWritable();
  }

  private async canEdit(docId: string) {
    this.assertWritable();
    if ((await this.guardService.can('Doc_Update', docId)) !== true) {
      throw new Error('没有编辑白板权限');
    }
    this.assertWritable();
  }

  private async mainId(): Promise<string | undefined> {
    const roots = [...this.repository.snapshot().values()]
      .filter(r => r.parentId === null)
      .sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0));
    // Preserve legacy offline startup: graph membership can arrive before the
    // native list record. Selecting the seed ID is navigation, not a write or a
    // permission grant; native loading remains the boundary. Never select an
    // explicitly trashed seed. New projects below still require known metadata.
    const legacy = roots.find(
      r =>
        isLegacyBoardRoot(r) &&
        this.docsService.list.doc$(r.docId).value?.trash$.value !== true
    );
    if (legacy) return legacy.docId;
    for (const root of roots) {
      if (this.docsService.list.doc$(root.docId).value?.trash$.value !== false)
        continue;
      if (
        (await this.guardService.can('Doc_Read', root.docId)) === true &&
        this.docsService.list.doc$(root.docId).value?.trash$.value === false
      )
        return root.docId;
    }
    // Existing but unavailable projects are not an empty workspace. Do not
    // mutate/bootstrap it or revive a trashed root just to satisfy /board.
    if (roots.length)
      throw new Error('没有可打开的项目，请从回收站恢复或创建新项目');
    return undefined;
  }

  ensureMainBoard(): Promise<string> {
    return (this.mainTask ??= this.ensureMain().finally(() => {
      this.mainTask = undefined;
    }));
  }

  private async ensureMain(): Promise<string> {
    await this.workspace.engine.doc.waitForDocLoaded(this.workspace.id);
    // Existing cloud boards remain navigable offline. Opening is not a write;
    // native document permissions/loading still apply when the UI opens it.
    const existing = await this.mainId();
    if (existing) return existing;
    await this.rootReady();
    const loadedMain = await this.mainId();
    if (loadedMain) return loadedMain;
    this.assertWritable();
    await this.canCreate();
    let seed: DecodedMainBoardSeed;
    if (this.workspace.flavour === 'local') {
      const result = await ensureLocalMainBoardSeed({
        workspaceId: this.workspace.id,
        flavour: this.workspace.flavour,
        rootDoc: this.workspace.rootYDoc,
        waitForRootLoaded: () =>
          this.workspace.engine.doc.waitForDocLoaded(this.workspace.id),
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
    const concurrent = await this.mainId();
    if (concurrent && concurrent !== seed.docId) return concurrent;
    // Persist content before exposing root membership. A crash after the root
    // save must not leave an offline-visible main board with no cached body.
    await this.workspace.engine.doc.storage.pushDocUpdate({
      docId: seed.docId,
      bin: seed.contentUpdate,
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

  createProject(title: string, operationId = nanoid()): Promise<string> {
    if (!operationId || !title.trim())
      return Promise.reject(new Error('请输入项目标题'));
    const normalizedTitle = title.trim();
    const running = this.projectTasks.get(operationId);
    if (running)
      return running.title === normalizedTitle
        ? running.task
        : Promise.reject(new Error('同一操作不能改变项目标题'));
    const task = this.createProjectLocked(normalizedTitle, operationId).finally(
      () => this.projectTasks.delete(operationId)
    );
    this.projectTasks.set(operationId, { title: normalizedTitle, task });
    return task;
  }

  private async createProjectLocked(
    title: string,
    operationId: string
  ): Promise<string> {
    await this.rootReady();
    await this.canCreate();
    if (typeof navigator === 'undefined' || !navigator.locks)
      throw new Error('当前环境不支持安全创建项目');
    return navigator.locks.request(
      'dikw:project:' + this.workspace.id + ':' + operationId,
      async () => {
        await this.rootReady();
        await this.canCreate();
        const operations =
          this.workspace.rootYDoc.getMap<ProjectOperation>(PROJECT_OPERATIONS);
        const journalKey =
          'dikw:project-operation:v1:' +
          JSON.stringify([
            this.workspace.flavour,
            this.workspaceServerService.server?.id ?? '',
            this.workspace.id,
            operationId,
          ]);
        const rawJournal = localStorage.getItem(journalKey);
        const journal = parseProjectOperation(
          rawJournal === null ? undefined : JSON.parse(rawJournal)
        );
        const synced = parseProjectOperation(operations.get(operationId));
        const previous = journal ?? synced;
        const relation = [...this.repository.snapshot().values()].find(
          r => r.operationId === operationId
        );
        for (const op of [journal, synced]) {
          if (
            op &&
            (op.title !== title || (previous && op.docId !== previous.docId))
          ) {
            throw new Error('同一操作不能改变项目标题或标识');
          }
        }
        if (
          relation &&
          (relation.parentId !== null ||
            relation.rootKind !== 'project' ||
            (previous && previous.docId !== relation.docId))
        )
          throw new Error('操作已属于其他白板');
        const docId = previous?.docId ?? relation?.docId ?? nanoid();
        if (previous?.state === 'reserved') {
          throw new DikwProjectCreationError(
            docId,
            operationId,
            new Error('上次创建状态待恢复，请勿重复创建')
          );
        }
        const saveOperation = (state: ProjectOperation['state']) => {
          const operation: ProjectOperation = { title, docId, state };
          // Reserve before native initialization, including across stale tab roots.
          localStorage.setItem(journalKey, JSON.stringify(operation));
          operations.set(operationId, operation);
        };
        try {
          if (!previous && !relation) {
            saveOperation('reserved');
            await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
            await this.canCreate();
            const created = this.docsService.createDoc({
              id: docId,
              title,
              primaryMode: 'edgeless',
              docProps: {
                onStoreLoad: (store, { noteId }) => {
                  const note = store.getBlock(noteId)?.model;
                  if (note)
                    store.updateBlock(note, {
                      displayMode: NoteDisplayMode.DocOnly,
                    });
                },
              },
            });
            if (created.id !== docId)
              throw new Error('创建中间件改变了项目白板标识');
            await this.workspace.engine.doc.waitForDocLoaded(docId);
            await this.workspace.engine.doc.waitForUpdated(docId);
            saveOperation('created');
          }
          // Recovery reuses native persisted content; never initializes it again.
          await this.canEdit(docId);
          if (this.docsService.list.doc$(docId).value?.trash$.value !== false)
            throw new Error('项目白板不可用，请先恢复');
          const nativeDoc = this.workspace.docCollection.getDoc(docId);
          if (!nativeDoc)
            throw new Error('项目白板记录尚未恢复，请稍后重试原操作');
          nativeDoc.load();
          await this.workspace.engine.doc.waitForDocLoaded(docId);
          await this.workspace.engine.doc.waitForUpdated(docId);
          await this.canCreate();
          await this.canEdit(docId);
          if (this.docsService.list.doc$(docId).value?.trash$.value !== false)
            throw new Error('项目白板不可用，请先恢复');
          saveOperation('created');
          this.repository.registerProject(docId, operationId);
          await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
          return docId;
        } catch (cause) {
          // No compensating delete: an error may follow successful persistence.
          throw new DikwProjectCreationError(docId, operationId, cause);
        }
      }
    );
  }

  createChild(
    parentId: string,
    title: string,
    operationId = nanoid(),
    placement?: BoardPlacement
  ): Promise<string> {
    if (!validPlacement(placement))
      return Promise.reject(new Error('白板放置区域无效'));
    if (!parentId || !operationId || !title.trim())
      return Promise.reject(new Error('请输入子白板标题'));
    const running = this.childTasks.get(operationId);
    if (running) {
      return running.parentId === parentId &&
        running.title === title.trim() &&
        JSON.stringify(running.placement) === JSON.stringify(placement)
        ? running.task
        : Promise.reject(new Error('操作已属于其他父白板'));
    }
    const task = this.createChildLocked(
      parentId,
      title.trim(),
      operationId,
      placement
    ).finally(() => this.childTasks.delete(operationId));
    this.childTasks.set(operationId, {
      parentId,
      title: title.trim(),
      placement,
      task,
    });
    return task;
  }

  private async createChildLocked(
    parentId: string,
    title: string,
    operationId: string,
    placement?: BoardPlacement
  ): Promise<string> {
    await this.rootReady();
    await this.canCreate();
    await this.canEdit(parentId);
    // Browser-local retries across tabs are serialized. Do not pretend an
    // in-memory mutex is cross-tab coordination on unsupported platforms.
    if (typeof navigator === 'undefined' || !navigator.locks) {
      throw new Error('当前环境不支持安全创建子白板');
    }
    return navigator.locks.request(
      'dikw:child:' + this.workspace.id + ':' + operationId,
      async () => {
        await this.rootReady();
        await this.canCreate();
        await this.canEdit(parentId);
        if (this.repository.path(parentId).problem)
          throw new Error('父白板关系不可用');
        const operations =
          this.workspace.rootYDoc.getMap<ChildOperation>(CHILD_OPERATIONS);
        // Web Locks serialize tabs, but their in-memory Y roots may lag. A
        // durable browser journal is read while holding the lock, before create.
        const journalKey =
          'dikw:child-operation:v1:' +
          JSON.stringify([
            this.workspace.flavour,
            this.workspaceServerService.server?.id ?? '',
            this.workspace.id,
            operationId,
          ]);
        const rawJournal = localStorage.getItem(journalKey);
        const journal = parseChildOperation(
          rawJournal === null ? undefined : JSON.parse(rawJournal)
        );
        const synced = parseChildOperation(operations.get(operationId));
        const previous = journal ?? synced;
        const relation = [...this.repository.snapshot().values()].find(
          r => r.operationId === operationId
        );
        for (const op of [journal, synced]) {
          if (
            op &&
            (op.parentId !== parentId ||
              op.title !== title ||
              JSON.stringify(op.placement) !== JSON.stringify(placement) ||
              (previous && op.docId !== previous.docId))
          )
            throw new Error('同一操作不能改变父白板或标题');
        }
        if (
          relation &&
          (relation.parentId !== parentId ||
            (previous && previous.docId !== relation.docId))
        )
          throw new Error('操作已属于其他白板');
        const docId = previous?.docId ?? relation?.docId ?? nanoid();
        if (previous?.state === 'reserved') {
          throw new DikwChildCreationError(
            docId,
            operationId,
            new Error('上次创建状态待恢复，请勿重复创建')
          );
        }
        const saveOperation = (state: ChildOperation['state']) => {
          const operation: ChildOperation = {
            parentId,
            title,
            docId,
            state,
            ...(placement ? { placement } : {}),
          };
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
            const created = this.docsService.createDoc({
              id: docId,
              title,
              primaryMode: 'edgeless',
              docProps: {
                onStoreLoad: (store, { noteId }) => {
                  // New child initialization only: retain the native document note,
                  // but do not place its page-title card on an otherwise blank canvas.
                  const note = store.getBlock(noteId)?.model;
                  if (note)
                    store.updateBlock(note, {
                      displayMode: NoteDisplayMode.DocOnly,
                    });
                },
              },
            });
            if (created.id !== docId)
              throw new Error('创建中间件改变了子白板标识');
            await this.workspace.engine.doc.waitForDocLoaded(docId);
            await this.workspace.engine.doc.waitForUpdated(docId);
            saveOperation('created');
          } catch (cause) {
            throw new DikwChildCreationError(docId, operationId, cause);
          }
        }
        try {
          const nativeDoc = this.workspace.docCollection.getDoc(docId);
          if (!nativeDoc)
            throw new Error('子白板记录尚未恢复，请稍后重试原操作');
          nativeDoc.load();
          await this.workspace.engine.doc.waitForDocLoaded(docId);
          await this.workspace.engine.doc.waitForUpdated(docId);
          saveOperation('created');
          this.repository.registerChild(docId, parentId, operationId);
          await this.workspace.engine.doc.waitForUpdated(this.workspace.id);
          await this.insertReference(parentId, docId, (store, target) =>
            insertChildBoardPortal(store, target, placement)
          );
          return docId;
        } catch (cause) {
          throw new DikwChildCreationError(docId, operationId, cause);
        }
      }
    );
  }

  async addReference(source: string, target: string): Promise<void> {
    await this.insertReference(source, target, insertLinkedCard);
  }

  private async insertReference(
    source: string,
    target: string,
    insert: (store: Store, target: string) => void
  ): Promise<void> {
    await this.rootReady();
    await this.canEdit(source);
    if ((await this.guardService.can('Doc_Read', target)) !== true)
      throw new Error('没有读取目标文档权限');
    if (this.docsService.list.doc$(target).value?.trash$.value !== false)
      throw new Error('目标文档不可用');
    if (this.docsService.list.doc$(source).value?.trash$.value !== false)
      throw new Error('源文档不可用');
    const opened = this.docsService.open(source);
    const releasePriority = opened.doc.addPriorityLoad(100);
    try {
      await opened.doc.waitForSyncReady();
      await this.canEdit(source);
      if ((await this.guardService.can('Doc_Read', target)) !== true)
        throw new Error('没有读取目标文档权限');
      this.assertWritable();
      if (
        this.docsService.list.doc$(source).value?.trash$.value !== false ||
        this.docsService.list.doc$(target).value?.trash$.value !== false
      )
        throw new Error('文档不可用');
      insert(opened.doc.blockSuiteDoc, target);
      await this.workspace.engine.doc.waitForUpdated(source);
    } finally {
      releasePriority();
      opened.release();
    }
  }
}

/** Child creation only: a native, live edgeless preview, not a moved/copied doc.
 * Old linked cards and existing portals are reused verbatim on retry. */
export function insertChildBoardPortal(
  store: Store,
  target: string,
  placement?: BoardPlacement
): void {
  if (!validPlacement(placement)) throw new Error('白板放置区域无效');
  if (store.readonly) throw new Error('白板为只读');
  const surface = store.getBlocksByFlavour('affine:surface')[0]?.model as
    | SurfaceBlockModel
    | undefined;
  if (!surface) throw new Error('源白板画布尚未就绪');
  const entries = store.getBlocksByFlavour([
    'affine:embed-linked-doc',
    'affine:embed-synced-doc',
  ]);
  if (
    entries.some(
      ({ model }) =>
        (model.props as { pageId?: unknown }).pageId === target &&
        surface.children.some(c => c.id === model.id)
    )
  )
    return;

  // Native elementBound accounts for rotation, note bounds and connector labels;
  // externalBound also reserves native group/frame titles when available.
  // Notes live under the root, not under the surface: enumerate ALL block models.
  const models = [...store.getAllModels(), ...surface.elementModels];
  let right = -Infinity;
  let top = Infinity;
  for (const model of models) {
    if (
      !('elementBound' in model) ||
      ('flavour' in model &&
        model.flavour === 'affine:note' &&
        'props' in model &&
        (model.props as { displayMode?: string }).displayMode ===
          NoteDisplayMode.DocOnly)
    )
      continue;
    const gfx = model as GfxModel;
    for (const bound of [gfx.elementBound, gfx.externalBound]) {
      if (!bound) continue;
      if (
        ![bound.x, bound.y, bound.w, bound.h, bound.x + bound.w].every(
          Number.isFinite
        ) ||
        bound.w < 0 ||
        bound.h < 0
      ) {
        throw new Error('白板内容坐标无效，无法安全放置子白板入口');
      }
      right = Math.max(right, bound.x + bound.w);
      top = Math.min(top, bound.y);
    }
  }
  const x = right === -Infinity ? 0 : right + 64;
  const y = top === Infinity ? 0 : top;
  // Native EMBED_CARD_WIDTH/HEIGHT.syncedDoc (800 × 455), not linked-card size.
  store.captureSync?.();
  store.addBlock(
    'affine:embed-synced-doc',
    {
      pageId: target,
      params: { mode: 'edgeless' },
      style: 'syncedDoc',
      xywh: JSON.stringify(
        placement
          ? [placement.x, placement.y, placement.width, placement.height]
          : [x, y, 800, 455]
      ),
    },
    surface.id
  );
  store.captureSync?.();
}

/** Inserts a native surface child; never use the move-to-linked-doc command.
 * Repeated retries reuse an existing card for the target. Ownership is untouched. */
export function insertLinkedCard(store: Store, target: string): void {
  if (store.readonly) throw new Error('白板为只读');
  const surface = store.getBlocksByFlavour('affine:surface')[0]?.model;
  if (!surface) throw new Error('源白板画布尚未就绪');
  const cards = store.getBlocksByFlavour('affine:embed-linked-doc');
  if (
    cards.some(
      ({ model }) =>
        (model.props as { pageId?: unknown }).pageId === target &&
        surface.children.some(c => c.id === model.id)
    )
  )
    return;
  const offset = surface.children.length * 40;
  store.addBlock(
    'affine:embed-linked-doc',
    {
      pageId: target,
      xywh: '[' + offset + ',' + offset + ',364,390]',
      style: 'vertical',
    },
    surface.id
  );
}
