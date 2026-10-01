import { QuickToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

import { buildFrameDenseMenu } from './frame-dense-menu';

export const frameQuickTool = QuickToolExtension('frame', ({ block, gfx }) => {
  return {
    type: 'frame',
    compact: [
      {
        id: 'frame',
        label: '框架',
        content: html`<edgeless-frame-tool-button
          .edgeless=${block}
          .compact=${true}
        ></edgeless-frame-tool-button>`,
      },
    ],
    content: html`<edgeless-frame-tool-button
      .edgeless=${block}
    ></edgeless-frame-tool-button>`,
    menu: buildFrameDenseMenu(block, gfx),
    enable: !block.store.readonly,
    priority: 90,
  };
});
