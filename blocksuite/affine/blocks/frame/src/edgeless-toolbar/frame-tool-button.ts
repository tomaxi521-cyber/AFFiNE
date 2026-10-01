import {
  QuickToolMixin,
  dikwCompactToolStyles,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { FrameIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import { FrameTool } from '../frame-tool';

export class EdgelessFrameToolButton extends QuickToolMixin(LitElement) {
  static override styles = [
    css`
      :host {
        display: flex;
      }
    `,
    dikwCompactToolStyles,
  ];

  @property({ type: Boolean, reflect: true })
  accessor compact = false;

  override type = FrameTool;

  private _toggleFrameMenu() {
    if (this.tryDisposePopper()) return;

    const menu = this.createPopper('edgeless-frame-menu', this);
    menu.element.edgeless = this.edgeless;
  }

  override render() {
    if (this.compact) {
      return html`<button
        type="button"
        class="dikw-compact-button"
        title="框架（F）"
        aria-label="框架"
        aria-pressed=${this.edgelessTool?.toolType === FrameTool}
        ?disabled=${this.edgeless.store.readonly}
        @click=${() => {
          if (this.edgeless.store.readonly) return;
          this._toggleFrameMenu();
          this.setEdgelessTool(FrameTool);
        }}
      >
        ${FrameIcon()}
      </button>`;
    }
    const type = this.edgelessTool?.toolType?.toolName;
    return html`
      <edgeless-tool-icon-button
        class="edgeless-frame-button"
        .tooltip=${this.popper
          ? ''
          : html`<affine-tooltip-content-with-shortcut
              data-tip="${'Frame'}"
              data-shortcut="${'F'}"
            ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${17}
        .iconSize=${'24px'}
        .active=${type === 'frame'}
        .iconContainerPadding=${6}
        @click=${() => {
          // don't update tool before toggling menu
          this._toggleFrameMenu();
          this.setEdgelessTool(FrameTool);
        }}
      >
        ${FrameIcon()}
        <toolbar-arrow-up-icon></toolbar-arrow-up-icon>
      </edgeless-tool-icon-button>
    `;
  }
}
