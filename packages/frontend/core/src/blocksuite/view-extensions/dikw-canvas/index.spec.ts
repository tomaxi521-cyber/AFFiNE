/** @vitest-environment happy-dom */
import { describe, expect, test, vi } from 'vitest';
vi.mock('@blocksuite/affine/blocks/surface',()=>({DefaultTool:class DefaultTool{}}));
vi.mock('@blocksuite/affine/ext-loader',()=>({ViewExtensionProvider:class {setup(){}}}));
vi.mock('@blocksuite/affine/std/gfx',()=>({BaseTool:class {constructor(readonly gfx:any){}get std(){return this.gfx.std;}get doc(){return this.gfx.doc;}}}));
import { BoardPlacementTool, DikwCanvasViewExtension } from './index';
function fixture(){const host=document.createElement('div');const events:any[]=[];host.addEventListener('dikw:board-tool',e=>events.push((e as CustomEvent).detail));const gfx={std:{host},doc:{readonly:false},viewport:{toModelCoord:(x:number,y:number)=>[x*2-50,y*2-100],toViewCoord:(x:number,y:number)=>[(x+50)/2,(y+100)/2]},tool:{setTool:vi.fn()}};return {tool:new BoardPlacementTool(gfx as any),gfx,host,events};}
describe('native board placement',()=>{
 test('registers only main desktop edgeless scope',()=>{const p=new DikwCanvasViewExtension();for(const scope of ['page','edgeless-preview','mobile-edgeless','edgeless']){const register=vi.fn();p.setup({scope,register} as any);expect(register).toHaveBeenCalledTimes(scope==='edgeless'?1:0);}});
 test('click converts native pointer into world geometry',()=>{const f=fixture();f.tool.click({x:100,y:200} as any);expect(f.events[0]).toEqual({action:'place',placement:{x:150,y:300,width:800,height:455}});expect(f.gfx.tool.setTool).toHaveBeenCalledOnce();});
 test('reverse drag normalizes world bounds',()=>{const f=fixture();f.tool.dragStart({x:400,y:300} as any);f.tool.dragEnd({x:100,y:100} as any);expect(f.events[0].placement).toEqual({x:150,y:100,width:600,height:400});});
 test('readonly blocks placement and returns selection',()=>{const f=fixture();f.gfx.doc.readonly=true;f.tool.click({x:10,y:10} as any);expect(f.events).toHaveLength(0);expect(f.gfx.tool.setTool).toHaveBeenCalledOnce();});
 test('cancel cleans transient DOM and emits no document write',()=>{const f=fixture();f.tool.activate();expect(f.host.children.length).toBe(1);f.tool.deactivate();expect(f.host.children.length).toBe(0);expect(f.events).toEqual([{action:'cancel-placement',placement:undefined}]);});
});
