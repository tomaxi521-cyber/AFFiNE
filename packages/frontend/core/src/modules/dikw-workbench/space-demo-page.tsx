import { Button } from '@affine/component';
import { useGuard } from '@affine/core/components/guard';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { DocsService } from '@affine/core/modules/doc';
import { GuardService } from '@affine/core/modules/permissions';
import { ViewService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useEffect, useRef, useState } from 'react';

import { DikwWorkbenchService } from './service';
import { createSpaceDemo } from './space-demo';

/** Route entry: mounting explains the operation, but never creates content. */
export function Component() {
  const workspace = useService(WorkspaceService).workspace;
  return <SpaceDemoPage key={workspace.id} />;
}

function SpaceDemoPage() {
  const service = useService(DikwWorkbenchService);
  const docs = useService(DocsService);
  const guard = useService(GuardService);
  const workspace = useService(WorkspaceService).workspace;
  const server = useService(WorkspaceServerService).server;
  const view = useService(ViewService).view;
  const canCreate = useGuard('Workspace_CreateDoc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const create = async () => {
    if (submitting.current || canCreate !== true || workspace.openOptions.isSharedMode) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const location = view.history.location;
    try {
      const sampleId = await createSpaceDemo({
        service, docs, guard, workspace, serverId: server?.id ?? '',
      });
      if (await guard.can('Doc_Read', sampleId) !== true ||
        docs.list.doc$(sampleId).value?.trash$.value !== false) {
        throw new Error('样板已保存，但当前无法读取，请检查权限。');
      }
      // Navigate this originating view only, not whichever tab became active
      // during saves. Leaving this route must not trigger a late redirect.
      if (mounted.current && view.history.location === location) {
        view.history.push({ pathname: '/' + sampleId, search: '?mode=edgeless' });
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause instanceof Error ? cause.message : '样板未完成，请检查权限与保存状态。') +
          ' 原操作记录会保留；重试不会新建替代样板。若提示创建状态待恢复，请保留浏览器数据并联系维护者。');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section aria-label="空间体验样板" style={{ padding: 24, maxWidth: 760 }}>
      <h1>空间体验样板</h1>
      <p>在当前工作区新建三层白板，用合成内容体验空间组织与逐层进入。</p>
      <ol>
        <li>空间体验样板：整体说明与子白板入口。</li>
        <li>产品研究：示例研究问题与下一层入口。</li>
        <li>访谈分析：示例观察与待验证想法。</li>
      </ol>
      <p>
        只有点击下方按钮才会创建。已有主白板只会增加一个样板入口，
        不会移动、复制或改写你的已有内容。若工作区尚无主白板，将先创建主白板。
        样板中的便签可用原生编辑器继续编辑。
      </p>
      <p>全部保存完成后，在当前视图打开样板。重复点击或失败重试会继续同一份样板。</p>
      {workspace.openOptions.isSharedMode ? (
        <p>分享模式下不能创建样板。</p>
      ) : canCreate !== true ? (
        <p>需要当前工作区的创建白板权限，以及相关白板的读取和编辑权限。</p>
      ) : null}
      <Button
        disabled={busy || canCreate !== true || workspace.openOptions.isSharedMode}
        onClick={() => { void create(); }}
      >
        {busy ? '正在创建并保存…' : error ? '使用原操作重试' : '创建或打开空间体验样板'}
      </Button>
      {busy && <p role="status">正在准备三层白板并保存示例便签，请稍候…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
