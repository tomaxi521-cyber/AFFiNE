import { DefaultTool } from '@blocksuite/affine/blocks/surface';
import { ViewExtensionProvider, type ViewExtensionContext } from '@blocksuite/affine/ext-loader';
import type { PointerEventState } from '@blocksuite/affine/std';
import { BaseTool } from '@blocksuite/affine/std/gfx';
import type { BoardPlacement } from '../../../modules/dikw-workbench/service';

// Transient placement only: creation, permission and persistence remain in the app service.
export class BoardPlacementTool extends BaseTool {
  static override toolName = 'dikw:board-placement';
  private start?: [number, number];
  private preview?: HTMLDivElement;
  private emit(action: string, placement?: BoardPlacement) {
    this.std.host.dispatchEvent(new CustomEvent('dikw:board-tool', { bubbles: true, composed: true, detail: { action, placement } }));
  }
  override activate() {
    this.std.host.style.cursor = 'crosshair';
    this.preview = document.createElement('div');
    this.preview.setAttribute('aria-hidden','true');
    Object.assign(this.preview.style, {position:'fixed',pointerEvents:'none',border:'1px dashed #667085',background:'rgba(100,116,139,.08)',zIndex:'10',display:'none'});
    this.std.host.append(this.preview);
  }
  override deactivate() {
    this.preview?.remove(); this.preview = undefined; this.start = undefined;
    this.std.host.style.cursor = ''; this.emit('cancel-placement');
  }
  private point(e: PointerEventState): [number, number] { return this.gfx.viewport.toModelCoord(e.x,e.y); }
  private finish(placement: BoardPlacement) {
    if (this.doc.readonly) { this.gfx.tool.setTool(DefaultTool); return; }
    this.emit('place',placement);
    this.gfx.tool.setTool(DefaultTool);
  }
  override click(e: PointerEventState) {
    if (e.button !== undefined && e.button !== 0) return;
    const [x,y] = this.point(e); this.finish({x,y,width:800,height:455});
  }
  override dragStart(e: PointerEventState) { this.start = this.point(e); }
  override dragMove(e: PointerEventState) {
    if (!this.start || !this.preview) return;
    const p=this.point(e); const a=this.gfx.viewport.toViewCoord(this.start[0],this.start[1]); const b=this.gfx.viewport.toViewCoord(p[0],p[1]);
    const rect=this.std.host.getBoundingClientRect();
    Object.assign(this.preview.style,{display:'block',left:rect.left+Math.min(a[0],b[0])+'px',top:rect.top+Math.min(a[1],b[1])+'px',width:Math.abs(b[0]-a[0])+'px',height:Math.abs(b[1]-a[1])+'px'});
  }
  override dragEnd(e: PointerEventState) {
    if (!this.start) return;
    const p=this.point(e); this.finish({x:Math.min(this.start[0],p[0]),y:Math.min(this.start[1],p[1]),width:Math.max(160,Math.min(10000,Math.abs(p[0]-this.start[0]))),height:Math.max(100,Math.min(10000,Math.abs(p[1]-this.start[1])))});
  }
}
export class DikwCanvasViewExtension extends ViewExtensionProvider {
  override name = 'dikw-canvas';
  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (context.scope === 'edgeless') context.register(BoardPlacementTool);
  }
}
