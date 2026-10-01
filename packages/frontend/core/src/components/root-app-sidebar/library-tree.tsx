import { DocsService } from '@affine/core/modules/doc';
import { DikwWorkbenchService } from '@affine/core/modules/dikw-workbench';
import { ContentRepository, type ContentKind } from '@affine/core/modules/dikw-workbench/content-repository';
import { sidebarLibraryIds } from '@affine/core/modules/dikw-workbench/sidebar-library';
import { useReadableDocIds } from '@affine/core/modules/dikw-workbench/connected-navigation';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkbenchLink, WorkbenchService } from '@affine/core/modules/workbench';
import { PageIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo, useState } from 'react';
import { FolderIcon } from './folder-icon';
import * as styles from './board-tree.css';
function LibraryRow({id,active}:{id:string;active:boolean}) {
 const record=useLiveData(useService(DocsService).list.doc$(id));
 const title=useLiveData(record?.title$)||'未命名';
 return <li data-library-doc-id={id}><div className={styles.row} data-active={active} style={{paddingLeft:14}}><span style={{width:26,flexShrink:0}}/><WorkbenchLink draggable={false} to={'/'+id+'?mode=page'} className={styles.link} aria-current={active?'page':undefined} title={title}><PageIcon width={18} height={18} style={{flexShrink:0}}/><span className={styles.label}>{title}</span></WorkbenchLink></div></li>;
}
export function LibraryTree({kind}:{kind:ContentKind}) {
 const workspace=useService(WorkspaceService).workspace, server=useService(WorkspaceServerService).server;
 const key=JSON.stringify([workspace.flavour,server?.id,workspace.id,kind]);
 return <LibraryContent key={key} kind={kind} storageKey={'dikw:sidebar-library:v1:'+key}/>;
}
function LibraryContent({kind,storageKey}:{kind:ContentKind;storageKey:string}) {
 const workspace=useService(WorkspaceService).workspace, docs=useService(DocsService);
 const workbench=useService(WorkbenchService).workbench;
 const relations=useLiveData(useService(DikwWorkbenchService).relations$);
 const pathname=useLiveData(workbench.location$).pathname;
 const ids=useLiveData(docs.list.nonTrashDocsIds$), readable=useReadableDocIds(ids);
 const repository=useMemo(()=>new ContentRepository(workspace.rootYDoc),[workspace]);
 const [,revision]=useState(0);
 useEffect(()=>repository.observe(()=>revision(v=>v+1)),[repository]);
 const content=sidebarLibraryIds(ids,readable,relations,repository,kind);
 const label=kind==='knowledge'?'知识库':'产物库',route=kind==='knowledge'?'/knowledge':'/artifacts';
 const [expanded,setExpanded]=useState(()=>{try{return localStorage.getItem(storageKey)==='true';}catch{return false;}});
 const activeChild=content.includes(pathname.slice(1))?pathname.slice(1):'';
 useEffect(()=>{if(activeChild)setExpanded(true);},[activeChild]);
 useEffect(()=>{try{localStorage.setItem(storageKey,String(expanded));}catch{/* Local preference only. */}},[expanded,storageKey]);
 return <nav aria-label={label+'层级'}>
   <div className={styles.row} data-active={pathname===route}>
     <button type="button" className={styles.toggle} aria-label={(expanded?'收起':'展开')+label} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'▾':'▸'}</button>
     <WorkbenchLink draggable={false} to={route} className={styles.link} aria-current={pathname===route?'page':undefined}><FolderIcon open={expanded}/><span className={styles.label}>{label}</span></WorkbenchLink>
   </div>
   {expanded&&<ul className={styles.list}>{content.map(id=><LibraryRow key={id} id={id} active={pathname==='/'+id}/>)}{!content.length&&<li className={styles.empty}>暂无可显示内容</li>}</ul>}
 </nav>;
}
