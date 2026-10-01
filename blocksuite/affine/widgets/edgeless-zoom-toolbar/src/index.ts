import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import { IS_MOBILE } from '@blocksuite/global/env';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

export const AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET =
  'affine-edgeless-zoom-toolbar-widget';

export class AffineEdgelessZoomToolbarWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    :host {
      position: absolute;
      bottom: var(--affine-edgeless-zoom-toolbar-bottom, 20px);
      left: 12px;
      z-index: var(--affine-z-index-popover);
      display: flex;
      justify-content: center;
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
    }

    :host([data-dikw-board]) { left: auto; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); pointer-events: auto; }
    :host([data-dikw-board]) edgeless-zoom-toolbar { display: block; }
    mobile-zoom-ruler {
      pointer-events: auto;
    }

    @container viewport (width <= 1200px) {
      edgeless-zoom-toolbar {
        display: none;
      }
    }

    @container viewport (width > 1200px) {
      zoom-bar-toggle-button {
        display: none;
      }
    }
  `;

  get edgeless() {
    return this.block;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  override connectedCallback() {
    super.connectedCallback();
    const graph=this.store.workspace.doc.getMap('dikw:board-graph:v1');
    const refresh=()=>this.requestUpdate();graph.observe(refresh);
    this.disposables.add(()=>graph.unobserve(refresh));

    this.disposables.add(
      effect(() => {
        const currentTool = this.gfx.tool.currentToolName$.value;

        if (currentTool !== 'frameNavigator') {
          this._hide = false;
        }
        this.requestUpdate();
      })
    );
  }

  override firstUpdated() {
    const { disposables, std } = this;
    const slots = std.get(EdgelessLegacySlotIdentifier);

    disposables.add(
      slots.navigatorSettingUpdated.subscribe(({ hideToolbar }) => {
        if (hideToolbar !== undefined) {
          this._hide = hideToolbar;
        }
      })
    );
  }

  override render() {
    if (this._hide) {
      return nothing;
    }

    // The DIKW relation is the board boundary; plain edgeless docs retain native chrome.
    const relation = this.store.workspace.doc.getMap('dikw:board-graph:v1').get('board:'+this.store.id) as {version?: number; docId?: string} | undefined;
    const dikw = relation?.version === 1 && relation.docId === this.store.id;
    this.toggleAttribute('data-dikw-board', dikw);
    if (dikw) return html`<edgeless-zoom-toolbar .std=${this.std} .dikw=${true}></edgeless-zoom-toolbar>`;
    if (IS_MOBILE) {
      return html`<mobile-zoom-ruler .std=${this.std}></mobile-zoom-ruler>`;
    }

    return html`
      <edgeless-zoom-toolbar .std=${this.std}></edgeless-zoom-toolbar>
      <zoom-bar-toggle-button .std=${this.std}></zoom-bar-toggle-button>
    `;
  }

  @state()
  private accessor _hide = false;
}

export const edgelessZoomToolbarWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET,
  literal`${unsafeStatic(AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET)}`
);
