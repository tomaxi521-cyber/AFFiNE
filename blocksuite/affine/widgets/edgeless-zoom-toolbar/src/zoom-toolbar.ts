import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { HandIcon, SelectIcon, MinusIcon, PlusIcon, ViewBarIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  ToolIdentifier,
  type ToolType,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import clamp from 'lodash-es/clamp';

export class EdgelessZoomToolbar extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
    }

    .edgeless-zoom-toolbar-container {
      display: flex;
      align-items: center;
      background: transparent;
      border-radius: 8px;
      fill: currentcolor;
      padding: 4px;
    }

    .edgeless-zoom-toolbar-container.horizantal {
      flex-direction: row;
    }

    .edgeless-zoom-toolbar-container.vertical {
      flex-direction: column;
      width: 40px;
      background-color: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-2);
      border: 1px solid var(--affine-border-color);
      border-radius: 8px;
    }

    .edgeless-zoom-toolbar-container[level='second'] {
      position: absolute;
      bottom: 8px;
      transform: translateY(-100%);
    }

    .edgeless-zoom-toolbar-container[hidden] {
      display: none;
    }

    .zoom-percent {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 32px;
      border: none;
      box-sizing: border-box;
      padding: 4px;
      color: var(--affine-icon-color);
      background-color: transparent;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .dikw-view { --dikw-view-button-size:36px; display:flex; position:relative; gap:2px; padding:5px; border:1px solid var(--affine-border-color); border-radius:10px; background:var(--affine-background-overlay-panel-color); box-shadow:0 3px 14px rgb(0 0 0 / 8%); color:var(--affine-text-primary-color); }
    .dikw-view button { flex-shrink:0; width:var(--dikw-view-button-size); height:var(--dikw-view-button-size); padding:0; border:0; border-radius:7px; color:inherit; background:transparent; cursor:pointer; }
    .dikw-view button svg { width:20px; height:20px; vertical-align:middle; }
    .dikw-view button:hover, .dikw-view button[aria-pressed='true'], .dikw-view button[aria-expanded='true'] { background:var(--affine-hover-color); }
    .dikw-view button:focus-visible { outline:2px solid var(--affine-primary-color); outline-offset:-2px; }
    .dikw-view button:disabled { opacity:.35; cursor:not-allowed; }
    .dikw-view .pct { width:60px; font-size:12px; font-variant-numeric:tabular-nums; }
    .dikw-view .separator { flex-shrink:0; width:1px; background:var(--affine-border-color); margin:6px 2px; }
    .dikw-view-menu { position:absolute; bottom:calc(100% + 8px); right:0; width:220px; max-height:calc(100vh - 130px); overflow:auto; padding:8px; background:var(--affine-background-overlay-panel-color); border:1px solid var(--affine-border-color); border-radius:10px; box-shadow:var(--affine-shadow-2); }
    .dikw-view-menu button { display:block; width:100%; padding:0 12px; text-align:left; }
    @media (pointer: coarse) {
      .dikw-view { --dikw-view-button-size:44px; }
    }
    .zoom-percent:hover {
      color: var(--affine-primary-color);
      background-color: var(--affine-hover-color);
    }

    .zoom-percent[disabled] {
      pointer-events: none;
      cursor: not-allowed;
      color: var(--affine-text-disable-color);
    }
  `;

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get edgelessTool() {
    return this.gfx.tool.currentToolOption$.peek();
  }

  get locked() {
    return this.viewport.locked;
  }

  get viewport() {
    return this.gfx.viewport;
  }

  setZoomByStep = (step: number) => {
    this.viewport.smoothZoom(clamp(this.zoom + step, ZOOM_MIN, ZOOM_MAX));
  };

  get zoom() {
    if (!this.viewport) {
      console.error('Something went wrong, viewport is not available');
      return 1;
    }
    return this.viewport.zoom;
  }

  private _isVerticalBar() {
    return this.layout === 'vertical';
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      effect(() => {
        void this.gfx.tool.currentToolName$.value;
        this.requestUpdate();
      })
    );
  }

  override firstUpdated() {
    const { disposables } = this;
    const away=(e:PointerEvent)=>{if(!e.composedPath().includes(this))this._dikwMenu=false;};
    window.addEventListener('pointerdown',away,true);
    disposables.add(()=>window.removeEventListener('pointerdown',away,true));
    disposables.add(
      this.viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
    disposables.add(
      this.slots.readonlyUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  @property({attribute:false}) accessor dikw = false;
  @state() private accessor _dikwMenu = false;

  private _renderDikw() {
    const tool=this.gfx.tool.currentToolName$.value;
    const pointer = tool === 'pan' ? 'pan' : 'default';
    const switchPointer = () => {
      if(this.locked)return;
      const target=tool==='default'?'pan':'default';
      const controller=this.std.getOptional(ToolIdentifier(target));
      if(controller)this.gfx.tool.setTool(controller.constructor as ToolType,target==='pan'?{panning:false}:{});
    };
    const close = () => {this._dikwMenu=false; void this.updateComplete.then(()=>this.renderRoot.querySelector<HTMLButtonElement>('.pct')?.focus());};
    return html`<div class="dikw-view" role="toolbar" aria-label="白板视图控制"
      @pointerdown=${stopPropagation} @pointerup=${stopPropagation} @mousedown=${stopPropagation} @mouseup=${stopPropagation} @click=${stopPropagation} @dblclick=${stopPropagation} @wheel=${stopPropagation}
      @keydown=${(e:KeyboardEvent)=>{if(e.key==='Escape'){close();e.preventDefault();} e.stopPropagation();}} @keyup=${stopPropagation}>
      <button aria-label=${pointer==='pan'?'抓手，点击切换到选择':'选择，点击切换到抓手'} title="选择 V / 抓手 H" data-tool="pointer" aria-pressed=${tool==='pan'||tool==='default'} ?disabled=${this.locked} @click=${switchPointer}>${pointer==='pan'?HandIcon():SelectIcon()}</button>
      <span class="separator"></span>
      <button aria-label="缩小" title="缩小" ?disabled=${this.locked || this.zoom<=ZOOM_MIN} @click=${()=>this.setZoomByStep(-ZOOM_STEP)}>${MinusIcon()}</button>
      <button class="pct" aria-label="视图设置" title="缩放与视图设置" aria-expanded=${this._dikwMenu} ?disabled=${this.locked} @click=${()=>this._dikwMenu=!this._dikwMenu}>${Math.round(this.zoom*100)}% ⌄</button>
      <button aria-label="放大" title="放大" ?disabled=${this.locked || this.zoom>=ZOOM_MAX} @click=${()=>this.setZoomByStep(ZOOM_STEP)}>${PlusIcon()}</button>
      ${this._dikwMenu?html`<div class="dikw-view-menu" role="group" aria-label="缩放与视图设置">
        <button @click=${()=>{this.gfx.fitToScreen();close();}}>适应全部内容</button>
        ${[.5,1,1.5,2].map(zoom=>html`<button @click=${()=>{this.viewport.smoothZoom(zoom);close();}}>${zoom*100}%${zoom===1?' · 实际大小':''}</button>`)}
      </div>`:nothing}
    </div>`;
  }

  override render() {
    if(this.dikw) return this._renderDikw();
    if (this.std.store.readonly) {
      return nothing;
    }

    const formattedZoom = `${Math.round(this.zoom * 100)}%`;
    const classes = `edgeless-zoom-toolbar-container ${this.layout}`;
    const locked = this.locked;

    return html`
      <div
        class=${classes}
        @dblclick=${stopPropagation}
        @mousedown=${stopPropagation}
        @mouseup=${stopPropagation}
        @pointerdown=${stopPropagation}
      >
        <edgeless-tool-icon-button
          .tooltip=${'Fit to screen'}
          .tipPosition=${this._isVerticalBar() ? 'right' : 'top-end'}
          .arrow=${!this._isVerticalBar()}
          @click=${() => this.gfx.fitToScreen()}
          .iconContainerPadding=${4}
          .iconSize=${'24px'}
          .disabled=${locked}
        >
          ${ViewBarIcon()}
        </edgeless-tool-icon-button>
        <edgeless-tool-icon-button
          .tooltip=${'Zoom out'}
          .tipPosition=${this._isVerticalBar() ? 'right' : 'top'}
          .arrow=${!this._isVerticalBar()}
          @click=${() => this.setZoomByStep(-ZOOM_STEP)}
          .iconContainerPadding=${4}
          .iconSize=${'24px'}
          .disabled=${locked}
        >
          ${MinusIcon()}
        </edgeless-tool-icon-button>
        <button
          class="zoom-percent"
          @click=${() => this.viewport.smoothZoom(1)}
          .disabled=${locked}
        >
          ${formattedZoom}
        </button>
        <edgeless-tool-icon-button
          .tooltip=${'Zoom in'}
          .tipPosition=${this._isVerticalBar() ? 'right' : 'top'}
          .arrow=${!this._isVerticalBar()}
          @click=${() => this.setZoomByStep(ZOOM_STEP)}
          .iconContainerPadding=${4}
          .iconSize=${'24px'}
          .disabled=${locked}
        >
          ${PlusIcon()}
        </edgeless-tool-icon-button>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor layout: 'horizontal' | 'vertical' = 'horizontal';

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
