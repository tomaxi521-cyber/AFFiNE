import { useGuard } from '@affine/core/components/guard';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { BoardPlacementTool } from '@affine/core/blocksuite/view-extensions/dikw-canvas';
import { DefaultTool } from '@blocksuite/affine/blocks/surface';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { DocsService } from '../doc';
import { GuardService } from '../permissions';
import { WorkspaceService } from '../workspace';
import { WorkspaceServerService } from '../cloud';
import { ViewService } from '../workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';
import { DikwWorkbenchService, DikwChildCreationError, type BoardPlacement } from './service';
import { copyBoardTree, DikwBoardCopyError } from './board-copy';
import { useReadableDocIds } from './connected-navigation';
import * as styles from './canvas-tool-panel.css';

type Attempt = { id: string; source?: string; docId?: string; placement: BoardPlacement };
export function CanvasToolPanel({ editor, docId, readonly }: {editor: AffineEditorContainer | null; docId:string; readonly:boolean}) {
 const view=useService(ViewService).view;
 const service=useService(DikwWorkbenchService); const docs=useService(DocsService);
 const workspace=useService(WorkspaceService).workspace; const guard=useService(GuardService);
 const serverId=useService(WorkspaceServerService).server?.id;
 const relations=useLiveData(service.relations$); const isBoard=relations.has(docId); const ids=useLiveData(docs.list.nonTrashDocsIds$);
 const readable=useReadableDocIds(ids); const canCreate=useGuard('Workspace_CreateDoc');const canUpdate=useGuard('Doc_Update',docId);
 const writable=!readonly&&!workspace.openOptions.isSharedMode&&canCreate===true&&canUpdate===true;
 const [open,setOpen]=useState(false);
 const [placing,setPlacing]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 // Retain legacy source operations only for recovery; the toolbar always creates blank boards.
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2400);return()=>clearTimeout(timer);},[notice]);
 const panelRef=useRef<HTMLElement|null>(null);
 useEffect(()=>{if(open)panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[open]);
 const [pending,setPending]=useState<Attempt|null>(null);const pendingRef=useRef<Attempt|null>(null);
 const armed=useRef(false);const locked=useRef(false);const mounted=useRef(false);
 const runRef=useRef<(a:Attempt)=>Promise<void>>(async()=>{});
 const armRef=useRef<()=>void>(()=>{});
 const journalKey='dikw:canvas-pending:v1:'+JSON.stringify([workspace.flavour,serverId??'',workspace.id,docId]);
 useEffect(()=>{mounted.current=true;try{const raw=localStorage.getItem(journalKey);if(raw){const a=JSON.parse(raw) as Attempt;if(typeof a.id==='string'&&a.placement){pendingRef.current=a;setPending(a);setOpen(true);setError('上次放置尚未确认，请重试原操作。');}}}catch{setError('无法读取放置记录。');}return()=>{mounted.current=false;};},[journalKey]);
 const run=async(a:Attempt)=>{
   if(locked.current||!writable)return;const retrying=!!pendingRef.current;locked.current=true;setBusy(true);setError('');setNotice('');
   try{
     // Persist UI operation identity before service invocation so reload can resume it.
     localStorage.setItem(journalKey,JSON.stringify(a));pendingRef.current=a;setPending(a);
     const id=a.source?await copyBoardTree({docs,workspace,guard,serverId},a.source,docId,a.id,a.placement):await service.createChild(docId,'未命名白板',a.id,a.placement);
     localStorage.removeItem(journalKey);pendingRef.current=null;
     if(mounted.current){setPending(null);setNotice('白板已创建，双击进入');setOpen(false);}
     return id;
   }catch(e){
     if(e instanceof DikwChildCreationError || e instanceof DikwBoardCopyError){
       const recovery={...a,docId:e.docId};pendingRef.current=recovery;
       try{localStorage.setItem(journalKey,JSON.stringify(recovery));}catch{/* original operation ID is already durable */}
       if(mounted.current)setPending(recovery);
     }
     // Copy preflight errors occur before any native create; allow another source.
     if(a.source && !retrying && !(e instanceof DikwBoardCopyError)){localStorage.removeItem(journalKey);pendingRef.current=null;if(mounted.current)setPending(null);}
     if(mounted.current){setError(e instanceof Error?e.message:'放置失败，请重试原操作。');setOpen(true);}}
   finally{locked.current=false;if(mounted.current)setBusy(false);}
 };
 runRef.current=async a=>{await run(a);};
 useEffect(()=>{
   const host=editor?.origin;const std=editor?.std;if(!host||!std||!isBoard)return;
   const gfx=std.get(GfxControllerIdentifier);
   const tool=gfx.tool; if(!tool)return;
   const handler=(event:Event)=>{
     const e=event as CustomEvent<{action:string;placement?:BoardPlacement}>;
     // Ignore embedded-preview events: only the current captured editor may mutate.
     if(e.composedPath().find(node=>node instanceof HTMLElement && node.tagName.toLowerCase()==='editor-host')!==std.host)return;
     if(e.detail?.action==='open'){armRef.current();return;}
     if(e.detail?.action==='place'&&armed.current&&e.detail.placement){armed.current=false;setPlacing(false);void runRef.current({id:nanoid(),placement:e.detail.placement});}
     if(e.detail?.action==='cancel-placement'){armed.current=false;setPlacing(false);}
   };
   host.addEventListener('dikw:board-tool',handler);
   return()=>{host.removeEventListener('dikw:board-tool',handler);armed.current=false;if(host.isConnected && tool.currentToolName$.peek()===BoardPlacementTool.toolName)tool.setTool(DefaultTool);};
 },[editor,docId,isBoard]);
 armRef.current=()=>{if(pendingRef.current){setOpen(true);return;}if(!writable||locked.current||busy)return;const std=editor?.std;if(!std)return;armed.current=true;setOpen(false);setError('');setNotice('');setPlacing(true);std.get(GfxControllerIdentifier).tool.setTool(BoardPlacementTool);};
 const cancel=()=>{armed.current=false;setPlacing(false);editor?.std.get(GfxControllerIdentifier).tool.setTool(DefaultTool);setOpen(false);};
 if(!relations.has(docId))return null;
 if(placing)return <aside className={styles.placementHint} role="status">点击或拖拽创建白板 · Esc 取消<button className={styles.button} onClick={cancel}>取消</button></aside>;
 if(!open && busy)return <aside className={styles.placementHint} role="status">正在保存白板…</aside>;
 if(!open && notice)return <aside className={styles.placementHint} role="status">{notice}<button className={styles.button} aria-label="关闭创建提示" onClick={()=>setNotice('')}>×</button></aside>;
 if(!open)return null;
 return <section ref={panelRef} className={styles.panel} role="dialog" aria-label="插入白板" aria-busy={busy} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!busy)setOpen(false);}}>
  <div className={styles.row}><strong>白板</strong><button className={styles.button} aria-label="关闭白板工具" disabled={busy} onClick={()=>setOpen(false)}>×</button></div>
  {!writable&&<p className={styles.hint}>当前没有创建和编辑白板的权限。</p>}
  {busy&&<p role="status">正在创建并保存，请稍候…</p>}
  {error&&<p role="alert">{error}</p>}
  {pending&&!busy&&<><p className={styles.hint}>操作编号：{pending.id}</p><button className={styles.button} disabled={!writable} onClick={()=>void run(pending)}>重试原放置操作</button>
  {pending.docId&&readable.has(pending.docId)&&<button className={styles.button} onClick={()=>void (async()=>{const id=pending.docId!;if(await guard.can('Doc_Read',id)===true&&docs.list.doc$(id).value?.trash$.value===false&&mounted.current)view.history.push({pathname:'/'+id,search:'?mode=edgeless'});})()}>查看已创建白板</button>}
  <p className={styles.hint}>若提示部分内容待恢复，请保留操作编号；不会重新初始化或删除已有内容。</p></>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
