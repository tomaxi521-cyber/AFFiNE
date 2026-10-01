import { Button } from '@affine/component';
import { useGuard } from '@affine/core/components/guard';
import { DocsService } from '@affine/core/modules/doc';
import type { DocRecord } from '@affine/core/modules/doc/entities/record';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useReadableDocIds } from './connected-navigation';
import { ContentRepository, type ContentKind } from './content-repository';
import { DikwWorkbenchService } from './service';

function ContentRow({ record, destination, repository }: {
  record: DocRecord;
  destination: ContentKind;
  repository: ContentRepository;
}) {
  const title = useLiveData(record.title$);
  const trash = useLiveData(record.trash$);
  const canRead = useGuard('Doc_Read', record.id);
  const canAssign = useGuard('Doc_Properties_Update', record.id);
  const workspace = useService(WorkspaceService).workspace;
  const docs = useService(DocsService);
  const board = useService(DikwWorkbenchService);
  const guard = useService(GuardService);
  const workbench = useService(WorkbenchService).workbench;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const available = () => docs.list.doc$(record.id).value?.trash$.value === false && !board.relations$.value.has(record.id);
  if (canRead !== true || trash) return null;
  return <li style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '8px 0', alignItems: 'center' }}>
    <Button disabled={busy} onClick={() => {
      void (async () => {
        try {
          if (await guard.can('Doc_Read', record.id) !== true || !available()) throw new Error('文档不可用');
          if (mounted.current) workbench.openDoc(record.id);
        } catch { if (mounted.current) setError('无法打开文档，请检查权限与同步状态。'); }
      })();
    }}>{title || '未命名'}</Button>
    <Button disabled={busy || workspace.openOptions.isSharedMode || canAssign !== true} onClick={() => {
      if (locked.current) return;
      locked.current = true; setBusy(true); setError(null);
      void (async () => {
        try {
          if (workspace.openOptions.isSharedMode || !available() ||
              await guard.can('Doc_Read', record.id) !== true ||
              await guard.can('Doc_Properties_Update', record.id) !== true ||
              workspace.openOptions.isSharedMode || !available() || !mounted.current) {
            throw new Error('文档已删除、不可读取或无更改权限');
          }
          repository.assign(record.id, destination);
          await workspace.engine.doc.waitForUpdated(workspace.id);
        } catch {
          if (mounted.current) setError('归属更改未确认：请检查权限、元数据及保存状态。');
        } finally {
          locked.current = false;
          if (mounted.current) setBusy(false);
        }
      })();
    }}>归入{destination === 'knowledge' ? '知识库' : '产物库'}</Button>
    {busy && <span role="status">正在处理…</span>}
    {error && <span role="alert">{error}</span>}
  </li>;
}

export function Component() {
  const location = useLocation();
  const kind: ContentKind = location.pathname === '/artifacts' ? 'artifact' : 'knowledge';
  return <LibraryContent key={kind} kind={kind} />;
}

