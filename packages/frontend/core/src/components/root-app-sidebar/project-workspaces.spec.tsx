/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Keep the app/service barrels out of this bounded component suite. As in
// project-tabs.spec.tsx, service tokens and LiveData are native React/Rx mocks.
const state = vi.hoisted(() => ({
  services: new Map<string, any>(),
  workspaceHook: vi.fn(),
  jump: vi.fn(),
  jumpToPage: vi.fn(),
}));
vi.mock('@affine/core/components/hooks/use-navigate-helper', () => ({
  useNavigateHelper: () => ({
    jumpToPageBlock: state.jump,
    jumpToPage: state.jumpToPage,
  }),
}));
vi.mock('@affine/core/components/hooks/use-workspace-info', () => ({
  useWorkspaceInfo: (meta: { id: string; flavour: string }) => ({
    name: meta.flavour + ':' + meta.id,
  }),
}));
vi.mock('@affine/core/components/hooks/use-workspace', async () => {
  const { useEffect, useState } = await import('react');
  return {
    // Model the real hook's mount reference separately from an action's retain.
    useWorkspace: (meta: any) => {
      state.workspaceHook(meta);
      const [workspace, setWorkspace] = useState<any>(null);
      useEffect(() => {
        const ref = state.services.get('workspaces').open({ metadata: meta });
        setWorkspace(ref.workspace);
        return () => ref.dispose();
      }, [meta]);
      return workspace;
    },
  };
});
vi.mock('@affine/core/modules/cloud', () => ({
  AuthService: 'auth',
  DefaultServerService: 'server',
}));
vi.mock('@affine/graphql', () => ({
  ServerFeature: { LocalWorkspace: 'local-workspace' },
}));
vi.mock('@affine/core/modules/dialogs', () => ({ GlobalDialogService: 'dialogs' }));
vi.mock('@affine/core/modules/doc', () => ({ DocsService: 'docs' }));
vi.mock('@affine/core/modules/permissions', () => ({ GuardService: 'guard' }));
vi.mock('@affine/core/modules/workbench', () => ({ WorkbenchService: 'workbench' }));
vi.mock('@affine/core/modules/workspace', () => ({
  WorkspaceService: 'workspace',
  WorkspacesService: 'workspaces',
}));
vi.mock('@affine/core/modules/dikw-workbench', () => ({
  DikwWorkbenchService: 'boards',
}));
vi.mock('@affine/core/modules/dikw-workbench/connected-navigation', () => ({
  // Permission subscription behavior has its own connected-navigation suite.
  useReadableDocIds: (ids: readonly string[]) => new Set(ids),
}));
vi.mock('@blocksuite/icons/rc', () => ({
  FolderIcon: () => null,
  EdgelessIcon: () => null,
  PlusIcon: () => null,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'new-operation' }));
vi.mock('./project-workspaces.css', () => ({
  header: 'header',
  row: 'row',
  button: 'button',
  label: 'label',
  small: 'small',
  form: 'form',
  input: 'input',
}));
vi.mock('@toeverything/infra', async () => {
  const { createContext, createElement, useContext, useSyncExternalStore, useCallback } =
    await import('react');
  const { BehaviorSubject } = await import('rxjs');
  const Scope = createContext<Map<string, any> | null>(null);
  class LiveData<T> extends BehaviorSubject<T> {
    setValue(value: T) {
      this.next(value);
    }
    static from(source: any, initial: any) {
      const subject = new LiveData(initial);
      source.subscribe((value: any) => subject.next(value));
      return subject;
    }
  }
  return {
    LiveData,
    FrameworkScope: ({ scope, children }: any) =>
      createElement(Scope.Provider, { value: scope }, children),
    useService: (token: string) => {
      const scope = useContext(Scope);
      if (scope?.has(token)) return scope.get(token);
      if (!state.services.has(token)) throw new Error('Unmocked service: ' + token);
      return state.services.get(token);
    },
    useLiveData: (source: any) =>
      useSyncExternalStore(
        useCallback(
          (listener: () => void) => {
            const subscription = source.subscribe(listener);
            return () => subscription.unsubscribe();
          },
          [source]
        ),
        () => source.value
      ),
  };
});

// Keep the real, lightweight sidebar-tree and projectDocId helpers: reproducing
// those algorithms in mocks would hide exact-ID/prefix and multiple-root bugs.
import { ProjectWorkspaces } from './project-workspaces';

const identity = (meta: { id: string; flavour: string }) =>
  JSON.stringify([meta.flavour, meta.id]);
