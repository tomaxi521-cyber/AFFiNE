import {
  ViewExtensionProvider,
  type ViewExtensionContext,
} from '@blocksuite/affine-ext-loader';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { literal } from 'lit/static-html.js';
import { FolderBlockComponent } from './folder-block';
import { FolderPermissionWatcher } from './permissions';

export class FolderViewExtension extends ViewExtensionProvider {
  override name = 'affine-folder-block';
  override effect() {
    super.effect();
    if (!customElements.get('affine-folder'))
      customElements.define('affine-folder', FolderBlockComponent);
  }
  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension('affine:folder'),
      BlockViewExtension('affine:folder', literal`affine-folder`),
      FolderPermissionWatcher,
    ]);
    if (this.isEdgeless(context.scope))
      context.register(
        GfxViewInteractionExtension('affine:folder', {
          resizeConstraint: { lockRatio: false },
          handleResize: () => ({
            beforeResize: ({ set }) => set({ minWidth: 320, minHeight: 260 }),
          }),
          handleRotate: () => ({
            beforeRotate: ({ set }) => set({ rotatable: false }),
          }),
        })
      );
  }
}
