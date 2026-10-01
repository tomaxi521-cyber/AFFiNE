/** @vitest-environment happy-dom */
import { expect, test, vi } from 'vitest';
import { Doc } from 'yjs';
import { BoardRepository } from './board-repository';
import { bindChildPortalNavigation } from './portal-interaction';
function setup() {
 const root = new Doc(); const graph = new BoardRepository(root);
 graph.registerMain('main', 'init'); graph.registerChild('child', 'main', 'op');
 const host = document.createElement('div');
 const portal = Object.assign(document.createElement('affine-embed-edgeless-synced-doc-block'), {store:{id:'main'},model:{props:{pageId:'child'}}});
 host.append(portal);const navigate=vi.fn(),onError=vi.fn();
 const canRead=vi.fn(async()=>true),available=vi.fn(()=>true);
 const dispose=bindChildPortalNavigation(host,{source:'main',root,canRead,available,navigate,onError});
 const click=(props={})=>portal.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,composed:true,...props}));
 return {portal,click,navigate,onError,canRead,available,dispose};
}
test('direct child preview enters once after permission check',async()=>{const f=setup();f.click();f.click();await vi.waitFor(()=>expect(f.navigate).toHaveBeenCalledExactlyOnceWith('child'));});
test('ordinary synced references and modifier clicks retain native behaviour',async()=>{const f=setup();f.click({ctrlKey:true});f.portal.model.props.pageId='reference';f.click();await Promise.resolve();expect(f.canRead).not.toHaveBeenCalled();});
test('revoked permission or removed target does not navigate',async()=>{const f=setup();f.canRead.mockResolvedValue(false);f.click();await vi.waitFor(()=>expect(f.onError).toHaveBeenCalledOnce());expect(f.navigate).not.toHaveBeenCalled();});
test('unmount while checking permission does not navigate stale board',async()=>{const f=setup();let resolve!: (value:boolean)=>void;f.canRead.mockImplementation(()=>new Promise(r=>resolve=r));f.click();f.dispose();resolve(true);await Promise.resolve();expect(f.navigate).not.toHaveBeenCalled();});
