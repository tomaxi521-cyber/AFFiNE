/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  services: new Map<string, any>(),
  jump: vi.fn(),
}));
vi.mock('@affine/core/components/hooks/use-navigate-helper', () => ({
  useNavigateHelper: () => ({ jumpToPageBlock: state.jump }),
}));
vi.mock('@affine/core/modules/doc', () => ({ DocsService: 'docs' }));
vi.mock('@affine/core/modules/permissions', () => ({ GuardService: 'guard' }));
vi.mock('@affine/core/modules/workbench', () => ({
  WorkbenchService: 'workbench',
}));
vi.mock('@affine/core/modules/workspace', () => ({
  WorkspaceService: 'workspace',
  WorkspacesService: 'workspaces',
}));
vi.mock('./service', () => ({ DikwWorkbenchService: 'boards' }));
vi.mock('./project-tabs.css', () => ({
  container: 'container',
  strip: 'strip',
  tab: 'tab',
  select: 'select',
  label: 'label',
  close: 'close',
  error: 'error',
}));
vi.mock('@toeverything/infra', async () => {
  const { useSyncExternalStore, useCallback } = await import('react');
  const { BehaviorSubject } = await import('rxjs');
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
    useService: (token: string) => state.services.get(token),
    useLiveData: (source: any) =>
      useSyncExternalStore(
        useCallback(
          (listener: () => void) => {
            const sub = source.subscribe(listener);
            return () => sub.unsubscribe();
          },
          [source]
        ),
        () => source.value
      ),
  };
});

import { ProjectTabs } from './project-tabs';
import {
  projectTabsStore,
  recordProjectTab,
  type ProjectTab,
} from './project-tabs-store';

function fixture(id: string, flavour = 'local') {
  const records = new Map(
    ['root', 'child', 'second'].map(docId => [
      docId,
      { trash$: { value: false }, title$: { value: id + '-' + docId } },
    ])
  );
  const permissions = new Map(
    [...records.keys()].map(docId => [docId, new BehaviorSubject(true)])
  );
  const guard = {
    can$: vi.fn(
      (_: string, docId: string) =>
        permissions.get(docId) ?? new BehaviorSubject(false)
    ),
    revalidateCan: vi.fn(),
    can: vi.fn(
      async (_: string, docId: string) => permissions.get(docId)?.value === true
    ),
  };
  const titles = new BehaviorSubject([]);
  const docs = {
    list: {
      nonTrashDocsIds$: new BehaviorSubject([...records.keys()]),
      doc$: (docId: string) => ({ value: records.get(docId) }),
    },
    allDocTitle$: () => titles,
  };
  const boards = {
    relations$: new BehaviorSubject(new Map()),
    getPath: (docId: string) =>
      records.has(docId)
        ? {
            ids: docId === 'child' ? ['root', 'child'] : [docId],
            problem: null,
          }
        : { ids: [], problem: 'missing' },
  };
  const scope = new Map<string, any>([
    ['guard', guard],
    ['docs', docs],
    ['boards', boards],
  ]);
  const workspace = {
    id,
    flavour,
    name$: new BehaviorSubject(id + ' workspace'),
    openOptions: { isSharedMode: false },
    scope,
    engine: { doc: { waitForDocReady: vi.fn(async () => {}) } },
  };
  return { records, permissions, guard, docs, boards, workspace, titles };
}
let current: ReturnType<typeof fixture>;
let remote: ReturnType<typeof fixture>;
let workbench: any;
let workspaces: any;
const saved = (patch: Partial<ProjectTab> = {}): ProjectTab => ({
  flavour: 'local',
  workspaceId: 'one',
  rootId: 'root',
  currentDocId: 'root',
  title: 'cached secret',
  ...patch,
});
afterEach(cleanup);
beforeEach(() => {
  state.services.clear();
  state.jump.mockClear();
  projectTabsStore.tabs$.setValue([]);
  projectTabsStore.observeRoute('reset');
  current = fixture('one');
  remote = fixture('two', 'server');
  workbench = {
    location$: new BehaviorSubject({ pathname: '/root', key: 'first' }),
    open: vi.fn(),
  };
  workspaces = {
    list: {
      workspaces$: new BehaviorSubject([
        { id: 'one', flavour: 'local' },
        { id: 'two', flavour: 'server' },
      ]),
    },
    open: vi.fn(() => ({ workspace: remote.workspace, dispose: vi.fn() })),
  };
  for (const [token, service] of Object.entries({
    workspace: { workspace: current.workspace },
    workspaces,
    workbench: { workbench },
    docs: current.docs,
    boards: current.boards,
    guard: current.guard,
  }))
    state.services.set(token, service);
});

