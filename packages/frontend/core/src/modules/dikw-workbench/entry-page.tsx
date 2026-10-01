import { Button } from '@affine/component';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';
import { DikwWorkbenchService } from './service';

/** A real route, not a redirect that overrides explicit document links. */
export function Component() {
  const service = useService(DikwWorkbenchService);
  const workbench = useService(WorkbenchService).workbench;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    service.ensureMainBoard().then(id => {
      if (!cancelled) workbench.open({ pathname: '/' + id, search: '?mode=edgeless' }, { replaceHistory: true });
    }).catch(() => {
      if (!cancelled) setError('主白板暂时无法打开。请确认网络和工作区权限后重试；不会创建替代白板或删除已有内容。');
    });
    return () => { cancelled = true; };
  }, [service, workbench, attempt]);
  return <section aria-label="工作区主白板" style={{ padding: 24 }}>
    <h1>白板</h1>
    {error ? <><p role="alert">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>重试</Button><Button onClick={() => workbench.open('/all')}>查看已有文档</Button></> : <p role="status">正在打开主白板…</p>}
  </section>;
}
