import { DefaultTool } from '@blocksuite/affine-block-surface';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  EdgelessToolbarToolMixin,
  dikwCompactToolStyles,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import { EraserTool } from '../../../eraser-tool';
import { EdgelessEraserDarkIcon, EdgelessEraserLightIcon } from './icons.js';

export class EdgelessEraserToolButton extends EdgelessToolbarToolMixin(
  LitElement
) {
  static override styles = [
    css`
      :host {
        height: 100%;
        overflow-y: hidden;
      }
      .eraser-button {
        display: flex;
        justify-content: center;
        align-items: flex-end;
        position: relative;
        width: 49px;
        height: 64px;
      }
      #edgeless-eraser-icon {
        transition: transform 0.3s ease-in-out;
        transform: translateY(8px);
      }
      .eraser-button:hover #edgeless-eraser-icon,
      .eraser-button.active #edgeless-eraser-icon {
        transform: translateY(0);
      }
    `,
    dikwCompactToolStyles,
  ];

  @property({ type: Boolean, reflect: true })
  accessor compact = false;

  override enableActiveBackground = true;

  override type = EraserTool;

  override firstUpdated() {
    this.disposables.add(
      this.edgeless.bindHotKey(
        {
          Escape: () => {
            if (this.edgelessTool.toolType === EraserTool) {
              this.setEdgelessTool(DefaultTool);
            }
          },
        },
        { global: true }
      )
    );
  }

  override render() {
    if (this.compact) {
      return html`<button
        type="button"
        class="dikw-compact-button"
        title="橡皮擦（E）"
        aria-label="橡皮擦"
        aria-pressed=${this.edgelessTool?.toolType === EraserTool}
        ?disabled=${this.edgeless.store.readonly}
        @click=${() => {
          if (this.edgeless.store.readonly) return;
          this.setEdgelessTool(EraserTool);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="m14 4 6 6a2 2 0 0 1 0 3l-7 7H8l-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0ZM7 8l9 9M12 20h9"
          />
        </svg>
      </button>`;
    }
    const type = this.edgelessTool?.toolType;
    const appTheme = this.edgeless.std.get(ThemeProvider).app$.value;
    const icon =
      appTheme === 'dark' ? EdgelessEraserDarkIcon : EdgelessEraserLightIcon;

    return html`
      <edgeless-toolbar-button
        class="edgeless-eraser-button"
        .tooltip=${html`<affine-tooltip-content-with-shortcut
          data-tip="${'橡皮擦'}"
          data-shortcut="${'E'}"
        ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${4}
        .active=${type === EraserTool}
        @click=${() => this.setEdgelessTool(EraserTool)}
      >
        <div class="eraser-button">${icon}</div>
      </edgeless-toolbar-button>
    `;
  }
}
