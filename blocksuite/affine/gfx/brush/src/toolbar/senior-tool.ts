import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

export const penSeniorTool = SeniorToolExtension('pen', ({ block }) => {
  return {
    name: '画笔',
    compact: [
      {
        id: 'brush',
        label: '画笔',
        content: html`<edgeless-pen-tool-button
          .edgeless=${block}
          .compact=${true}
        ></edgeless-pen-tool-button>`,
      },
      {
        id: 'eraser',
        label: '橡皮擦',
        content: html`<edgeless-eraser-tool-button
          .edgeless=${block}
          .compact=${true}
        ></edgeless-eraser-tool-button>`,
      },
    ],
    content: html`<div class="pen-and-eraser">
      <edgeless-pen-tool-button .edgeless=${block}></edgeless-pen-tool-button>

      <edgeless-eraser-tool-button
        .edgeless=${block}
      ></edgeless-eraser-tool-button>
    </div> `,
  };
});
