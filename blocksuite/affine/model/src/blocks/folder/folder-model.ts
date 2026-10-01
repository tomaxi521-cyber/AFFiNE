import { Bound } from '@blocksuite/global/gfx';
import { GfxCompatible, type GfxCommonBlockProps } from '@blocksuite/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type FolderBlockProps = Omit<GfxCommonBlockProps, 'scale'> & {
  title: string;
};

/** A persistent file container, not a gfx group or frame. */
export class FolderBlockModel extends GfxCompatible<FolderBlockProps>(
  BlockModel
) {
  /** Runtime-only app permission check. Never persisted in collaborative data. */
  canDelete: (() => boolean) | undefined;

  override beforeDelete(): boolean {
    const surface = this.parent;
    if (
      this.store.readonly ||
      this.isLocked() ||
      this.canDelete?.() === false ||
      surface?.flavour !== 'affine:surface'
    )
      return false;
    const children = [...this.children];
    // Refuse malformed/locked content rather than silently destroying it.
    if (
      children.some(
        child =>
          child.flavour !== 'affine:attachment' ||
          ('isLocked' in child && (child as { isLocked(): boolean }).isLocked())
      )
    )
      return false;
    const bound = this.elementBound;
    children.forEach((child, i) => {
      const props = child.props as { xywh?: string };
      let width = 320,
        height = 96;
      if (props.xywh) {
        const old = Bound.deserialize(props.xywh);
        if (old.w > 0 && old.h > 0) {
          width = old.w;
          height = old.h;
        }
      }
      this.store.updateBlock(child, {
        xywh: new Bound(
          bound.x + bound.w + 32 + i * 24,
          bound.y + i * 24,
          width,
          height
        ).serialize(),
      });
    });
    // Same ids/sourceIds, same native transaction/undo item. CRUD subsequently
    // observes an empty Y children array and cannot cascade into these files.
    if (children.length) this.store.moveBlocks(children, surface);
    // Store.transact reports and swallows CRUD exceptions. Fail closed if the
    // move did not empty the actual Y array (signals flush only after commit).
    return this.yBlock.get('sys:children').length === 0;
  }
}

export const FolderBlockSchema = defineBlockSchema({
  flavour: 'affine:folder',
  props: (): FolderBlockProps => ({
    title: '文件夹',
    xywh: '[0,0,420,320]',
    index: 'a0',
    rotate: 0,
    lockedBySelf: false,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:surface'],
    children: ['affine:attachment'],
  },
  toModel: () => new FolderBlockModel(),
});

export const FolderBlockSchemaExtension =
  BlockSchemaExtension(FolderBlockSchema);