const expandedKey = 'dikw:workspace-folders:v1';
const pendingKey = (meta: { id: string; flavour: string }) =>
  'dikw:project-create:v1:' + identity(meta);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(id: string, flavour = 'local') {
  const meta = { id, flavour };
  const ready = new BehaviorSubject({ ready: true });
  const allowed = new BehaviorSubject(true);
  const records = new Map(
    ['root', 'root-long', 'second'].map(docId => [
      docId,
      { title$: new BehaviorSubject(id + '-' + docId), trash$: { value: false } },
    ])
  );
  const nativeDoc = {
    blockSuiteDoc: { readonly: false },
    waitForSyncReady: vi.fn(async () => {}),
    changeDocTitle: vi.fn(),
  };
  const release = vi.fn();
  const docs = {
    list: {
      nonTrashDocsIds$: new BehaviorSubject([...records.keys()]),
      doc$: (docId: string) => ({ value: records.get(docId) }),
    },
    allDocTitle$: () => new BehaviorSubject([]),
    open: vi.fn(() => ({ doc: nativeDoc, release })),
  };
  const guard = {
    can$: vi.fn(() => allowed),
    can: vi.fn(async (_action: string, _docId?: string) => true),
    revalidateCan: vi.fn(),
  };
  const boards = {
    relations$: new BehaviorSubject(new Map([...records.keys()].map(docId => [
      docId,
      { version: 1, docId, parentId: null, operationId: docId, rootKind: 'project' },
    ]))),
    createProject: vi.fn(async (_title: string, _operationId: string) => 'created'),
  };
  const scope = new Map<string, any>();
  const workspace = {
    id,
    meta,
    scope,
    openOptions: { isSharedMode: false },
    engine: {
      doc: {
        docState$: vi.fn(() => ready),
        waitForUpdated: vi.fn(async (_docId: string) => {}),
      },
    },
  };
  // Deliberately different from the outer Workbench location. Nested scopes
  // must not decide which workspace/document is active in the whole sidebar.
  const location = new BehaviorSubject({ pathname: '/second' });
  for (const [token, value] of Object.entries({
    workspace: { workspace }, docs, guard, boards,
    workbench: { workbench: { location$: location } },
  })) scope.set(token, value);
  return { workspace, meta, ready, records, docs, guard, boards, nativeDoc, release };
}
type Fixture = ReturnType<typeof fixture>;
let current: Fixture;
let target: Fixture;
let location: BehaviorSubject<{ pathname: string }>;
let manager: {
  list: { workspaces$: BehaviorSubject<Fixture['meta'][]> };
  open: ReturnType<typeof vi.fn>;
};
let references: { workspace: Fixture['workspace']; dispose: ReturnType<typeof vi.fn> }[];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.services.clear();
  current = fixture('one');
  target = fixture('two', 'server');
  references = [];
  location = new BehaviorSubject({ pathname: '/root' });
  manager = {
    list: { workspaces$: new BehaviorSubject([current.meta, target.meta]) },
    open: vi.fn(({ metadata }: { metadata: Fixture['meta'] }) => {
      const item = [current, target].find(item => identity(item.meta) === identity(metadata));
      if (!item) throw new Error('Unmocked workspace');
      const ref = { workspace: item.workspace, dispose: vi.fn() };
      references.push(ref);
      return ref;
    }),
  };
  for (const [token, value] of Object.entries({
    workspace: { workspace: current.workspace },
    workspaces: manager,
    workbench: { workbench: { location$: location } },
    auth: { session: { session$: new BehaviorSubject({ status: 'authenticated' }) } },
    server: { server: { config$: { value: { features: [] } } } },
    dialogs: { open: vi.fn(), openCreateWorkspace: vi.fn() },
  })) state.services.set(token, value);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function collapseCurrent() {
  fireEvent.click(screen.getByRole('button', { name: '收起local:one' }));
}
function startCreate() {
  fireEvent.click(screen.getByTestId('dikw-create-project'));
  fireEvent.change(screen.getByRole('textbox', { name: '新工程名称' }), {
    target: { value: 'New project' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建工程' }));
}
function startRename() {
  fireEvent.click(screen.getByRole('button', { name: '重命名one-root' }));
  fireEvent.change(screen.getByRole('textbox', { name: '工程或白板名称' }), {
    target: { value: 'Renamed project' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
}

describe('ProjectWorkspaces lazy workspace tree', () => {
  test('duplicate IDs across flavours never mount the workspace-opening hook', () => {
    target = fixture('one', 'server');
    manager.list.workspaces$.next([current.meta, target.meta]);
    localStorage.setItem(expandedKey, JSON.stringify([identity(current.meta), identity(target.meta)]));
    render(<ProjectWorkspaces />);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByText('工作区标识冲突，已禁止打开以保护内容。')).toHaveLength(2);
    expect(state.workspaceHook).not.toHaveBeenCalled();
    expect(manager.open).not.toHaveBeenCalled();
  });

  test('collapsed folders do not open engines; expanding only opens the requested workspace', () => {
    localStorage.setItem(expandedKey, '[]');
    render(<ProjectWorkspaces />);
    expect(state.workspaceHook).not.toHaveBeenCalled();
    expect(manager.open).not.toHaveBeenCalled();
    expect(current.workspace.engine.doc.docState$).not.toHaveBeenCalled();
    expect(target.workspace.engine.doc.docState$).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '展开server:two' }));
    expect(manager.open).toHaveBeenCalledTimes(1);
    expect(manager.open).toHaveBeenCalledWith({ metadata: target.meta });
    expect(target.workspace.engine.doc.docState$).toHaveBeenCalledWith('two');
    expect(current.workspace.engine.doc.docState$).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('dikw-main-board')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '收起server:two' }));
    expect(references[0].dispose).toHaveBeenCalledTimes(1);
  });

  test('ready=false shows synchronizing, never a falsely empty project list', async () => {
    current.ready.next({ ready: false });
    current.docs.list.nonTrashDocsIds$.next([]);
    render(<ProjectWorkspaces />);
    expect(screen.getByRole('status').textContent).toBe('正在同步工程列表…');
    expect(screen.queryByText('暂无可读取的工程')).toBeNull();
    expect(screen.queryByTestId('dikw-create-project')).toBeNull();
    await act(async () => { current.ready.next({ ready: true }); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('暂无可读取的工程')).toBeTruthy();
  });

  test('outer Workbench selects exact IDs only in the active workspace, retaining the all-documents route', async () => {
    localStorage.setItem(expandedKey, JSON.stringify([identity(current.meta), identity(target.meta)]));
    const { container } = render(<ProjectWorkspaces />);
    const row = (workspaceId: string, docId: string) => container.querySelector(
      '[data-workspace-id="' + workspaceId + '"] [data-project-board-id="' + docId + '"] > [data-active]'
    );
    expect(row('one', 'root')?.getAttribute('data-active')).toBe('true');
    expect(row('one', 'root-long')?.getAttribute('data-active')).toBe('false');
    expect(row('one', 'second')?.getAttribute('data-active')).toBe('false');
    expect(row('two', 'root')?.getAttribute('data-active')).toBe('false');
    expect(row('two', 'second')?.getAttribute('data-active')).toBe('false');
    await act(async () => { location.next({ pathname: '/root-long' }); });
    expect(row('one', 'root')?.getAttribute('data-active')).toBe('false');
    expect(row('one', 'root-long')?.getAttribute('data-active')).toBe('true');
    await act(async () => { location.next({ pathname: '/root-longer' }); });
    expect(container.querySelectorAll('[data-project-board-id] > [data-active="true"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'two-second' }));
    expect(state.jump).toHaveBeenCalledWith('two', 'second', 'edgeless');
    const targetFolder = container.querySelector('[data-workspace-id="two"]') as HTMLElement;
    fireEvent.click(within(targetFolder).getByRole('button', { name: '已有内容与文档' }));
    expect(state.jumpToPage).toHaveBeenCalledWith('two', 'all');
    expect(screen.queryByRole('button', { name: /^(知识库|产物库)$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^(知识库|产物库)$/ })).toBeNull();
  });

  test('creation retains a second workspace reference across collapse and releases it in finally without navigating', async () => {
    const creation = deferred<string>();
    current.boards.createProject.mockReturnValueOnce(creation.promise);
    render(<ProjectWorkspaces />);
    startCreate();
    await waitFor(() => expect(current.boards.createProject).toHaveBeenCalledWith('New project', 'new-operation'));
    expect(references).toHaveLength(2);
    expect(references[1].dispose).not.toHaveBeenCalled();
    collapseCurrent();
    expect(references[0].dispose).toHaveBeenCalledTimes(1);
    expect(references[1].dispose).not.toHaveBeenCalled();
    await act(async () => { creation.resolve('created'); await creation.promise; });
    await waitFor(() => expect(references[1].dispose).toHaveBeenCalledTimes(1));
    expect(state.jump).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey(current.meta))).toBeNull();
  });

  test('rename retains workspace and document references until sync settles after collapse, without late mutation', async () => {
    const synced = deferred<void>();
    current.nativeDoc.waitForSyncReady.mockReturnValueOnce(synced.promise);
    render(<ProjectWorkspaces />);
    startRename();
    await waitFor(() => expect(current.nativeDoc.waitForSyncReady).toHaveBeenCalledTimes(1));
    expect(references).toHaveLength(2);
    collapseCurrent();
    expect(references[0].dispose).toHaveBeenCalledTimes(1);
    expect(references[1].dispose).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    await act(async () => { synced.resolve(); await synced.promise; });
    await waitFor(() => expect(current.release).toHaveBeenCalledTimes(1));
    expect(references[1].dispose).toHaveBeenCalledTimes(1);
    expect(current.nativeDoc.changeDocTitle).not.toHaveBeenCalled();
    expect(current.workspace.engine.doc.waitForUpdated).not.toHaveBeenCalled();
  });

  test('async creation denial and rename permission revocation do not mutate content and release action references', async () => {
    const permission = deferred<boolean>();
    current.guard.can.mockReturnValueOnce(permission.promise);
    render(<ProjectWorkspaces />);
    startCreate();
    expect(current.guard.can).toHaveBeenCalledWith('Workspace_CreateDoc');
    expect(current.boards.createProject).not.toHaveBeenCalled();
    expect(references[1].dispose).not.toHaveBeenCalled();
    await act(async () => { permission.resolve(false); await permission.promise; });
    expect((await screen.findByRole('alert')).textContent).toBe('没有创建工程权限');
    expect(current.boards.createProject).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey(current.meta))).toBeNull();
    expect(references[1].dispose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    const synced = deferred<void>();
    current.nativeDoc.waitForSyncReady.mockReturnValueOnce(synced.promise);
    current.guard.can.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    startRename();
    await waitFor(() => expect(current.nativeDoc.waitForSyncReady).toHaveBeenCalledTimes(1));
    expect(current.nativeDoc.changeDocTitle).not.toHaveBeenCalled();
    await act(async () => { synced.resolve(); await synced.promise; });
    expect((await screen.findByRole('alert')).textContent).toBe('权限已改变');
    expect(current.guard.can.mock.calls.filter(([action]) => action === 'Doc_Update')).toEqual([
      ['Doc_Update', 'root'], ['Doc_Update', 'root'],
    ]);
    expect(current.nativeDoc.changeDocTitle).not.toHaveBeenCalled();
    expect(current.workspace.engine.doc.waitForUpdated).not.toHaveBeenCalled();
    expect(current.release).toHaveBeenCalledTimes(1);
    expect(references[2].dispose).toHaveBeenCalledTimes(1);
  });

  test('failed create recovery can keep its record and close without deleting or reinitializing content', async () => {
    const operation = { id: 'unfinished-operation', title: 'Recovered project' };
    const key = pendingKey(current.meta);
    localStorage.setItem(key, JSON.stringify(operation));
    current.boards.createProject.mockRejectedValueOnce(new Error('Save confirmation unavailable'));
    render(<ProjectWorkspaces />);
    expect((screen.getByRole('textbox', { name: '新工程名称' }) as HTMLInputElement).value).toBe(operation.title);
    fireEvent.click(screen.getByRole('button', { name: '创建工程' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Save confirmation unavailable'));
    expect(current.boards.createProject).toHaveBeenCalledWith(operation.title, operation.id);
    expect(references[1].dispose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '保留记录并关闭' }));
    expect(screen.queryByRole('textbox', { name: '新工程名称' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByTestId('dikw-main-board')).toHaveLength(3);
    expect(localStorage.getItem(key)).toBeNull();
    expect(JSON.parse(localStorage.getItem(key + ':recovery:' + operation.id)!)).toEqual(operation);
    // Strict service mocks expose no deletion/reset API; closing must not even
    // acquire a native document or call createProject a second time.
    expect(current.docs.open).not.toHaveBeenCalled();
    expect(current.nativeDoc.changeDocTitle).not.toHaveBeenCalled();
    expect(current.boards.createProject).toHaveBeenCalledTimes(1);
    expect(state.jump).not.toHaveBeenCalled();
    collapseCurrent();
    fireEvent.click(screen.getByRole('button', { name: '展开local:one' }));
    expect(screen.queryByRole('textbox', { name: '新工程名称' })).toBeNull();
    expect(localStorage.getItem(key + ':recovery:' + operation.id)).not.toBeNull();
  });
});
