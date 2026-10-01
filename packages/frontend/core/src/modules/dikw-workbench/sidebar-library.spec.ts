import {describe,it,expect} from 'vitest';
import {sidebarLibraryIds} from './sidebar-library';
import {ContentRepository} from './content-repository';
import {Doc} from 'yjs';
describe('sidebar libraries',()=>{
 it('shows only readable non-trash assigned documents, never boards or unassigned',()=>{const r=new ContentRepository(new Doc());r.assign('k','knowledge');r.assign('a','artifact');r.assign('denied','knowledge');r.assign('trash','knowledge');r.assign('board','knowledge');expect(sidebarLibraryIds(['k','a','denied','board','free'],new Set(['k','a','board','free']),new Map([['board',{}]]),r,'knowledge')).toEqual(['k']);});
 it('reflects reassignment without mutating metadata during reads',()=>{const root=new Doc(),r=new ContentRepository(root);r.assign('d','knowledge');const ids=['d'],readable=new Set(ids),boards=new Map();expect(sidebarLibraryIds(ids,readable,boards,r,'knowledge')).toEqual(ids);r.assign('d','artifact');const before=JSON.stringify(root.toJSON());expect(sidebarLibraryIds(ids,readable,boards,r,'knowledge')).toEqual([]);expect(sidebarLibraryIds(ids,readable,boards,r,'artifact')).toEqual(ids);expect(JSON.stringify(root.toJSON())).toBe(before);});
});