function LibraryContent({ kind }: { kind: ContentKind }) {
  const label = kind === 'knowledge' ? '知识库' : '产物库';
  const docs = useService(DocsService);
  const board = useService(DikwWorkbenchService);
  const guard = useService(GuardService);
  const workspace = useService(WorkspaceService).workspace;
  const workbench = useService(WorkbenchService).workbench;
  const repository = useMemo(() => new ContentRepository(workspace.rootYDoc), [workspace]);
  const [, setRevision] = useState(0);
  useEffect(() => repository.observe(() => setRevision(value => value + 1)), [repository]);
  const ids = useLiveData(docs.list.nonTrashDocsIds$);
  const readable = useReadableDocIds(ids);
  const relations = useLiveData(board.relations$);
  const canCreate = useGuard('Workspace_CreateDoc');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const composing = useRef(false);
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [partialId, setPartialId] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const availableRecords = ids.filter(id => readable.has(id) && !relations.has(id))
    .map(id => docs.list.doc$(id).value).filter((value): value is DocRecord => !!value);
  const records = availableRecords.filter(record => repository.getKind(record.id) === kind);
  const unassigned = availableRecords.filter(record => repository.getKind(record.id) === null);
  const blocked = busy || canCreate !== true || workspace.openOptions.isSharedMode;
  return <section style={{ padding: 24, overflow: 'auto' }} aria-label={label}>
    <h1>{label}</h1>
    <p>{kind === 'knowledge' ? '资料与笔记。白板引用不会改变内容归属。' : '报告与方案。这里的产物尚不代表已发布。'}</p>
    <form aria-label="新建库文档" onSubmit={async event => {
      event.preventDefault();
      if (submitting.current || composing.current || blocked || partialId || !title.trim()) return;
      const name = title.trim();
      submitting.current = true; setBusy(true); setError(null);
      let createdId: string | undefined;
      try {
        if (workspace.openOptions.isSharedMode || await guard.can('Workspace_CreateDoc') !== true || workspace.openOptions.isSharedMode || !mounted.current) {
          throw new Error('Permission denied');
        }
        // Native createDoc mutates before it returns and may throw afterwards.
        // Keep the random identity even for an ambiguous partial failure.
        createdId = nanoid();
        const record = docs.createDoc({ id: createdId, title: name, primaryMode: 'page' });
        if (record.id !== createdId) throw new Error('创建中间件改变了文档标识');
        await workspace.engine.doc.waitForDocLoaded(createdId);
        await workspace.engine.doc.waitForUpdated(createdId);
        repository.assign(createdId, kind);
        await workspace.engine.doc.waitForUpdated(workspace.id);
        if (mounted.current) { setTitle(''); setPartialId(null); workbench.openDoc(createdId); }
      } catch {
        if (mounted.current) {
          if (createdId) setPartialId(createdId);
          setError(createdId ? '文档创建或保存状态待确认。请查看已有文档或在下方显式归档，不要重复创建。' : '创建未完成，请检查权限与同步状态。原输入已保留。');
        }
      } finally { submitting.current = false; if (mounted.current) setBusy(false); }
    }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <input disabled={blocked || !!partialId} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault(); }} aria-label="新文档名称" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />
      <button type="submit" disabled={blocked || !!partialId || !title.trim()}>新建{kind === 'knowledge' ? '资料' : '产物'}</button>
    </form>
    {busy && <p role="status">正在创建…</p>}
    {error && <p role="alert">{error}</p>}
    {partialId && readable.has(partialId) && docs.list.doc$(partialId).value?.trash$.value === false &&
      <Button onClick={() => {
        void (async () => {
          try {
            if (await guard.can('Doc_Read', partialId) !== true || docs.list.doc$(partialId).value?.trash$.value !== false) throw new Error('文档不可用');
            if (mounted.current) workbench.openDoc(partialId);
          } catch { if (mounted.current) setError('无法打开已创建文档，请检查读取权限与同步状态。'); }
        })();
      }}>查看已创建文档</Button>}
    <ul aria-label={label + '内容'} style={{ listStyle: 'none', padding: 0 }}>
      {records.map(record => <ContentRow key={record.id} record={record} destination={kind === 'knowledge' ? 'artifact' : 'knowledge'} repository={repository} />)}
    </ul>
    {!records.length && <p>此库暂无可读取的已归档内容。</p>}
    <h2>未归档文档</h2>
    <p>仅列出可读取的已有文档。点击“归入{label}”才更改归属，不会自动迁移。</p>
    <ul aria-label="未归档文档" style={{ listStyle: 'none', padding: 0 }}>
      {unassigned.map(record => <ContentRow key={record.id} record={record} destination={kind} repository={repository} />)}
    </ul>
    {!unassigned.length && <p>暂无可读取的未归档文档。</p>}
    <Button onClick={() => workbench.open('/all')}>查看全部文档</Button>
  </section>;
}
