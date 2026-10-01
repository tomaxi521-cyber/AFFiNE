import { QuickToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

import { buildLinkDenseMenu } from './toolbar/link-dense-menu';

export const linkQuickTool = QuickToolExtension('link', ({ block, gfx }) => {
  return {
    content: html`<edgeless-link-tool-button
      .edgeless=${block}
    ></edgeless-link-tool-button>`,
    compact: [
      {
        id: 'link',
        label: '链接',
        content: html`<edgeless-link-tool-button
          .edgeless=${block}
          .compact=${true}
        ></edgeless-link-tool-button>`,
      },
    ],
    menu: buildLinkDenseMenu(block, gfx),
  };
});
