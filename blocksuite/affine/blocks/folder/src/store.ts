import {
  StoreExtensionProvider,
  type StoreExtensionContext,
} from '@blocksuite/affine-ext-loader';
import { FolderBlockSchemaExtension } from '@blocksuite/affine-model';

export class FolderStoreExtension extends StoreExtensionProvider {
  override name = 'affine-folder-block';
  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(FolderBlockSchemaExtension);
  }
}
