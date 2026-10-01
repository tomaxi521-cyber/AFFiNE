import type { BlockSnapshot, DocSnapshot } from '@blocksuite/affine/store';

/** Deliberately bounded first version: unsupported schemas fail BEFORE creation. */
export const BOARD_COPY_LIMITS = { documents: 32, objects: 5000, bytes: 16 * 1024 * 1024, depth: 100 } as const;
const BLOCKS = new Set([
  'affine:page', 'affine:surface', 'affine:note', 'affine:paragraph', 'affine:edgeless-text',
  'affine:list', 'affine:code', 'affine:divider', 'affine:image',
  'affine:attachment', 'affine:bookmark', 'affine:frame', 'affine:surface-ref',
  'affine:embed-linked-doc', 'affine:embed-synced-doc',
]);
const ELEMENTS = new Set(['shape', 'brush', 'text', 'connector', 'group']);
type ObjectMap = Record<string, unknown>;
export type CopyIdentity = { docId: string; ids: Record<string, string> };

export function object(value: unknown): ObjectMap {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error('复制快照包含不支持的数据结构');
  }
  return value as ObjectMap;
}

/** Stable comparison ignores object key order, NOT array order or content. */
export function canonicalSnapshot(value: unknown, depth = 0): string {
  if (depth > BOARD_COPY_LIMITS.depth) throw new Error('复制内容嵌套过深');
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => canonicalSnapshot(v, depth + 1)).join(',') + ']';
  const record = object(value);
  return '{' + Object.keys(record).filter(k => record[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + canonicalSnapshot(record[k], depth + 1)).join(',') + '}';
}

export function snapshotBlocks(root: BlockSnapshot): BlockSnapshot[] {
  const blocks: BlockSnapshot[] = [];
  const pending = [{ block: root, depth: 0 }];
  const seen = new Set<string>();
  while (pending.length) {
    const { block, depth } = pending.pop()!;
    if (!block || block.type !== 'block' || typeof block.id !== 'string' || !block.id ||
        seen.has(block.id) || !Array.isArray(block.children) || depth > BOARD_COPY_LIMITS.depth) {
      throw new Error('白板块结构损坏或嵌套过深');
    }
    seen.add(block.id);
    blocks.push(block);
    if (blocks.length > BOARD_COPY_LIMITS.objects) throw new Error('复制内容超过对象上限');
    for (const child of [...block.children].reverse()) pending.push({ block: child, depth: depth + 1 });
  }
  return blocks;
}

export function inspectCopySnapshot(snapshot: DocSnapshot): { ids: string[]; blobs: string[] } {
  const ids = new Set<string>();
  const blobs = new Set<string>();
  if (snapshot.type !== 'page' || !snapshot.meta.id || snapshot.blocks.flavour !== 'affine:page') {
    throw new Error('白板快照缺少根块');
  }
  const blocks = snapshotBlocks(snapshot.blocks);
  if (blocks.filter(b => b.flavour === 'affine:surface').length !== 1) throw new Error('白板画布结构不可用');
  const addId = (id: string) => {
    if (!id || ids.has(id)) throw new Error('白板内容标识重复');
    ids.add(id);
    if (ids.size > BOARD_COPY_LIMITS.objects) throw new Error('复制内容超过对象上限');
  };
  for (const block of blocks) {
    if (!BLOCKS.has(block.flavour)) throw new Error('暂不支持复制内容类型：' + block.flavour);
    addId(block.id);
    const props = object(block.props);
    // Comments belong to a separate store, not this content snapshot.
    if (props.comments && Object.keys(object(props.comments)).length) throw new Error('暂不支持复制带评论的内容');
    if (block.flavour === 'affine:surface') {
      for (const [id, raw] of Object.entries(object(props.elements))) {
        addId(id);
        const element = object(raw);
        if (!ELEMENTS.has(String(element.type))) throw new Error('暂不支持复制画布类型：' + String(element.type));
        if (element.id !== undefined && element.id !== id) throw new Error('画布元素标识不一致');
      }
    }
    if (block.flavour === 'affine:image' || block.flavour === 'affine:attachment') {
      if (typeof props.sourceId !== 'string' || !props.sourceId) throw new Error('媒体尚未保存，无法复制');
      // Native static assets can be kept verbatim; workspace blobs are content addressed.
      if (!props.sourceId.startsWith('/')) blobs.add(props.sourceId);
    }
  }
  canonicalSnapshot(snapshot); // Reject non-JSON native objects rather than silently flattening them.
  return { ids: [...ids], blobs: [...blobs] };
}

