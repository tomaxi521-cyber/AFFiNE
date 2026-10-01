import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

export const mindMapSeniorTool = SeniorToolExtension(
  'mindMap',
  ({ block, toolbarContainer }) => {
    return {
      name: 'Mind Map',
      compact: [
        {
          id: 'mindmap',
          label: '思维导图',
          content: html`<edgeless-mindmap-tool-button
            .edgeless=${block}
            .toolbarContainer=${toolbarContainer}
            .compact=${true}
            kind="mindmap"
          ></edgeless-mindmap-tool-button>`,
        },
        {
          id: 'media',
          label: '图片与附件',
          content: html`<edgeless-mindmap-tool-button
            .edgeless=${block}
            .toolbarContainer=${toolbarContainer}
            .compact=${true}
            kind="media"
          ></edgeless-mindmap-tool-button>`,
        },
      ],
      content: html`<edgeless-mindmap-tool-button
        .edgeless=${block}
        .toolbarContainer=${toolbarContainer}
      ></edgeless-mindmap-tool-button>`,
    };
  }
);
