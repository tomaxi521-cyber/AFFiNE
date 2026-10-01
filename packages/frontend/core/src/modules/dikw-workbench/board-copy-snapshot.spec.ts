import type { BlockSnapshot, DocSnapshot } from '@blocksuite/affine/store';
import { describe, expect, test } from 'vitest';

import {
  assertCopySnapshotEqual, canonicalSnapshot, inspectCopySnapshot,
  remapCopySnapshot, type CopyIdentity,
} from './board-copy-snapshot';

const block = (id: string, flavour: string, props: Record<string, unknown> = {}, children: BlockSnapshot[] = []): BlockSnapshot => ({ type: 'block', id, flavour, props, children });
function fixture() {
  const source: DocSnapshot = {
    type: 'page', meta: { id: 'source', title: 'Original', createDate: 1, tags: [] },
    blocks: block('root', 'affine:page', { title: { '$blocksuite:internal:text$': true, delta: [{ insert: 'source is ordinary text' }] } }, [
      block('surface', 'affine:surface', { elements: {
        shape: { id: 'shape', type: 'shape', xywh: '[1,2,3,4]', fillColor: 'red' },
        arrow: { id: 'arrow', type: 'connector', source: { id: 'shape', position: [0, 0] }, target: { id: 'frame' } },
        group: { id: 'group', type: 'group', children: { '$blocksuite:surface:ymap$': true, json: { shape: true, arrow: true } } },
      } }, [
        block('frame', 'affine:frame', { childElementIds: { shape: true, group: true } }),
        block('portal', 'affine:embed-synced-doc', { pageId: 'child', params: { mode: 'edgeless', blockIds: ['child-block'], elementIds: ['child-element'] } }),
        block('external', 'affine:embed-linked-doc', { pageId: 'missing-external', params: { blockIds: ['old-external'] } }),
      ]),
      block('note', 'affine:note', {}, [
        block('paragraph', 'affine:paragraph', { text: { '$blocksuite:internal:text$': true, delta: [
          { insert: 'source child https://source', attributes: { reference: { pageId: 'source', params: { blockIds: ['frame'] } } } },
          { insert: 'footnote', attributes: { footnote: { reference: { type: 'doc', docId: 'child' } } } },
        ] } }),
        block('surface-ref', 'affine:surface-ref', { reference: 'shape' }),
        block('image', 'affine:image', { sourceId: 'immutable-blob', caption: 'child' }),
      ]),
    ]),
  };
  const identities = new Map<string, CopyIdentity>([
    ['source', { docId: 'new-source', ids: Object.fromEntries(inspectCopySnapshot(source).ids.map(id => [id, 'new-' + id])) }],
    ['child', { docId: 'new-child', ids: { 'child-block': 'new-child-block', 'child-element': 'new-child-element' } }],
  ]);
  return { source, identities };
}

describe('strict board copy snapshots', () => {
  test('maps every block, element, connector, group, frame and internal document reference', () => {
    const { source, identities } = fixture();
    const before = canonicalSnapshot(source);
    const copy = remapCopySnapshot(source, identities);
    expect(canonicalSnapshot(source)).toBe(before);
    expect(copy.meta.id).toBe('new-source');
    const surface = copy.blocks.children[0];
    expect(surface.id).toBe('new-surface');
    expect(surface.props.elements).toEqual({
      'new-shape': { id: 'new-shape', type: 'shape', xywh: '[1,2,3,4]', fillColor: 'red' },
      'new-arrow': { id: 'new-arrow', type: 'connector', source: { id: 'new-shape', position: [0, 0] }, target: { id: 'new-frame' } },
      'new-group': { id: 'new-group', type: 'group', children: { '$blocksuite:surface:ymap$': true, json: { 'new-shape': true, 'new-arrow': true } } },
    });
    expect(surface.children[0].props.childElementIds).toEqual({ 'new-shape': true, 'new-group': true });
    expect(surface.children[1].props).toEqual({ pageId: 'new-child', params: { mode: 'edgeless', blockIds: ['new-child-block'], elementIds: ['new-child-element'] } });
    expect(surface.children[2].props).toEqual(source.blocks.children[0].children[2].props);
    const note = copy.blocks.children[1];
    expect(note.children[1].props.reference).toBe('new-shape');
    expect(note.children[2].props).toEqual({ sourceId: 'immutable-blob', caption: 'child' });
    expect(canonicalSnapshot(note.children[0].props)).toContain('new-child');
    expect(canonicalSnapshot(note.children[0].props)).toContain('new-frame');
    expect(canonicalSnapshot(note.children[0].props)).toContain('source child https://source');
    expect(inspectCopySnapshot(copy).ids.every(id => id.startsWith('new-'))).toBe(true);
  });

  test.each(['affine:database', 'affine:table', 'extension:unknown'])('rejects unsupported schema %s before import', flavour => {
    const { source } = fixture();
    source.blocks.children[1].children.push(block('unsupported', flavour));
    expect(() => inspectCopySnapshot(source)).toThrow('暂不支持');
  });

  test('rejects unsupported mindmaps and missing media', () => {
    const { source } = fixture();
    (source.blocks.children[0].props.elements as Record<string, unknown>).mindmap = { type: 'mindmap' };
    expect(() => inspectCopySnapshot(source)).toThrow('mindmap');
    delete (source.blocks.children[0].props.elements as Record<string, unknown>).mindmap;
    source.blocks.children[1].children[2].props.sourceId = '';
    expect(() => inspectCopySnapshot(source)).toThrow('媒体');
  });

  test('rejects dangling local connector or owned-document block references instead of randomizing', () => {
    const { source, identities } = fixture();
    source.blocks.children[0].children[1].props.params = { blockIds: ['missing'] };
    expect(() => remapCopySnapshot(source, identities)).toThrow('定位引用缺失');
    source.blocks.children[0].children[1].props.params = {};
    (source.blocks.children[0].props.elements as Record<string, { source: unknown }>).arrow.source = { id: 'missing' };
    expect(() => remapCopySnapshot(source, identities)).toThrow('内部引用缺失');
  });

  test('native regenerated audit props are not content, but custom metadata remains exact', () => {
    const { source } = fixture();
    const actual = structuredClone(source);
    Object.assign(actual.blocks.children[1].children[0].props, {'meta:createdAt': 42, 'meta:createdBy': 'copy-author', 'meta:updatedAt': 43, 'meta:updatedBy': 'copy-author'});
    expect(() => assertCopySnapshotEqual(source, actual)).not.toThrow();
    actual.blocks.children[1].children[0].props['meta:custom'] = 'changed';
    expect(() => assertCopySnapshotEqual(source, actual)).toThrow('校验失败');
  });

  test('truthy partial Transformer output, missing elements and changed content are never success', () => {
    const { source } = fixture();
    expect(() => assertCopySnapshotEqual(source, undefined)).toThrow('校验失败');
    const partial = structuredClone(source);
    partial.blocks.children[1].children.pop();
    expect(() => assertCopySnapshotEqual(source, partial)).toThrow('校验失败');
    const dropped = structuredClone(source);
    delete (dropped.blocks.children[0].props.elements as Record<string, unknown>).shape;
    expect(() => assertCopySnapshotEqual(source, dropped)).toThrow('校验失败');
    const changed = structuredClone(source);
    changed.blocks.children.reverse();
    expect(() => assertCopySnapshotEqual(source, changed)).toThrow('校验失败');
    expect(() => assertCopySnapshotEqual(source, JSON.parse(canonicalSnapshot(source)))).not.toThrow();
  });
});
