import { OfflineHtmlView } from './offline-html-view';
import { AttachmentBlockComponent } from './attachment-block';
import { AttachmentEdgelessBlockComponent } from './attachment-edgeless-block';

export function effects() {
  customElements.define('dikw-offline-html', OfflineHtmlView);
  customElements.define(
    'affine-edgeless-attachment',
    AttachmentEdgelessBlockComponent
  );
  customElements.define('affine-attachment', AttachmentBlockComponent);
}
