import type { Doc } from 'yjs';

export type ContentKind = 'knowledge' | 'artifact';
export const CONTENT_KIND_MAP = 'dikw:content-kind:v1';

/** Workspace-local ownership, independent of folders, canvas cards and favourites. */
export class ContentRepository {
  constructor(private readonly root: Doc) {}

  getKind(docId: string): ContentKind | null {
    const value = this.root.getMap<unknown>(CONTENT_KIND_MAP).get(docId);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return record.version === 1 && (record.kind === 'knowledge' || record.kind === 'artifact')
      ? record.kind : null;
  }

  /** Caller is responsible for document existence and native update permission. */
  assign(docId: string, kind: ContentKind): void {
    if (!docId || (kind !== 'knowledge' && kind !== 'artifact')) throw new Error('Invalid content ownership');
    const map = this.root.getMap<unknown>(CONTENT_KIND_MAP);
    if (map.has(docId) && this.getKind(docId) === null) throw new Error('Unknown content metadata; repair required');
    if (this.getKind(docId) === kind) return;
    this.root.transact(() => map.set(docId, { version: 1, kind }));
  }

  observe(listener: () => void): () => void {
    const map = this.root.getMap(CONTENT_KIND_MAP);
    map.observe(listener);
    return () => map.unobserve(listener);
  }
}
