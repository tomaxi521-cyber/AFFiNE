import type { ContentKind, ContentRepository } from './content-repository';
/** Never infer membership from titles, tags, embeds or the current route. */
export function sidebarLibraryIds(ids:readonly string[],readable:ReadonlySet<string>,boards:ReadonlyMap<string,unknown>,repository:Pick<ContentRepository,'getKind'>,kind:ContentKind):string[] {
 return ids.filter(id=>readable.has(id)&&!boards.has(id)&&repository.getKind(id)===kind);
}