/** Remap only schema-defined identities, never text, URLs, blob IDs or external references. */
export function remapCopySnapshot(
  source: DocSnapshot,
  identities: ReadonlyMap<string, CopyIdentity>
): DocSnapshot {
  inspectCopySnapshot(source);
  const identity = identities.get(source.meta.id);
  if (!identity) throw new Error('复制计划缺少文档映射');
  const snapshot = JSON.parse(canonicalSnapshot(source)) as DocSnapshot;
  const local = (id: unknown): string => {
    if (typeof id !== 'string' || !Object.hasOwn(identity.ids, id)) throw new Error('白板内部引用缺失：' + String(id));
    return identity.ids[id];
  };
  const remapReference = (ref: ObjectMap) => {
    if (typeof ref.pageId !== 'string') throw new Error('文档引用格式无效');
    const target = identities.get(ref.pageId);
    if (!target) return; // Explicitly do not traverse or randomize external references.
    ref.pageId = target.docId;
    if (ref.params !== undefined) {
      const params = object(ref.params);
      if (params.databaseId || params.databaseRowId || params.commentId) throw new Error('暂不支持复制数据库或评论定位引用');
      for (const key of ['blockIds', 'elementIds']) {
        if (params[key] === undefined) continue;
        if (!Array.isArray(params[key])) throw new Error('文档定位引用格式无效');
        params[key] = (params[key] as unknown[]).map(id => {
          if (typeof id !== 'string' || !Object.hasOwn(target.ids, id)) throw new Error('复制子树内的定位引用缺失');
          return target.ids[id];
        });
      }
    }
  };
  const richText = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(richText); return; }
    if (!value || typeof value !== 'object') return;
    const record = object(value);
    if (Array.isArray(record.delta)) {
      for (const raw of record.delta) {
        const op = object(raw);
        if (!op.attributes) continue;
        const attributes = object(op.attributes);
        if (attributes.reference) remapReference(object(attributes.reference));
        if (attributes.footnote) {
          const footnote = object(attributes.footnote);
          if (footnote.reference) {
            const ref = object(footnote.reference);
            if (ref.type === 'doc' && typeof ref.docId === 'string') ref.docId = identities.get(ref.docId)?.docId ?? ref.docId;
          }
        }
      }
    }
    Object.values(record).forEach(richText);
  };
  const remapKeys = (value: unknown) => Object.fromEntries(Object.entries(object(value)).map(([id, v]) => [local(id), v]));
  for (const block of snapshotBlocks(snapshot.blocks)) {
    block.id = local(block.id);
    const props = block.props;
    richText(props);
    if (block.flavour === 'affine:embed-linked-doc' || block.flavour === 'affine:embed-synced-doc') remapReference(props);
    if (block.flavour === 'affine:surface-ref') props.reference = local(props.reference);
    if (block.flavour === 'affine:frame' && props.childElementIds !== undefined) props.childElementIds = remapKeys(props.childElementIds);
    if (block.flavour === 'affine:surface') {
      props.elements = Object.fromEntries(Object.entries(object(props.elements)).map(([id, raw]) => {
        const element = object(raw);
        if (element.id !== undefined) element.id = local(id);
        if (element.type === 'connector') {
          for (const end of ['source', 'target']) {
            const connection = object(element[end]);
            if (connection.id !== undefined) connection.id = local(connection.id);
          }
        }
        if (element.type === 'group') {
          const children = object(element.children);
          children.json = remapKeys(children.json);
        }
        return [local(id), element];
      }));
    }
  }
  snapshot.meta.id = identity.docId;
  return snapshot;
}

export function assertCopySnapshotEqual(expected: DocSnapshot, actual: DocSnapshot | undefined): void {
  if (!actual || canonicalSnapshot(expected.blocks) !== canonicalSnapshot(actual.blocks)) {
    throw new Error('复制内容校验失败；可能存在部分写入或后续编辑，不会覆盖已有内容');
  }
}
