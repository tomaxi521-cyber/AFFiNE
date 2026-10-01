import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { DocsService } from '@affine/core/modules/doc';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  WorkspaceService,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { combineLatest, map, of } from 'rxjs';

import {
  nearestProjectTab,
  projectDocId,
  projectKey,
  projectTabsStore,
  recordProjectTab,
  type ProjectTab,
} from './project-tabs-store';
import { DikwWorkbenchService } from './service';
import * as styles from './project-tabs.css';

const runtimeNotice =
  '仅恢复本机导航；画布视角由原生编辑器保存。切换工程可能重置嵌入应用运行态。';

/** A route-driven local tab strip, not a second editor/iframe keepalive system. */
export function ProjectTabs() {
  const workspace = useService(WorkspaceService).workspace;
  const workspaces = useService(WorkspacesService);
  const docs = useService(DocsService);
  const guard = useService(GuardService);
  const boards = useService(DikwWorkbenchService);
  const workbench = useService(WorkbenchService).workbench;
  const { jumpToPageBlock } = useNavigateHelper();
  const tabs = useLiveData(projectTabsStore.tabs$);
  const location = useLiveData(workbench.location$);
  const workspaceList = useLiveData(workspaces.list.workspaces$);
  const workspaceName = useLiveData(workspace.name$);
  const relations = useLiveData(boards.relations$);
  const docIds = useLiveData(docs.list.nonTrashDocsIds$);
  const titles$ = useMemo(() => LiveData.from(docs.allDocTitle$(), []), [docs]);
  const titles = useLiveData(titles$);
  const docId = projectDocId(location.pathname);
  const path = useMemo(
    () => (docId ? boards.getPath(docId) : undefined),
    [boards, docId, relations]
  );
  const rootId = path && !path.problem ? path.ids[0] : undefined;
  const routeKey = JSON.stringify([
    workspace.flavour,
    workspace.id,
    location.pathname,
    location.key,
  ]);
  const routeRef = useRef(routeKey);
  routeRef.current = routeKey;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ cancel: () => void } | undefined>(undefined);
  const strip = useRef<HTMLDivElement>(null);

  const sameWorkspace = (tab: ProjectTab) =>
    tab.workspaceId === workspace.id && tab.flavour === workspace.flavour;
  const existsWorkspace = (tab: ProjectTab) =>
    workspaceList.some(
      meta => meta.id === tab.workspaceId && meta.flavour === tab.flavour
    );
  // Never ask the active guard about another workspace's IDs. Inactive labels
  // stay generic until that workspace becomes active; no eager workspace opens.
  const permissionIdsKey = JSON.stringify(
    [
      ...new Set([
        ...(path?.problem === null ? path.ids : []),
        ...tabs
          .filter(sameWorkspace)
          .flatMap(tab => boards.getPath(tab.currentDocId).ids),
      ]),
    ].sort()
  );
  const permissionIds = useMemo<string[]>(
    () => JSON.parse(permissionIdsKey),
    [permissionIdsKey]
  );
  const readable$ = useMemo(
    () =>
      LiveData.from(
        permissionIds.length
          ? combineLatest(
              permissionIds.map(id => guard.can$('Doc_Read', id))
            ).pipe(
              map(
                values =>
                  new Set(permissionIds.filter((_, i) => values[i] === true))
              )
            )
          : of(new Set<string>()),
        new Set<string>()
      ),
    [guard, permissionIds]
  );
  const readable = useLiveData(readable$);
  useEffect(() => {
    permissionIds.forEach(id => guard.revalidateCan('Doc_Read', id));
  }, [guard, permissionIds]);

  const activeKey = rootId
    ? projectKey({
        flavour: workspace.flavour,
        workspaceId: workspace.id,
        rootId,
      })
    : undefined;
  useEffect(() => {
    if (
      !projectTabsStore.observeRoute(routeKey) ||
      workspace.openOptions.isSharedMode ||
      !rootId ||
      !docId ||
      !path ||
      path.problem ||
      !workspaceList.some(
        meta => meta.id === workspace.id && meta.flavour === workspace.flavour
      ) ||
      !path.ids.every(id => readable.has(id) && docIds.includes(id))
    )
      return;
    recordProjectTab({
      flavour: workspace.flavour,
      workspaceId: workspace.id,
      rootId,
      currentDocId: docId,
      title: docs.list.doc$(rootId).value?.title$.value || '未命名工程',
    });
  }, [
    routeKey,
    workspace,
    rootId,
    docId,
    boards,
    relations,
    readable,
    docIds,
    titles,
    docs,
    workspaceList,
    tabs,
    path,
  ]);

  useEffect(() => {
    setError('');
    setBusy(false);
    pending.current?.cancel();
    pending.current = undefined;
    return () => pending.current?.cancel();
  }, [routeKey]);
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeKey, tabs.length]);

  const open = async (tab: ProjectTab): Promise<boolean> => {
    if (pending.current) return false;
    const startingRoute = routeRef.current;
    let cancelled = false;
    let release: (() => void) | undefined;
    const controller = new AbortController();
    const operation = {
      cancel: () => {
        cancelled = true;
        controller.abort();
        release?.();
        release = undefined;
      },
    };
    pending.current = operation;
    setBusy(true);
    setError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const currentList = workspaces.list.workspaces$.value;
      const matches = currentList.filter(meta => meta.id === tab.workspaceId);
      // Native routes and the repository pool key by ID only. Fail closed on
      // ambiguous identities instead of silently opening a different server.
      if (
        matches.length !== 1 ||
        matches[0].flavour !== tab.flavour ||
        workspace.openOptions.isSharedMode
      ) {
        throw new Error('Workspace unavailable');
      }
      let target = workspace;
      if (!sameWorkspace(tab)) {
        const opened = workspaces.open({ metadata: matches[0] });
        target = opened.workspace;
        release = opened.dispose;
      }
      if (target.id !== tab.workspaceId || target.flavour !== tab.flavour)
        throw new Error('Workspace identity mismatch');
      await target.engine.doc.waitForDocReady(target.id, controller.signal);
      if (
        cancelled ||
        controller.signal.aborted ||
        routeRef.current !== startingRoute
      )
        return false;
      const targetGuard = target.scope.get(GuardService);
      const targetDocs = target.scope.get(DocsService);
      const targetBoards = target.scope.get(DikwWorkbenchService);
      // A removed last child must not strand a still-readable project. Only a
      // missing/trashed leaf falls back; denied or corrupt ancestry fails closed.
      const destination =
        targetDocs.list.doc$(tab.currentDocId).value?.trash$.value === false
          ? tab.currentDocId
          : tab.rootId;
      const initialPath = targetBoards.getPath(destination);
      if (
        initialPath.problem ||
        initialPath.ids[0] !== tab.rootId ||
        initialPath.ids.at(-1) !== destination
      )
        throw new Error('Project unavailable');
      const ids = [...initialPath.ids];
      const abort = new Promise<never>((_, reject) => {
        if (controller.signal.aborted)
          reject(new Error('Navigation cancelled'));
        else
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error('Navigation cancelled')),
            { once: true }
          );
      });
      const allowed = await Promise.race([
        Promise.all(ids.map(id => targetGuard.can('Doc_Read', id))),
        abort,
      ]);
      const latestPath = targetBoards.getPath(destination);
      const latestWorkspaces = workspaces.list.workspaces$.value.filter(
        meta => meta.id === tab.workspaceId
      );
      if (
        allowed.some(value => value !== true) ||
        ids.some(
          id => targetDocs.list.doc$(id).value?.trash$.value !== false
        ) ||
        latestPath.problem ||
        latestPath.ids[0] !== tab.rootId ||
        JSON.stringify(latestPath.ids) !== JSON.stringify(ids) ||
        latestWorkspaces.length !== 1 ||
        latestWorkspaces[0].flavour !== tab.flavour
      ) {
        throw new Error('Project unavailable');
      }
      if (
        cancelled ||
        controller.signal.aborted ||
        routeRef.current !== startingRoute
      )
        return false;
      if (sameWorkspace(tab))
        workbench.open({
          pathname: '/' + encodeURIComponent(destination),
          search: '?mode=edgeless',
        });
      else jumpToPageBlock(tab.workspaceId, destination, 'edgeless');
      return true;
    } catch {
      if (!cancelled && routeRef.current === startingRoute)
        setError('无法打开工程，请检查工作区、读取权限与同步状态。');
      return false;
    } finally {
      clearTimeout(timeout);
      release?.();
      if (pending.current === operation) {
        pending.current = undefined;
        if (!cancelled) setBusy(false);
      }
    }
  };

  const close = (tab: ProjectTab) => {
    const key = projectKey(tab);
    const isActive = key === activeKey;
    const neighbour = nearestProjectTab(tabs, key);
    projectTabsStore.close(key, isActive ? routeKey : undefined);
    if (isActive) {
      if (neighbour)
        void open(neighbour).then(opened => {
          if (!opened && routeRef.current === routeKey) workbench.open('/all');
        });
      else workbench.open('/all');
    }
    const nextKey = neighbour && projectKey(neighbour);
    requestAnimationFrame(() => {
      const buttons =
        strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      Array.from(buttons ?? [])
        .find(button => button.dataset.projectKey === nextKey)
        ?.focus();
    });
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tab: ProjectTab
  ) => {
    if (event.key === 'Delete' && !busy) {
      event.preventDefault();
      close(tab);
      return;
    }
    const buttons = Array.from(
      strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const index = buttons.indexOf(event.currentTarget);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
    buttons[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  // Shared viewers must not expose local navigation history or mutate documents.
  if (workspace.openOptions.isSharedMode || tabs.length === 0) return null;
  return (
    <div className={styles.container} data-testid="project-tabs">
      <div
        className={styles.strip}
        ref={strip}
        role="tablist"
        aria-label="已打开的工程"
        aria-orientation="horizontal"
        aria-busy={busy}
      >
        {tabs.map((tab, index) => {
          const key = projectKey(tab);
          const tabPath = sameWorkspace(tab)
            ? boards.getPath(tab.currentDocId)
            : undefined;
          const verified =
            sameWorkspace(tab) &&
            existsWorkspace(tab) &&
            tabPath?.problem === null &&
            tabPath.ids[0] === tab.rootId &&
            tabPath.ids.at(-1) === tab.currentDocId &&
            tabPath.ids.every(
              id =>
                readable.has(id) &&
                docIds.includes(id) &&
                docs.list.doc$(id).value?.trash$.value === false
            );
          const label = verified
            ? docs.list.doc$(tab.rootId).value?.title$.value || '未命名工程'
            : '工程 ' + (index + 1) + '（待验证）';
          const workspaceLabel = verified
            ? workspaceName || '未命名工作区'
            : '工作区待验证';
          const selected = activeKey === key;
          return (
            <div
              role="presentation"
              className={styles.tab}
              data-active={selected}
              key={key}
            >
              <button
                type="button"
                role="tab"
                className={styles.select}
                aria-selected={selected}
                data-project-key={key}
                tabIndex={
                  selected ||
                  (!tabs.some(item => projectKey(item) === activeKey) &&
                    index === 0)
                    ? 0
                    : -1
                }
                title={label + ' · ' + workspaceLabel + ' — ' + runtimeNotice}
                onKeyDown={event => onKeyDown(event, tab)}
                onClick={() => {
                  if (!busy) void open(tab);
                }}
              >
                <span className={styles.label}>{label}</span>
              </button>
              <button
                type="button"
                className={styles.close}
                aria-label={'关闭工程标签：' + label}
                title="关闭标签（不删除工程）"
                disabled={busy}
                onClick={() => close(tab)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
