import {
  DefaultTool,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import { EmptyTool } from '@blocksuite/affine-gfx-pointer';
import { TextTool } from '@blocksuite/affine-gfx-text';
import type {
  MindmapElementModel,
  MindmapStyle,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  ThemeProvider,
  ViewportElementProvider,
} from '@blocksuite/affine-shared/services';
import {
  dikwCompactToolStyles,
  EdgelessDraggableElementController,
  EdgelessToolbarToolMixin,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { Bound } from '@blocksuite/global/gfx';
import { SignalWatcher } from '@blocksuite/global/lit';
import { computed } from '@preact/signals-core';
import { css, html, LitElement, nothing, svg } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { getMindMaps } from './assets.js';
import {
  type DraggableTool,
  getMindmapRender,
  mediaConfig,
  mediaRender,
  mindmapConfig,
  textConfig,
  textRender,
  toolConfig2StyleObj,
} from './basket-elements.js';
import {
  basketIconDark,
  basketIconLight,
  mindmapMenuMediaIcon,
  textIcon,
} from './icons.js';
import { importMindmap } from './utils/import-mindmap.js';

export class EdgelessMindmapToolButton extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  static override styles = [
    css`
      :host {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .partial-clip {
        flex-shrink: 0;
        box-sizing: border-box;
        width: calc(100% + 20px);
        pointer-events: none;
        padding: 0 10px;
        overflow: hidden;
      }
      .basket-wrapper {
        pointer-events: auto;
        height: 64px;
        width: 96px;
        display: flex;
        justify-content: center;
        align-items: flex-end;
        position: relative;
      }
      .basket,
      .basket-tool-item {
        transition: transform 0.3s ease-in-out;
        position: absolute;
      }

      .basket {
        bottom: 0;
        height: 17px;
        width: 76px;
      }
      .basket > div,
      .basket > svg {
        position: absolute;
      }
      .glass {
        width: 76px;
        height: 17px;
        border-radius: 2px;
        mask: url(#mindmap-basket-body-mask);
      }
      .glass.enabled {
        backdrop-filter: blur(2px);
      }
      @-moz-document url-prefix() {
        .glass.enabled {
          backdrop-filter: none;
        }
      }

      .basket {
        z-index: 3;
      }
      .basket-tool-item {
        cursor: grab;
      }
      .basket-tool-item svg {
        display: block;
      }
      .basket-tool-item {
        transform: translate(var(--default-x, 0), var(--default-y, 0))
          rotate(var(--default-r, 0)) scale(var(--default-s, 1));
        z-index: var(--default-z, 0);
      }

      .basket-tool-item.next {
        transform: translate(var(--next-x, 0), var(--next-y, 0))
          rotate(var(--next-r, 0)) scale(var(--next-s, 1));
        z-index: var(--next-z, 0);
      }

      /* active & hover */
      .basket-wrapper:hover .basket,
      .basket-wrapper.active .basket {
        z-index: 0;
      }
      .basket-wrapper:hover .basket-tool-item.current,
      .basket-wrapper.active .basket-tool-item.current {
        transform: translate(var(--active-x, 0), var(--active-y, 0))
          rotate(var(--active-r, 0)) scale(var(--active-s, 1));
        z-index: var(--active-z, 0);
      }

      .basket-tool-item.next.coming,
      .basket-wrapper:hover .basket-tool-item.current:hover {
        transform: translate(var(--hover-x, 0), var(--hover-y, 0))
          rotate(var(--hover-r, 0)) scale(var(--hover-s, 1));
        z-index: var(--hover-z, 0);
      }
    `,
    dikwCompactToolStyles,
  ];

  @property({ type: Boolean, reflect: true })
  accessor compact = false;

  @property()
  accessor kind: 'mindmap' | 'media' = 'mindmap';

  private _startingPlacement = false;
  private _controllerEventsBound = false;

  private readonly _style$ = computed(() => {
    const { style } =
      this.edgeless.std.get(EditPropsStore).lastProps$.value.mindmap;
    return style;
  });

  draggableController!: EdgelessDraggableElementController<DraggableTool>;

  override enableActiveBackground = true;

  override type = [EmptyTool, TextTool];

  get draggableTools(): DraggableTool[] {
    const style = this._style$.value;
    const mindmap =
      this.mindmaps.find((m) => m.style === style) || this.mindmaps[0];
    return [
      {
        name: 'media',
        icon: mindmapMenuMediaIcon,
        config: mediaConfig,
        standardWidth: 100,
        render: mediaRender,
      },
      {
        name: 'text',
        icon: textIcon,
        config: textConfig,
        standardWidth: 100,
        render: textRender,
      },
      {
        name: 'mindmap',
        icon: mindmap.icon,
        config: mindmapConfig,
        standardWidth: 350,
        render: getMindmapRender(style),
      },
    ];
  }

  get mindmaps() {
    return getMindMaps(this.theme);
  }

  get crud() {
    return this.edgeless.std.get(EdgelessCRUDIdentifier);
  }

  private _toggleMenu() {
    if (this.edgeless.store.readonly) return;
    if (this.popper) {
      this.popper.dispose();
      return;
    }
    this.setEdgelessTool(DefaultTool);

    const menu = this.createPopper('edgeless-mindmap-menu', this);
    Object.assign(menu.element, {
      edgeless: this.edgeless,
      onActiveStyleChange: (style: MindmapStyle) => {
        this.edgeless.std.get(EditPropsStore).recordLastProps('mindmap', {
          style,
        });
      },
      onImportMindMap: (bound: Bound) => {
        return importMindmap(bound).then((mindmap) => {
          if (this.edgeless.store.readonly || !this.isConnected) return;
          const id = this.crud.addElement('mindmap', {
            children: mindmap,
            layoutType: mindmap?.layoutType === 'left' ? 1 : 0,
          });
          if (!id) return;
          const element = this.crud.getElementById(id) as MindmapElementModel;

          this.tryDisposePopper();
          this.setEdgelessTool(DefaultTool);
          this.gfx.selection.set({
            elements: [element.tree.id],
            editing: false,
          });
        });
      },
    });
  }

  initDragController() {
    if (!this.edgeless || !this.toolbarContainer || this.kind === 'media')
      return;
    if (this.draggableController) return;
    this.draggableController = new EdgelessDraggableElementController(this, {
      edgeless: this.edgeless,
      scopeElement: this.toolbarContainer,
      standardWidth: 100,
      clickToDrag: false,
      onOverlayCreated: (overlay, { data }) => {
        const tool = this.draggableTools.find((t) => t.name === data.name);
        if (!tool) return;

        // recover the rotation
        const rotate = this.compact
          ? 0
          : (tool.config?.hover?.r ?? tool.config?.default?.r ?? 0);
        overlay.element.style.setProperty('--rotate', rotate + 'deg');
        setTimeout(() => {
          overlay.transitionWrapper.style.setProperty(
            '--rotate',
            -rotate + 'deg'
          );
        }, 50);

        // set the scale (without transition)
        const scale = this.compact
          ? 1
          : (tool.config?.hover?.s ?? tool.config?.default?.s ?? 1);
        overlay.element.style.setProperty('--scale', `${scale}`);

        // a workaround to handle getBoundingClientRect() when the element is rotated
        const _left = parseInt(overlay.element.style.left);
        const _top = parseInt(overlay.element.style.top);
        if (data.name === 'mindmap') {
          overlay.element.style.left = _left + 3 + 'px';
          overlay.element.style.top = _top + 5 + 'px';
        } else if (data.name === 'text') {
          overlay.element.style.left = _left + 0 + 'px';
          overlay.element.style.top = _top + 3 + 'px';
        }
        this.readyToDrop = true;
      },
      onCanceled: (overlay) => {
        overlay.transitionWrapper.style.transformOrigin = 'unset';
        overlay.transitionWrapper.style.setProperty('--rotate', '0deg');
        this.readyToDrop = false;
      },
      onDrop: (el, bound) => {
        this.readyToDrop = false;
        if (this.edgeless.store.readonly || !this.isConnected) return;
        el.data
          .render(bound, this.edgeless)
          .then((id) => {
            if (!id) return;
            this.readyToDrop = false;
            if (el.data.name === 'mindmap') {
              this.setEdgelessTool(DefaultTool);
              this.gfx.selection.set({
                elements: [id],
                editing: false,
              });
            } else if (el.data.name === 'text') {
              this.setEdgelessTool(DefaultTool);
            }
          })
          .catch(console.error);
      },
    });

    this._bindControllerEvents();
  }

  private _bindControllerEvents() {
    if (
      this._controllerEventsBound ||
      !this.draggableController ||
      this.kind === 'media'
    )
      return;
    this._controllerEventsBound = true;
    this.disposables.add(() => {
      this._controllerEventsBound = false;
    });
    this.disposables.add(
      this.edgeless.bindHotKey(
        {
          m: () => {
            if (this.edgeless.store.readonly || !this.isConnected) return;
            const gfx = this.gfx;
            const locked = gfx.viewport.locked;
            if (locked) return;
            if (gfx.selection.editing) return;

            if (this.readyToDrop) {
              // change the style
              const activeIndex = this.mindmaps.findIndex(
                (m) => m.style === this._style$.value
              );
              const nextIndex = (activeIndex + 1) % this.mindmaps.length;
              const next = this.mindmaps[nextIndex];
              this.edgeless.std.get(EditPropsStore).recordLastProps('mindmap', {
                style: next.style,
              });
              const tool = this.draggableTools.find(
                (t) => t.name === 'mindmap'
              );
              this.draggableController.updateElementInfo({
                data: tool,
                preview: next.icon,
              });
              return;
            }
            const icon = this.mindmapElement;
            if (!icon) return;
            const { x, y } = gfx.tool.lastMouseViewPos$.peek();
            const { viewport } = this.edgeless.std.get(ViewportElementProvider);
            const { left, top } = viewport;
            const clientPos = { x: x + left, y: y + top };
            this._startMindmapPlacement(clientPos);
          },
        },
        { global: true }
      )
    );

    // since there is not a tool called mindmap, we need to cancel the drag when the tool is changed
    this.disposables.add(
      this.gfx.tool.currentToolName$.subscribe((toolName) => {
        // FIXME: remove the assertion after gfx tool refactor
        if ((toolName as string) !== 'empty' && this.readyToDrop) {
          this.draggableController.cancel();
        }
      })
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this._bindControllerEvents();
  }

  override disconnectedCallback() {
    // The native ReactiveController also removes its window mouseup listeners.
    this.draggableController?.removeAllEvents();
    this.draggableController?.reset();
    this.readyToDrop = false;
    super.disconnectedCallback();
  }

  private _startMindmapPlacement(clientPos?: { x: number; y: number }) {
    if (
      this.edgeless.store.readonly ||
      this.gfx.viewport.locked ||
      !this.isConnected
    )
      return;
    this.initDragController();
    const target = this.mindmapElement;
    if (!target || !this.draggableController) return;
    this.popper?.dispose();
    this.setEdgelessTool(EmptyTool);
    const rect = this.gfx.viewport.boundingClientRect;
    this._startingPlacement = true;
    try {
      this.draggableController.dragAndMoveTo(
        target,
        clientPos ?? {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }
      );
    } finally {
      this._startingPlacement = false;
    }
  }

  private _onCompactPlacementStart(event: MouseEvent) {
    // Only dragAndMoveTo's synchronous native target event starts placement.
    // Physical pointerdown alone must not start a second placement gesture.
    if (!this._startingPlacement || this.edgeless.store.readonly) return;
    const tool = this.draggableTools.find((tool) => tool.name === 'mindmap');
    if (!tool) return;
    this.draggableController.onMouseDown(event, {
      data: tool,
      preview: tool.icon,
      standardWidth: tool.standardWidth,
    });
  }

  private _openMedia() {
    if (this.edgeless.store.readonly || this.gfx.viewport.locked) return;
    const { centerX, centerY } = this.gfx.viewport;
    mediaRender(new Bound(centerX, centerY, 0, 0), this.edgeless).catch(
      console.error
    );
  }

  override render() {
    if (this.compact) {
      const media = this.kind === 'media';
      const label = media ? '图片与附件' : '思维导图';
      return html`
        <button
          type="button"
          class="dikw-compact-button ${media ? '' : 'dikw-mindmap-target'}"
          title=${media ? label : '思维导图（M）'}
          aria-label=${label}
          aria-pressed=${!media && this.readyToDrop}
          ?disabled=${this.edgeless.store.readonly}
          @mousedown=${this._onCompactPlacementStart}
          @click=${() =>
            media ? this._openMedia() : this._startMindmapPlacement()}
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
            ${media
              ? svg`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-5 5 6"/>`
              : svg`<rect x="2" y="9" width="7" height="6" rx="1"/><path d="M9 12h4M13 5v14M13 5h3M13 12h3M13 19h3"/><rect x="16" y="3" width="6" height="4" rx="1"/><rect x="16" y="10" width="6" height="4" rx="1"/><rect x="16" y="17" width="6" height="4" rx="1"/>`}
          </svg>
        </button>
      `;
    }

    const { popper } = this;
    const appTheme = this.edgeless.std.get(ThemeProvider).app$.value;
    const basketIcon = appTheme === 'light' ? basketIconLight : basketIconDark;
    const glassBg =
      appTheme === 'light' ? 'rgba(255,255,255,0.5)' : 'rgba(74, 74, 74, 0.6)';

    const { cancelled, dragOut, draggingElement } =
      this.draggableController?.states || {};

    const active = popper || draggingElement;

    return html`<edgeless-toolbar-button
      class="edgeless-mindmap-button"
      ?withHover=${true}
      .tooltip=${popper ? '' : 'Others'}
      .tooltipOffset=${4}
      @click=${this._toggleMenu}
      style="width: 100%; height: 100%; display: inline-block"
    >
      <div class="partial-clip">
        <div class="basket-wrapper ${active ? 'active' : ''}">
          ${repeat(
            this.draggableTools,
            (t) => t.name,
            (tool) => {
              const isBeingDragged = draggingElement?.data.name === tool.name;
              const variables = toolConfig2StyleObj(tool.config);

              const nextStyle = styleMap({
                ...variables,
              });
              const currentStyle = styleMap({
                ...variables,
                opacity: isBeingDragged ? 0 : 1,
                pointerEvents: draggingElement ? 'none' : 'auto',
              });

              return html`${isBeingDragged
                  ? html`<div
                      class=${classMap({
                        'basket-tool-item': true,
                        next: true,
                        coming: !!dragOut && !cancelled,
                      })}
                      style=${nextStyle}
                    >
                      ${tool.icon}
                    </div>`
                  : nothing}

                <div
                  style=${currentStyle}
                  @mousedown=${(e: MouseEvent) =>
                    this.draggableController.onMouseDown(e, {
                      data: tool,
                      preview: tool.icon,
                      standardWidth: tool.standardWidth,
                    })}
                  @touchstart=${(e: TouchEvent) =>
                    this.draggableController.onTouchStart(e, {
                      data: tool,
                      preview: tool.icon,
                      standardWidth: tool.standardWidth,
                    })}
                  class="basket-tool-item current ${tool.name}"
                >
                  ${tool.icon}
                </div>`;
            }
          )}

          <div class="basket">
            <div
              class="glass ${this.enableBlur ? 'enabled' : ''}"
              style="background: ${glassBg}"
            ></div>
            ${basketIcon}
          </div>
        </div>
      </div>

      <svg width="0" height="0" style="opacity: 0; pointer-events: none">
        <defs>
          <mask id="mindmap-basket-body-mask">
            <rect
              x="2"
              width="71.8"
              y="2"
              height="15"
              rx="1.5"
              ry="1.5"
              fill="white"
            />
            <rect
              width="32"
              height="6"
              x="22"
              y="5.9"
              fill="black"
              rx="3"
              ry="3"
            />
          </mask>
        </defs>
      </svg>
    </edgeless-toolbar-button>`;
  }

  override updated(_changedProperties: Map<PropertyKey, unknown>) {
    const controllerRequiredProps = ['edgeless', 'toolbarContainer'] as const;
    if (
      controllerRequiredProps.some((p) => _changedProperties.has(p)) &&
      !this.draggableController
    ) {
      this.initDragController();
    }
  }

  @property({ type: Boolean })
  accessor enableBlur = true;

  @query('.dikw-mindmap-target, .basket-tool-item.mindmap')
  accessor mindmapElement!: HTMLElement;

  @state()
  accessor readyToDrop = false;
}
