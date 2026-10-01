import { useGuard } from '@affine/core/components/guard';
import { DocsService } from '@affine/core/modules/doc';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { combineLatest, map, of } from 'rxjs';

import { DikwChildCreationError, DikwWorkbenchService } from './service';
import { BoardNavigation } from './views';

/** Keep denied and unresolved records out of labels as well as destinations. */
export function useReadableDocIds(ids: readonly string[]) {
  const guard = useService(GuardService);
  const idsKey = JSON.stringify(ids);
  const stableIds = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey]);
  const readable$ = useMemo(() => LiveData.from(
    stableIds.length ? combineLatest(stableIds.map(id => guard.can$('Doc_Read', id))).pipe(
      map(values => new Set(stableIds.filter((_, index) => values[index] === true)))
    ) : of(new Set<string>()),
    new Set<string>()
  ), [guard, stableIds]);
  useEffect(() => {
    stableIds.forEach(id => guard.revalidateCan('Doc_Read', id));
  }, [guard, stableIds]);
  return useLiveData(readable$);
}

type PendingChild = { title: string; id: string; docId?: string };

/** Reset local attempts when the host switches documents; no stale completion navigation. */
export function ConnectedBoardNavigation(props: { docId: string; readonly: boolean; canvasTools?: boolean; actionsOnly?: boolean }) {
  return <NavigationContent key={props.docId} {...props} />;
}

