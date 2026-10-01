import { DocService, DocsService } from '@affine/core/modules/doc';
import { ViewService, WorkbenchLink } from '@affine/core/modules/workbench';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useMemo, type ReactNode } from 'react';
import { DikwWorkbenchService } from './service';
import { ConnectedBoardNavigation, useReadableDocIds } from './connected-navigation';
import { EditorService } from '@affine/core/modules/editor';
import { useGuard } from '@affine/core/components/guard';
import * as styles from './header-breadcrumbs.css';

/** Navigation only: the current crumb remains the native editable document title. */
export function HeaderBreadcrumbs({docId,children}:{docId:string;children:ReactNode}) {
  const service=useService(DikwWorkbenchService), docs=useService(DocsService);
  const view=useService(ViewService).view;
  const mode=useLiveData(useService(EditorService).editor.mode$);
  const doc=useService(DocService).doc;
  const trashed=useLiveData(doc.meta$.map(meta=>meta.trash));
  const canEdit=useGuard('Doc_Update',docId);
  const relations=useLiveData(service.relations$);
  const ids=useLiveData(docs.list.nonTrashDocsIds$);
  const readable=useReadableDocIds(ids);
  const titles=useMemo(()=>LiveData.from(docs.allDocTitle$(),[]),[docs]);useLiveData(titles);
  const path=service.getPath(docId);
  const complete=!path.problem&&path.ids.every(id=>readable.has(id)&&ids.includes(id));
  const ancestors=complete?path.ids.slice(0,-1):[];
  const parent=ancestors.at(-1);
  return <nav className={styles.root} aria-label="白板层级路径" data-testid="header-board-breadcrumbs">
    <button type="button" className={styles.back} aria-label="返回父白板" title={complete?'返回父白板':'层级暂不可用'} disabled={!parent} onClick={()=>{if(parent&&docs.list.doc$(parent).value?.trash$.value===false)view.history.push({pathname:'/'+parent,search:'?mode=edgeless'});}}>←</button>
    <div className={styles.ancestors}>{ancestors.map(id=>{
      const title=relations.get(id)?.parentId===null?'主工作台':docs.list.doc$(id).value?.title$.value||'未命名白板';
      return <span className={styles.crumb} key={id}><WorkbenchLink draggable={false} className={styles.link} to={relations.get(id)?.parentId===null?'/board':'/'+id+'?mode=edgeless'} title={title}>{title}</WorkbenchLink><span aria-hidden="true">/</span></span>;
    })}</div>
    <div className={styles.current} aria-current="page">{children}</div>
    <details className={styles.tools} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary className={styles.toolsSummary} aria-label="白板层级操作" title="子白板与层级操作">⌄</summary><div className={styles.toolsPanel}><ConnectedBoardNavigation docId={docId} readonly={!canEdit||!!trashed} canvasTools={mode==='edgeless'} actionsOnly /></div></details>
  </nav>;
}