describe('route driven project tabs', () => {
  test('distinguishes unverified tabs with safe ordinals without exposing saved titles', () => {
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', title: 'secret one' })
    );
    recordProjectTab(
      saved({
        workspaceId: 'two',
        flavour: 'server',
        rootId: 'second',
        currentDocId: 'second',
        title: 'secret two',
      })
    );
    render(<ProjectTabs />);
    for (const label of ['工程 1', '工程 2']) {
      const tab = screen.getByRole('tab', { name: label });
      expect(tab.textContent).toBe(label);
      expect(tab.getAttribute('title')).toContain(
        '切换时验证工作区与工程读取权限'
      );
      expect(
        screen.getByRole('button', { name: '关闭工程标签：' + label })
      ).toBeTruthy();
    }
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.getByTestId('project-tabs').innerHTML).not.toMatch(
      /secret|two-root|two-second|two workspace|待验证/
    );
    const active = screen.getByRole('tab', { name: 'one-root' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.getAttribute('title')).toContain('one workspace');
    expect(active.getAttribute('title')).not.toContain('切换时验证');
    expect(workspaces.open).not.toHaveBeenCalled();
    expect(remote.workspace.engine.doc.waitForDocReady).not.toHaveBeenCalled();
    expect(remote.guard.can).not.toHaveBeenCalled();
    expect(remote.guard.can$).not.toHaveBeenCalled();
  });
  test('missing ancestry masks same-workspace labels and prevents navigation', async () => {
    workbench.location$.next({ pathname: '/all', key: 'all' });
    current.boards.getPath = id => ({
      ids: id === 'child' ? ['root', 'missing', 'child'] : [id],
      problem: null,
    });
    recordProjectTab(saved({ currentDocId: 'child' }));
    render(<ProjectTabs />);
    expect(screen.queryByRole('tab', { name: 'one-root' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(current.guard.can).toHaveBeenCalledWith('Doc_Read', 'missing');
    expect(workbench.open).not.toHaveBeenCalled();
  });
  test('middle-ancestor revocation immediately hides a previously verified title', async () => {
    workbench.location$.next({ pathname: '/all', key: 'all' });
    current.boards.getPath = id => ({
      ids: id === 'child' ? ['root', 'second', 'child'] : [id],
      problem: null,
    });
    recordProjectTab(saved({ currentDocId: 'child' }));
    render(<ProjectTabs />);
    await screen.findByRole('tab', { name: 'one-root' });
    await act(async () => current.permissions.get('second')!.next(false));
    expect(screen.queryByRole('tab', { name: 'one-root' })).toBeNull();
    expect(screen.getByRole('tab', { name: '工程 1' })).toBeTruthy();
  });
  test('missing ancestor cannot pass merely because cached read permission is true', async () => {
    remote.boards.getPath = id => ({
      ids: id === 'child' ? ['root', 'missing', 'child'] : [id],
      problem: null,
    });
    remote.guard.can.mockResolvedValue(true);
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
    );
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(state.jump).not.toHaveBeenCalled();
  });
  test('denied middle ancestor prevents cross-workspace navigation', async () => {
    remote.boards.getPath = id => ({
      ids: id === 'child' ? ['root', 'second', 'child'] : [id],
      problem: null,
    });
    remote.permissions.get('second')!.next(false);
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
    );
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(remote.guard.can).toHaveBeenCalledWith('Doc_Read', 'second');
    expect(state.jump).not.toHaveBeenCalled();
  });
  test('rejects path changes while permissions are pending even with the same root', async () => {
    const originalPath = remote.boards.getPath;
    remote.guard.can.mockImplementation(async () => {
      remote.boards.getPath = docId => ({
        ids: docId === 'child' ? ['root', 'second', 'child'] : [docId],
        problem: null,
      });
      return true;
    });
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
    );
    expect(originalPath('child').ids).toEqual(['root', 'child']);
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(state.jump).not.toHaveBeenCalled();
  });
  test.each(['trashed', 'missing'])(
    'falls back from %s last child to separately validated root',
    async status => {
      if (status === 'trashed')
        remote.records.get('child')!.trash$.value = true;
      else remote.records.delete('child');
      recordProjectTab(
        saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
      );
      render(<ProjectTabs />);
      fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
      await waitFor(() =>
        expect(state.jump).toHaveBeenCalledWith('two', 'root', 'edgeless')
      );
      expect(remote.guard.can).toHaveBeenCalledWith('Doc_Read', 'root');
      expect(remote.guard.can).not.toHaveBeenCalledWith('Doc_Read', 'child');
      expect(
        workspaces.open.mock.results[0].value.dispose
      ).toHaveBeenCalledTimes(1);
    }
  );
  test('never falls back to a denied project root', async () => {
    remote.records.get('child')!.trash$.value = true;
    remote.permissions.get('root')!.next(false);
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
    );
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(state.jump).not.toHaveBeenCalled();
  });
  test('tracks roots and children, reacts to root rename, and preserves separate projects', async () => {
    render(<ProjectTabs />);
    await screen.findByRole('tab', { name: 'one-root' });
    await act(async () =>
      workbench.location$.next({ pathname: '/child', key: 'child' })
    );
    expect(projectTabsStore.tabs$.value).toHaveLength(1);
    expect(projectTabsStore.tabs$.value[0].currentDocId).toBe('child');
    await act(async () => {
      current.records.get('root')!.title$.value = 'renamed';
      current.titles.next([]);
    });
    expect(screen.getByRole('tab', { name: 'renamed' })).toBeTruthy();
    await act(async () =>
      workbench.location$.next({ pathname: '/second', key: 'second' })
    );
    expect(projectTabsStore.tabs$.value).toHaveLength(2);
    expect(
      screen
        .getByRole('tab', { name: 'one-second' })
        .getAttribute('aria-selected')
    ).toBe('true');
  });
  test('does not open saved workspaces or reveal cached remote labels; uses target guard on click', async () => {
    recordProjectTab(
      saved({ workspaceId: 'two', flavour: 'server', currentDocId: 'child' })
    );
    render(<ProjectTabs />);
    expect(screen.queryByText('cached secret')).toBeNull();
    expect(workspaces.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await waitFor(() =>
      expect(state.jump).toHaveBeenCalledWith('two', 'child', 'edgeless')
    );
    expect(remote.guard.can).toHaveBeenCalledWith('Doc_Read', 'root');
    expect(remote.guard.can).toHaveBeenCalledWith('Doc_Read', 'child');
    expect(current.guard.can).not.toHaveBeenCalled();
    expect(workspaces.open.mock.results[0].value.dispose).toHaveBeenCalledTimes(
      1
    );
  });
  test('fails closed on target permission denial and never shows its cached title', async () => {
    remote.permissions.get('root')!.next(false);
    recordProjectTab(saved({ workspaceId: 'two', flavour: 'server' }));
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(state.jump).not.toHaveBeenCalled();
    expect(screen.queryByText('cached secret')).toBeNull();
    expect(workspaces.open.mock.results[0].value.dispose).toHaveBeenCalledTimes(
      1
    );
  });
  test('revocation and removed workspace immediately mask labels', async () => {
    render(<ProjectTabs />);
    await screen.findByRole('tab', { name: 'one-root' });
    await act(async () => current.permissions.get('root')!.next(false));
    expect(screen.queryByRole('tab', { name: 'one-root' })).toBeNull();
    expect(screen.getByRole('tab', { name: '工程 1' })).toBeTruthy();
    await act(async () => {
      current.permissions.get('root')!.next(true);
      workspaces.list.workspaces$.next([]);
    });
    expect(screen.queryByRole('tab', { name: 'one-root' })).toBeNull();
  });
  test('closing active tab opens nearest remaining document and does not auto reopen old route', async () => {
    recordProjectTab(saved());
    recordProjectTab(saved({ rootId: 'second', currentDocId: 'second' }));
    render(<ProjectTabs />);
    fireEvent.click(
      await screen.findByRole('button', { name: '关闭工程标签：one-root' })
    );
    await waitFor(() =>
      expect(workbench.open).toHaveBeenCalledWith({
        pathname: '/second',
        search: '?mode=edgeless',
      })
    );
    expect(projectTabsStore.tabs$.value.map(tab => tab.rootId)).toEqual([
      'second',
    ]);
    await act(async () => current.titles.next([]));
    expect(projectTabsStore.tabs$.value.map(tab => tab.rootId)).toEqual([
      'second',
    ]);
  });
  test('closing last tab falls back to all docs; keyboard arrows and Delete work', async () => {
    recordProjectTab(saved({ rootId: 'second', currentDocId: 'second' }));
    render(<ProjectTabs />);
    const root = await screen.findByRole('tab', { name: 'one-root' });
    root.focus();
    fireEvent.keyDown(root, { key: 'Home' });
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'one-second' })
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Delete' });
    expect(workbench.open).not.toHaveBeenCalled();
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(workbench.open).toHaveBeenCalledWith('/all');
    expect(projectTabsStore.tabs$.value).toEqual([]);
  });
  test('keyboard navigation wraps and scrolls focused tabs without opening workspaces', () => {
    recordProjectTab(saved({ workspaceId: 'two', flavour: 'server' }));
    recordProjectTab(saved({ rootId: 'second', currentDocId: 'second' }));
    render(<ProjectTabs />);
    const tabs = screen.getAllByRole('tab');
    const scroll = tabs.map(tab => {
      const spy = vi.fn();
      tab.scrollIntoView = spy;
      return spy;
    });
    const last = tabs.length - 1;
    tabs[last].focus();
    for (const [key, index] of [
      ['ArrowRight', 0],
      ['ArrowLeft', last],
      ['Home', 0],
      ['End', last],
    ] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(document.activeElement).toBe(tabs[index]);
      expect(scroll[index]).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
      });
    }
    expect(workspaces.open).not.toHaveBeenCalled();
    expect(workbench.open).not.toHaveBeenCalled();
    expect(state.jump).not.toHaveBeenCalled();
    const close = screen.getByRole('button', {
      name: '关闭工程标签：工程 1',
    });
    close.focus();
    expect(document.activeElement).toBe(close);
  });
  test('shared mode neither exposes nor records local project history', () => {
    current.workspace.openOptions.isSharedMode = true;
    recordProjectTab(saved({ workspaceId: 'two', flavour: 'server' }));
    render(<ProjectTabs />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(projectTabsStore.tabs$.value).toHaveLength(1);
    expect(workspaces.open).not.toHaveBeenCalled();
  });
  test('rejects ambiguous native workspace IDs instead of crossing server identities', async () => {
    workspaces.list.workspaces$.next([
      { id: 'one', flavour: 'local' },
      { id: 'two', flavour: 'server' },
      { id: 'two', flavour: 'other-server' },
    ]);
    recordProjectTab(saved({ workspaceId: 'two', flavour: 'server' }));
    render(<ProjectTabs />);
    fireEvent.click(screen.getByRole('tab', { name: '工程 1' }));
    await screen.findByRole('alert');
    expect(workspaces.open).not.toHaveBeenCalled();
    expect(state.jump).not.toHaveBeenCalled();
  });
});