function NavigationContent({ docId, readonly, canvasTools, actionsOnly }: { docId: string; readonly: boolean; canvasTools?: boolean; actionsOnly?: boolean }) {
  const service = useService(DikwWorkbenchService);
  const docs = useService(DocsService);
  const guard = useService(GuardService);
  const workspace = useService(WorkspaceService).workspace;
  const workbench = useService(WorkbenchService).workbench;
  const relations = useLiveData(service.relations$);
  const ids = useLiveData(docs.list.nonTrashDocsIds$);
  const readable = useReadableDocIds(ids);
  const titles$ = useMemo(() => LiveData.from(docs.allDocTitle$(), []), [docs]);
  useLiveData(titles$);
  const canCreate = useGuard('Workspace_CreateDoc');
  const canUpdate = useGuard('Doc_Update', docId);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChild | null>(null);
  const pendingRef = useRef<PendingChild | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const mounted = useRef(false);
  const selectId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const exists = (id: string) => docs.list.doc$(id).value?.trash$.value === false;
  const navigate = async (id: string) => {
    if (!exists(id) || await guard.can('Doc_Read', id) !== true || !exists(id)) {
      throw new Error('白板不存在、已删除或无读取权限。');
    }
    if (mounted.current) workbench.open({ pathname: '/' + id, search: '?mode=edgeless' });
  };
  const safeNavigate = (id: string) => {
    void navigate(id).catch(() => {
      if (mounted.current) setError('无法打开白板，请检查读取权限与同步状态。');
    });
  };
  const create = async (title: string) => {
    if (locked.current) throw new Error('正在处理，请稍候。');
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      // A failure here is provably pre-reservation: no service call has started.
      if (readonly || workspace.openOptions.isSharedMode || !exists(docId) ||
          await guard.can('Workspace_CreateDoc') !== true ||
          await guard.can('Doc_Update', docId) !== true || !exists(docId)) {
        throw new Error(pendingRef.current
          ? '当前权限不足或父白板不可用。上次操作仍保留，请恢复权限后使用原名称重试。'
          : '没有创建权限或父白板不可用。未开始新操作，可修改名称后重试。');
      }
      if (pendingRef.current && pendingRef.current.title !== title) {
        throw new Error('上次操作状态尚未确认，请使用下方原名称恢复入口，勿重复创建。');
      }
      if (!mounted.current) throw new Error('已离开当前白板，未开始新操作。');
      const operation = pendingRef.current ?? { title, id: nanoid() };
      pendingRef.current = operation;
      setPending(operation);
      try {
        const id = await service.createChild(docId, title, operation.id);
        const created = { ...operation, docId: id };
        pendingRef.current = created;
        if (mounted.current) setPending(created);
        await navigate(id);
        pendingRef.current = null;
        if (mounted.current) setPending(null);
      } catch (cause) {
        if (cause instanceof DikwChildCreationError) {
          const partial = { ...operation, id: cause.operationId, docId: cause.docId };
          pendingRef.current = partial;
          if (mounted.current) setPending(partial);
        }
        // Unknown failures may already have reserved a document: retain the operation.
        throw cause;
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '操作状态未确认，请使用原操作重试。');
      throw cause;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  if (!relations.has(docId)) return null;
  const path = service.getPath(docId);
  const item = (id: string) => ({ id, title: docs.list.doc$(id).value?.title$.value || '未命名白板' });
  const completePath = !path.problem && path.ids.every(id => readable.has(id) && exists(id));
  const pathItems = completePath ? path.ids.map(item) : readable.has(docId) ? [item(docId)] : [];
  const writable = !readonly && !workspace.openOptions.isSharedMode && canUpdate === true;
  const options = ids.filter(id => id !== docId && readable.has(id) && exists(id));
  return <>
    <BoardNavigation canvasTools={canvasTools} actionsOnly={actionsOnly}
      path={pathItems}
      childrenList={service.getChildren(docId).filter(child => readable.has(child.docId) && exists(child.docId)).map(child => item(child.docId))}
      onNavigate={safeNavigate}
      canNavigate={completePath}
      canCreate={writable && canCreate === true && completePath}
      canReference={writable && readable.has(docId)}
      busy={busy}
      onReference={() => { setPickerOpen(true); setNotice(''); }}
      error={!completePath ? ['白板层级不完整或部分白板不可读取，已暂停层级导航与创建。', error].filter(Boolean).join(' ') : error}
      onCreateChild={create}
    />
    {pending && readable.has(docId) && <section aria-label="恢复子白板创建" style={{ padding: '8px 16px' }}>
      <p>待确认操作：{pending.title}。保留原名称与操作编号重试，不会自动删除已创建内容。</p>
      <p>操作编号：<code>{pending.id}</code></p>
      <button type="button" disabled={busy || !writable || canCreate !== true} onClick={() => { void create(pending.title).catch(() => {}); }}>重试原创建操作</button>
      {pending.docId && readable.has(pending.docId) && exists(pending.docId) &&
        <button type="button" disabled={busy} onClick={() => safeNavigate(pending.docId!)}>查看已创建白板</button>}
    </section>}
    {pickerOpen && readable.has(docId) && <form aria-label="引用已有文档" style={{ padding: '8px 16px' }} onSubmit={async event => {
      event.preventDefault();
      if (locked.current || !writable || !options.includes(target)) return;
      locked.current = true; setBusy(true); setError(null);
      try {
        await service.addReference(docId, target);
        if (mounted.current) { setNotice('引用已添加，内容归属与白板父子关系不变。'); setPickerOpen(false); setTarget(''); }
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : '添加引用失败，请重试。');
      } finally { locked.current = false; if (mounted.current) setBusy(false); }
    }}>
      <label htmlFor={selectId}>选择工作区已有文档</label>
      <select id={selectId} value={options.includes(target) ? target : ''} disabled={busy || !writable} onChange={event => setTarget(event.target.value)}>
        <option value="">请选择文档</option>
        {options.map(id => <option key={id} value={id}>{item(id).title}</option>)}
      </select>
      {!options.length && <p>暂无可读取的其他文档。</p>}
      <button type="submit" disabled={busy || !writable || !options.includes(target)}>添加引用</button>
      <button type="button" disabled={busy} onClick={() => setPickerOpen(false)}>取消</button>
      <p>这里只添加普通引用，不建立父子关系。</p>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </>;
}
