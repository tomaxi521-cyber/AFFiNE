import { DocsService } from '@affine/core/modules/doc';
import { DikwWorkbenchService } from '@affine/core/modules/dikw-workbench';
import { getBoardPath } from '@affine/core/modules/dikw-workbench/board-graph';
import { useReadableDocIds } from '@affine/core/modules/dikw-workbench/connected-navigation';
import { sidebarBoardRows } from '@affine/core/modules/dikw-workbench/sidebar-tree';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkbenchLink, WorkbenchService } from '@affine/core/modules/workbench';
import { FolderIcon } from './folder-icon';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo, useState } from 'react';
import * as styles from './board-tree.css';

function BoardRow({id,root,depth,hasChildren,expanded,active,onToggle}: {id:string;root:boolean;depth:number;hasChildren:boolean;expanded:boolean;active:boolean;onToggle:()=>void}) {
  const record=useLiveData(useService(DocsService).list.doc$(id));
  const title=useLiveData(record?.title$);
  const name=root?'主工作台':title||'未命名白板';
  return <li data-board-id={id}>
    <div className={styles.row} data-active={active} style={{paddingLeft:Math.min(depth,8)*14}}>
      {(root||hasChildren)?<button type="button" className={styles.toggle} aria-label={(expanded?'收起':'展开')+name} aria-expanded={expanded} onClick={onToggle}>{expanded?'▾':'▸'}</button>:<span style={{width:26,flexShrink:0}}/>}
      <WorkbenchLink draggable={false} to={root?'/board':'/'+id+'?mode=edgeless'} className={styles.link} aria-current={active?'page':undefined} title={name} data-testid={root?'dikw-main-board':undefined}><FolderIcon open={expanded}/><span className={styles.label}>{name}</span></WorkbenchLink>
    </div>
  </li>;
}
export function BoardTree() {
  const workspace=useService(WorkspaceService).workspace;
  const server=useService(WorkspaceServerService).server;
  return <TreeContent key={JSON.stringify([workspace.flavour,server?.id,workspace.id])} storageKey={'dikw:sidebar-tree:v1:'+JSON.stringify([workspace.flavour,server?.id,workspace.id])}/>;
}
function TreeContent({storageKey}:{storageKey:string}) {
  const service=useService(DikwWorkbenchService), docs=useService(DocsService);
  const workbench=useService(WorkbenchService).workbench;
  const relations=useLiveData(service.relations$), ids=useLiveData(docs.list.nonTrashDocsIds$);
  const readable=useReadableDocIds(ids);
  const visible=useMemo(()=>new Set(ids.filter(id=>readable.has(id))),[ids,readable]);
  const pathname=useLiveData(workbench.location$).pathname, activeId=pathname.slice(1);
  const roots=[...relations.values()].filter(r=>r.parentId===null), rootId=roots.length===1?roots[0].docId:undefined;
  const [expanded,setExpanded]=useState<Set<string>>(()=>{try{const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return new Set(Array.isArray(v)?v.filter(x=>typeof x==='string'):[]);}catch{return new Set();}});
  const path=getBoardPath(activeId,relations);
  const ancestors=path.problem?[]:path.ids.slice(0,-1);
  const pathKey=JSON.stringify(ancestors);
  useEffect(()=>{setExpanded(old=>{const next=new Set(old);for(const id of JSON.parse(pathKey) as string[])next.add(id);return next.size===old.size?old:next;});},[pathKey]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify([...expanded]));}catch{/* Navigation remains usable without persistence. */}},[expanded,storageKey]);
  const rows=sidebarBoardRows(relations,visible,expanded);
  // Native links preserve current-tab intent and the offline-safe /board root entry.
  // Visibility is permission-filtered above; destination access remains enforced by native routes.
  return <nav aria-label="工作台层级">
    {!rows.length&&<div className={styles.row}><span style={{width:26}}/><button type="button" data-testid="dikw-main-board" className={styles.link} onClick={()=>workbench.open('/board')}><FolderIcon/>主工作台</button></div>}
    <ul className={styles.list}>{rows.map(row=><BoardRow key={row.id} {...row} root={row.id===rootId} active={row.id===activeId||(row.id===rootId&&pathname==='/board')} expanded={expanded.has(row.id)} onToggle={()=>setExpanded(old=>{const next=new Set(old);next.has(row.id)?next.delete(row.id):next.add(row.id);return next;})}/>)}</ul>
  </nav>;
}
