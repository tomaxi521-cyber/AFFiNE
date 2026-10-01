import { insertLinkByQuickSearchCommand } from '@blocksuite/affine-block-bookmark';
import { insertEmbedCard } from '@blocksuite/affine-block-embed';
import { DefaultTool } from '@blocksuite/affine-block-surface';
import { toggleEmbedCardCreateModal } from '@blocksuite/affine-components/embed-card-modal';
import { LinkIcon } from '@blocksuite/affine-components/icons';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import {
  QuickToolMixin,
  dikwCompactToolStyles,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class EdgelessLinkToolButton extends QuickToolMixin(LitElement) {
  static override styles = [
    css`
      .link-icon,
      .link-icon > svg {
        width: 24px;
        height: 24px;
      }
    `,
    dikwCompactToolStyles,
  ];

  @property({ type: Boolean, reflect: true })
  accessor compact = false;

  override type = DefaultTool;

  private _onClick() {
    if (this.compact && this.edgeless.store.readonly) return;
    const [success, { insertedLinkType }] = this.edgeless.std.command.exec(
      insertLinkByQuickSearchCommand
    );

    if (!success) {
      // fallback to create a bookmark block with input modal
      toggleEmbedCardCreateModal(
        this.edgeless.host,
        'Links',
        'The added link will be displayed as a card view.',
        {
          mode: 'edgeless',
          onSave: (url) => {
            if (this.compact && this.edgeless.store.readonly) return;
            insertEmbedCard(this.edgeless.std, {
              flavour: 'affine:bookmark',
              targetStyle: 'vertical',
              props: { url },
            });
          },
        },
        ({ mode }) => {
          if (mode === 'edgeless') {
            const gfx = this.edgeless.std.get(GfxControllerIdentifier);
            gfx.tool.setTool(DefaultTool);
          }
        }
      ).catch(console.error);
      return;
    }

    insertedLinkType
      ?.then((type) => {
        const flavour = type?.flavour;
        if (!flavour) return;

        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('CanvasElementAdded', {
            control: 'toolbar:general',
            page: 'whiteboard editor',
            module: 'toolbar',
            segment: 'toolbar',
            type: flavour.split(':')[1],
          });

        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('LinkedDocCreated', {
            control: 'links',
            page: 'whiteboard editor',
            module: 'edgeless toolbar',
            segment: 'whiteboard',
            type: flavour.split(':')[1],
            other: 'existing doc',
          });
      })
      .catch(console.error);
  }

  override render() {
    if (this.compact) {
      return html`<button
        type="button"
        class="dikw-compact-button"
        title="链接（@）"
        aria-label="链接"
        aria-pressed=${false}
        ?disabled=${this.edgeless.store.readonly}
        @click=${() => {
          if (this.edgeless.store.readonly) return;
          this._onClick();
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
            d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
            transform="translate(1 0) scale(.9 1)"
          />
        </svg>
      </button>`;
    }
    return html`<edgeless-tool-icon-button
      .iconContainerPadding="${6}"
      .tooltip="${html`<affine-tooltip-content-with-shortcut
        data-tip="${'Link'}"
        data-shortcut="${'@'}"
      ></affine-tooltip-content-with-shortcut>`}"
      .tooltipOffset=${17}
      class="edgeless-link-tool-button"
      @click=${this._onClick}
    >
      <span class="link-icon">${LinkIcon}</span>
    </edgeless-tool-icon-button>`;
  }
}
