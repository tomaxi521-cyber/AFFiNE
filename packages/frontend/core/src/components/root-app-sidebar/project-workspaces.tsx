import { useWorkspace } from '@affine/core/components/hooks/use-workspace';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { AuthService, DefaultServerService } from '@affine/core/modules/cloud';
import { ServerFeature } from '@affine/graphql';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { DikwWorkbenchService } from '@affine/core/modules/dikw-workbench';
import { useReadableDocIds } from '@affine/core/modules/dikw-workbench/connected-navigation';
import { sidebarBoardRows } from '@affine/core/modules/dikw-workbench/sidebar-tree';
import { GuardService } from '@affine/core/modules/permissions';
import {
  WorkspaceService,
  WorkspacesService,
  type WorkspaceMetadata,
} from '@affine/core/modules/workspace';
import {
  FrameworkScope,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import {
  FolderIcon,
  EdgelessIcon,
  PageIcon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import { createPortal } from 'react-dom';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as styles from './project-workspaces.css';
import { map } from 'rxjs';
import { createContext, useContext } from 'react';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { projectDocId } from '@affine/core/modules/dikw-workbench/project-tabs-store';
const ActiveProjectContext = createContext({
  workspace: '',
  doc: undefined as string | undefined,
});

const identity = (m: WorkspaceMetadata) => JSON.stringify([m.flavour, m.id]);
function useExpanded(key: string, initial: string[] = []) {
  const [expanded, set] = useState<Set<string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return new Set(
        Array.isArray(v)
          ? v
              .slice(0, 500)
              .filter(x => typeof x === 'string' && x.length <= 4096)
          : initial
      );
    } catch {
      return new Set(initial);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...expanded]));
    } catch {}
  }, [expanded, key]);
  return {
    expanded,
    toggle: (id: string) =>
      set(old => {
        const next = new Set(old);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
  };
}
export function ProjectWorkspaces() {
  const manager = useService(WorkspacesService),
    active = useService(WorkspaceService).workspace;
  const items = useLiveData(manager.list.workspaces$);
  const session = useLiveData(useService(AuthService).session.session$);
  const defaultServer = useService(DefaultServerService);
  const location = useLiveData(
    useService(WorkbenchService).workbench.location$
  );
  const activeRoute = {
    workspace: identity(active.meta),
    doc: projectDocId(location.pathname),
  };
  const dialogs = useService(GlobalDialogService),
    navigate = useNavigateHelper();
  const { expanded, toggle } = useExpanded('dikw:workspace-folders:v1', [
    identity(active.meta),
  ]);
  return (
    <ActiveProjectContext.Provider value={activeRoute}>
      <nav
        className={styles.navigation}
        aria-label="工作区与工程"
        data-testid="dikw-project-navigation"
      >
        <div className={styles.header}>
          <span style={{ flex: 1 }}>工作区</span>
          <button
            className={styles.button + ' ' + styles.iconButton}
            aria-label="新建工作区"
            title="新建工作区"
            onClick={() => {
              const enableLocal =
                BUILD_CONFIG.isNative ||
                defaultServer.server.config$.value.features.includes(
                  ServerFeature.LocalWorkspace
                );
              if (session.status !== 'authenticated' && !enableLocal) {
                dialogs.open('sign-in', {});
                return;
              }
              dialogs.open('create-workspace', {}, result => {
                if (result) navigate.jumpToPage(result.metadata.id, 'board');
              });
            }}
          >
            <PlusIcon width={16} height={16} aria-hidden="true" />
          </button>
        </div>
        {items.map(meta => (
          <WorkspaceFolder
            key={identity(meta)}
            meta={meta}
            ambiguous={items.filter(item => item.id === meta.id).length !== 1}
            activeId={identity(active.meta)}
            expanded={expanded.has(identity(meta))}
            toggle={() => toggle(identity(meta))}
          />
        ))}
      </nav>
    </ActiveProjectContext.Provider>
  );
}
function WorkspaceFolder({
  meta,
  activeId,
  ambiguous,
  expanded,
  toggle,
}: {
  meta: WorkspaceMetadata;
  activeId: string;
  ambiguous: boolean;
  expanded: boolean;
  toggle: () => void;
}) {
  const profile = useWorkspaceInfo(meta),
    name = profile?.name || '工作区';
  const navigate = useNavigateHelper();
  // Portal only the scoped create control: collapsed folders still open no engine.
  const [actionsHost, setActionsHost] = useState<HTMLSpanElement | null>(null);
  return (
    <section className={styles.folder} data-workspace-id={meta.id}>
      <div className={styles.row} data-active={identity(meta) === activeId}>
        <button
          className={styles.button + ' ' + styles.iconButton}
          aria-label={(expanded ? '收起' : '展开') + name}
          aria-expanded={expanded}
          onClick={toggle}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          className={styles.button + ' ' + styles.label}
          onClick={toggle}
          title={name}
        >
          <FolderIcon
            className={styles.icon}
            width={16}
            height={16}
            aria-hidden="true"
          />
          <span className={styles.title}>{name}</span>
        </button>
        <span className={styles.actions}>
          <button
            className={styles.button + ' ' + styles.iconButton}
            aria-label="已有内容与文档"
            title="已有内容与文档：原知识库、产物库和未归属文档均保留在这里"
            disabled={ambiguous}
            onClick={() => navigate.jumpToPage(meta.id, 'all')}
          >
            <PageIcon width={16} height={16} aria-hidden="true" />
          </button>
          <span className={styles.actionSlot} ref={setActionsHost} />
        </span>
      </div>
      {expanded &&
        (ambiguous ? (
          <p role="alert">工作区标识冲突，已禁止打开以保护内容。</p>
        ) : (
          <WorkspaceContents meta={meta} actionsHost={actionsHost} />
        ))}
    </section>
  );
}
type WorkspaceContentsProps = {
  meta: WorkspaceMetadata;
  actionsHost: HTMLSpanElement | null;
};
function WorkspaceContents({ meta, actionsHost }: WorkspaceContentsProps) {
  const workspace = useWorkspace(meta);
  if (!workspace)
    return (
      <p className={styles.small} role="status">
        正在加载工程…
      </p>
    );
  if (identity(workspace.meta) !== identity(meta))
    return <p role="alert">工作区身份不匹配</p>;
  return (
    <FrameworkScope scope={workspace.scope}>
      <ProjectTree meta={meta} actionsHost={actionsHost} />
    </FrameworkScope>
  );
}
function ProjectTree({ meta, actionsHost }: WorkspaceContentsProps) {
  const service = useService(DikwWorkbenchService),
    docs = useService(DocsService),
    guard = useService(GuardService);
  const workspace = useService(WorkspaceService).workspace;
  const ready$ = useMemo(
    () =>
      LiveData.from(
        workspace.engine.doc.docState$(workspace.id).pipe(map(v => v.ready)),
        false
      ),
    [workspace]
  );
  const ready = useLiveData(ready$);
  const canCreate = useLiveData(guard.can$('Workspace_CreateDoc'));
  useEffect(() => {
    guard.revalidateCan('Workspace_CreateDoc');
  }, [guard]);
  const activeRoute = useContext(ActiveProjectContext);
  const manager = useService(WorkspacesService);
  const retain = () => {
    if (
      manager.list.workspaces$.value.filter(item => item.id === meta.id)
        .length !== 1
    )
      throw new Error('工作区标识冲突');
    const ref = manager.open({ metadata: meta });
    if (identity(ref.workspace.meta) !== identity(meta)) {
      ref.dispose();
      throw new Error('工作区身份不匹配');
    }
    return ref;
  };
  const navigate = useNavigateHelper();
  const relations = useLiveData(service.relations$),
    ids = useLiveData(docs.list.nonTrashDocsIds$);
  const readable = useReadableDocIds(ids),
    visible = useMemo(
      () => new Set(ids.filter(id => readable.has(id))),
      [ids, readable]
    );
  const titles$ = useMemo(() => LiveData.from(docs.allDocTitle$(), []), [docs]);
  useLiveData(titles$);
  const { expanded, toggle } = useExpanded(
    'dikw:project-tree:v1:' + identity(meta)
  );
  const rows = sidebarBoardRows(relations, visible, expanded);
  const [creating, setCreating] = useState(false),
    [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const operation = useRef<{ title: string; id: string } | null>(null);
  const pendingKey = 'dikw:project-create:v1:' + identity(meta);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      if (raw && typeof raw.id === 'string' && typeof raw.title === 'string') {
        operation.current = raw;
        setTitle(raw.title);
        setCreating(true);
        setError('上次工程创建尚未确认，请重试原操作。');
      }
    } catch {
      setError('无法读取创建恢复记录');
    }
  }, [pendingKey]);
  const [rename, setRename] = useState<string | null>(null),
    [renameTitle, setRenameTitle] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const open = (id: string) =>
    navigate.jumpToPageBlock(meta.id, id, 'edgeless');

  const create = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    setError('');
    let ref: ReturnType<typeof retain> | undefined;
    try {
      ref = retain();
      if (operation.current && operation.current.title !== title.trim())
        throw new Error('请使用原名称重试未完成的创建。');
      if ((await guard.can('Workspace_CreateDoc')) !== true)
        throw new Error('没有创建工程权限');
      const op = operation.current ?? { title: title.trim(), id: nanoid() };
      localStorage.setItem(pendingKey, JSON.stringify(op));
      operation.current = op;
      const id = await service.createProject(op.title, op.id);
      operation.current = null;
      localStorage.removeItem(pendingKey);
      if (alive.current) {
        setCreating(false);
        setTitle('');
        open(id);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : '创建失败，请使用原名称重试');
    } finally {
      ref?.dispose();
      if (alive.current) setBusy(false);
    }
  };
  const renameDoc = async () => {
    if (!rename || !renameTitle.trim() || busy) return;
    setBusy(true);
    setError('');
    let opened: ReturnType<DocsService['open']> | undefined;
    let ref: ReturnType<typeof retain> | undefined;
    try {
      ref = retain();
      if ((await guard.can('Doc_Update', rename)) !== true)
        throw new Error('没有改名权限');
      opened = docs.open(rename);
      await opened.doc.waitForSyncReady();
      if ((await guard.can('Doc_Update', rename)) !== true)
        throw new Error('权限已改变');
      if (
        !alive.current ||
        workspace.openOptions.isSharedMode ||
        opened.doc.blockSuiteDoc.readonly
      )
        return;
      opened.doc.changeDocTitle(renameTitle.trim());
      await workspace.engine.doc.waitForUpdated(rename);
      await workspace.engine.doc.waitForUpdated(workspace.id);
      if (alive.current) setRename(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : '改名失败');
    } finally {
      opened?.release();
      ref?.dispose();
      if (alive.current) setBusy(false);
    }
  };
  if (!ready)
    return (
      <p className={styles.small} role="status">
        正在同步工程列表…
      </p>
    );
  return (
    <div className={styles.tree}>
      {actionsHost &&
        createPortal(
          <button
            className={styles.button + ' ' + styles.iconButton}
            data-testid="dikw-create-project"
            aria-label="新建工程"
            title="新建工程"
            disabled={canCreate !== true || workspace.openOptions.isSharedMode}
            onClick={() => setCreating(true)}
          >
            <PlusIcon width={16} height={16} aria-hidden="true" />
          </button>,
          actionsHost
        )}
      {rows.map(row => {
        const name = docs.list.doc$(row.id).value?.title$.value || '未命名工程';
        return (
          <div key={row.id} data-project-board-id={row.id}>
            <div
              className={styles.row}
              style={{ paddingLeft: Math.min(row.depth, 8) * 12 }}
              data-active={
                activeRoute.workspace === identity(meta) &&
                activeRoute.doc === row.id
              }
            >
              {row.hasChildren ? (
                <button
                  className={styles.button + ' ' + styles.iconButton}
                  aria-label={(expanded.has(row.id) ? '收起' : '展开') + name}
                  aria-expanded={expanded.has(row.id)}
                  onClick={() => toggle(row.id)}
                >
                  {expanded.has(row.id) ? '▾' : '▸'}
                </button>
              ) : (
                <span className={styles.indent} aria-hidden="true" />
              )}
              <button
                className={styles.button + ' ' + styles.label}
                data-testid={row.depth === 0 ? 'dikw-main-board' : undefined}
                title={name}
                onClick={() => open(row.id)}
              >
                <EdgelessIcon
                  className={styles.icon}
                  width={16}
                  height={16}
                  aria-hidden="true"
                />
                <span className={styles.title}>{name}</span>
              </button>
              <button
                className={
                  styles.button +
                  ' ' +
                  styles.iconButton +
                  ' ' +
                  styles.rowAction
                }
                aria-label={'重命名' + name}
                title="重命名"
                onClick={() => {
                  setRename(row.id);
                  setRenameTitle(name);
                }}
              >
                ⋯
              </button>
            </div>
            {rename === row.id && (
              <form
                className={styles.form}
                onSubmit={e => {
                  e.preventDefault();
                  void renameDoc();
                }}
              >
                <input
                  className={styles.input}
                  aria-label="工程或白板名称"
                  value={renameTitle}
                  onChange={e => setRenameTitle(e.target.value)}
                  autoFocus
                />
                <button className={styles.button} disabled={busy}>
                  保存
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => setRename(null)}
                >
                  取消
                </button>
              </form>
            )}
          </div>
        );
      })}
      {!rows.length && <p className={styles.small}>暂无可读取的工程</p>}
      {creating && (
        <form
          className={styles.form}
          onSubmit={e => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            className={styles.input}
            aria-label="新工程名称"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
          <button className={styles.button} disabled={busy || !title.trim()}>
            {busy ? '正在创建…' : '创建工程'}
          </button>
          <button
            className={styles.button}
            type="button"
            disabled={busy}
            onClick={() => {
              if (operation.current) {
                localStorage.setItem(
                  pendingKey + ':recovery:' + operation.current.id,
                  JSON.stringify(operation.current)
                );
                localStorage.removeItem(pendingKey);
                operation.current = null;
              }
              setCreating(false);
              setTitle('');
              setError('');
            }}
          >
            {operation.current ? '保留记录并关闭' : '取消'}
          </button>
          {operation.current && (
            <p className={styles.small}>
              恢复编号：{operation.current.id}
              。关闭只保留恢复记录，不删除或重新初始化内容。
            </p>
          )}
        </form>
      )}
      {error && (
        <p className={styles.small} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
