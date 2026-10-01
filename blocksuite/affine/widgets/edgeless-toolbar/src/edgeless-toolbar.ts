/* oxlint-disable typescript/no-non-null-assertion */
import {
  DefaultTool,
  EdgelessLegacySlotIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  type MenuHandler,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import {
  darkToolbarStyles,
  lightToolbarStyles,
} from '@blocksuite/affine-components/toolbar';
import { ColorScheme, type RootBlockModel } from '@blocksuite/affine-model';
import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/lit';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { autoPlacement, offset } from '@floating-ui/dom';
import { ContextProvider } from '@lit/context';
import { computed } from '@preact/signals-core';
import { baseTheme, cssVar } from '@toeverything/theme';
import { css, html, nothing, unsafeCSS } from 'lit';
import { query, state } from 'lit/decorators.js';
import { cache } from 'lit/directives/cache.js';
import { repeat } from 'lit/directives/repeat.js';
import { DIKW_PINS_KEY, readPins, movePin } from './dikw-pins.js';
import type { CompactTool } from './extension/index.js';
import { literal, unsafeStatic } from 'lit/static-html.js';
import debounce from 'lodash-es/debounce';
import { Subject } from 'rxjs';

import {
  edgelessToolbarContext,
  type EdgelessToolbarSlots,
  edgelessToolbarSlotsContext,
  edgelessToolbarThemeContext,
} from './context.js';
import type { MenuPopper } from './create-popper.js';
import {
  DIKW_BOARD_GRAPH_MAP,
  isDikwBoard,
  renderDikwToolbar,
  renderDikwToolOptions,
} from './dikw-toolbar.js';
import { dikwToolbarStyles } from './dikw-toolbar.styles.js';
import {
  QuickToolIdentifier,
  SeniorToolIdentifier,
} from './extension/index.js';

const TOOLBAR_PADDING_X = 12;
const TOOLBAR_HEIGHT = 64;
const QUICK_TOOLS_GAP = 10;
const QUICK_TOOL_SIZE = 36;
const QUICK_TOOL_MORE_SIZE = 20;
const SENIOR_TOOLS_GAP = 0;
const SENIOR_TOOL_WIDTH = 96;
const SENIOR_TOOL_NAV_SIZE = 20;
const DIVIDER_WIDTH = 8;
const DIVIDER_SPACE = 8;
const SAFE_AREA_WIDTH = 64;

export const EDGELESS_TOOLBAR_WIDGET = 'edgeless-toolbar-widget';
export class EdgelessToolbarWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    :host {
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      position: absolute;
      z-index: 1;
      left: calc(50%);
      transform: translateX(-50%);
      bottom: 0;
      -webkit-user-select: none;
      user-select: none;
      width: 100%;
      pointer-events: none;
    }
    .edgeless-toolbar-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    ${unsafeCSS(lightToolbarStyles('.edgeless-toolbar-wrapper'))}
    ${unsafeCSS(darkToolbarStyles('.edgeless-toolbar-wrapper'))}

    .edgeless-toolbar-toggle-control {
      pointer-events: auto;
      padding-bottom: 16px;
      width: fit-content;
      max-width: calc(100% - ${unsafeCSS(SAFE_AREA_WIDTH)}px * 2);
      min-width: 264px;
    }
    .edgeless-toolbar-toggle-control[data-enable='true'] {
      transition: 0.23s ease;
      padding-top: 100px;
      transform: translateY(100px);
    }
    .edgeless-toolbar-toggle-control[data-enable='true']:hover {
      padding-top: 0;
      transform: translateY(0);
    }

    .edgeless-toolbar-smooth-corner {
      display: block;
      width: fit-content;
      max-width: 100%;
    }
    .edgeless-toolbar-container {
      position: relative;
      display: flex;
      align-items: center;
      padding: 0 ${unsafeCSS(TOOLBAR_PADDING_X)}px;
      height: ${unsafeCSS(TOOLBAR_HEIGHT)}px;
    }
    :host([disabled]) .edgeless-toolbar-container {
      pointer-events: none;
    }
    .edgeless-toolbar-container[level='second'] {
      position: absolute;
      bottom: 8px;
      transform: translateY(-100%);
    }
    .edgeless-toolbar-container[hidden] {
      display: none;
    }
    .quick-tools {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${unsafeCSS(QUICK_TOOLS_GAP)}px;
    }
    .full-divider {
      width: ${unsafeCSS(DIVIDER_WIDTH)}px;
      height: 100%;
      margin: 0 ${unsafeCSS(DIVIDER_SPACE)}px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .full-divider::after {
      content: '';
      display: block;
      width: 1px;
      height: 100%;
      background-color: var(--affine-border-color);
    }
    .pen-and-eraser {
      display: flex;
      height: 100%;
      gap: 4px;
      justify-content: center;
    }
    .senior-tools {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: ${unsafeCSS(SENIOR_TOOLS_GAP)}px;
      height: 100%;
      min-width: ${unsafeCSS(SENIOR_TOOL_WIDTH)}px;
    }
    .quick-tool-item {
      width: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      height: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    .quick-tool-more {
      width: 0;
      height: ${unsafeCSS(QUICK_TOOL_SIZE)}px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.23s ease;
      overflow: hidden;
    }
    [data-dense-quick='true'] .quick-tool-more {
      width: ${unsafeCSS(QUICK_TOOL_MORE_SIZE)}px;
      margin-left: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    .quick-tool-more-button {
      padding: 0;
    }

    .senior-tool-item {
      width: ${unsafeCSS(SENIOR_TOOL_WIDTH)}px;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    .senior-nav-button-wrapper {
      flex-shrink: 0;
      width: 0px;
      height: ${unsafeCSS(SENIOR_TOOL_NAV_SIZE)}px;
      transition: width 0.23s ease;
      overflow: hidden;
    }
    .senior-nav-button {
      padding: 0;
    }
    .senior-nav-button svg {
      width: 20px;
      height: 20px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper {
      width: ${unsafeCSS(SENIOR_TOOL_NAV_SIZE)}px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper.prev {
      margin-right: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    [data-dense-senior='true'] .senior-nav-button-wrapper.next {
      margin-left: ${unsafeCSS(DIVIDER_SPACE)}px;
    }
    .transform-button svg {
      transition: 0.3s ease-in-out;
    }
    .transform-button:hover svg {
      transform: scale(1.15);
    }
    ${dikwToolbarStyles}
  `;

  private readonly _appTheme$ = computed(() => {
    return this.std.get(ThemeProvider).app$.value;
  });

  @state()
  private accessor _isDikwBoard = false;

  @state()
  private accessor _dikwMoreOpen = false;

  @state()
  private accessor _dikwContextTool = '';

  private readonly _showDikwOptions = (tool: string) => {
    this._dismissCompactPanels();
    this._dikwMoreOpen = false;
    this._dikwContextTool = ['shape', 'connector', 'affine:note'].includes(tool)
      ? tool
      : '';
  };

  private _syncDikwAIEntry() {
    this.toggleAttribute('data-dikw-ai-entry',this._isDikwBoard && !this.isPresentMode && !this.hasAttribute('disabled'));
    this.host.dispatchEvent(new CustomEvent('dikw:toolbar-state'));
  }

  private _dismissCompactPanels() {
    for (const el of this.renderRoot.querySelectorAll('[compact]')) el.dispatchEvent(new Event('dikw-compact-dismiss'));
  }

  private readonly _closeDikwPanels = (restoreFocus = false) => {
    this._dismissCompactPanels();
    const trigger = this._dikwMoreOpen ? 'more' : this._dikwContextTool;
    this.activePopper?.dispose();
    this.activePopper = null;
    this._dikwMoreOpen = false;
    this._dikwContextTool = '';
    if (restoreFocus && trigger) {
      // Lit may replace the rail buttons when the panel state changes. Focus
      // the committed button, not the outgoing render's soon-detached node.
      void this.updateComplete.then(() => requestAnimationFrame(() => {
        if (!this.isConnected || this._dikwMoreOpen || this._dikwContextTool) return;
        this.renderRoot.querySelector<HTMLButtonElement>(
          `.dikw-tool[data-tool="${trigger}"]`
        )?.focus({ preventScroll: true });
      }));
    }
  };

  private readonly _onDikwPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.activePopper) {
        this.activePopper.dispose();
        this.activePopper = null;
      } else {
        this._closeDikwPanels(true);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Native controls handle activation; never let Space pan the canvas.
      event.stopPropagation();
    }
  };

  private readonly _toggleDikwMore = () => {
    if (this.store.readonly || this.hasAttribute('disabled')) return;
    this._moreQuickToolsMenu?.close();
    this.activePopper?.dispose();
    this.activePopper = null;
    this._dikwContextTool = '';
    this._dikwMoreOpen = !this._dikwMoreOpen;
    if(!this._dikwMoreOpen)this._dismissCompactPanels();
  };

  private _moreQuickToolsMenu: MenuHandler | null = null;

  private _moreQuickToolsMenuRef: HTMLElement | null = null;

  @state()
  accessor containerWidth = 1920;

  private readonly _onContainerResize = debounce(
    ({ w }: { w: number }) => {
      if (!this.isConnected) return;

      this.slots.resize.next({ w, h: TOOLBAR_HEIGHT });
      this.containerWidth = w;

      if (this._denseSeniorTools) {
        this.scrollSeniorToolIndex = Math.min(
          this._seniorTools.length - this.scrollSeniorToolSize,
          this.scrollSeniorToolIndex
        );
      } else {
        this.scrollSeniorToolIndex = 0;
      }

      if (
        this._denseQuickTools &&
        this._moreQuickToolsMenu &&
        this._moreQuickToolsMenuRef
      ) {
        this._moreQuickToolsMenu.close();
        this._openMoreQuickToolsMenu({
          currentTarget: this._moreQuickToolsMenuRef,
        });
      }
      if (!this._denseQuickTools && this._moreQuickToolsMenu) {
        this._moreQuickToolsMenu.close();
        this._moreQuickToolsMenu = null;
      }
    },
    300,
    { leading: true }
  );

  private _resizeObserver: ResizeObserver | null = null;

  private _dikwDockRail: HTMLElement | null = null;

  private _dikwViewControls: HTMLElement | null = null;

  private readonly _slotsProvider = new ContextProvider(this, {
    context: edgelessToolbarSlotsContext,
    initialValue: { resize: new Subject() } satisfies EdgelessToolbarSlots,
  });

  private readonly _themeProvider = new ContextProvider(this, {
    context: edgelessToolbarThemeContext,
    initialValue: ColorScheme.Light,
  });

  private readonly _toolbarProvider = new ContextProvider(this, {
    context: edgelessToolbarContext,
    initialValue: this,
  });

  activePopper: MenuPopper<HTMLElement> | null = null;

  // calculate all the width manually
  private get _availableWidth() {
    return this.containerWidth - 2 * SAFE_AREA_WIDTH;
  }

  private get _cachedPresentHideToolbar() {
    return !!this.std.get(EditPropsStore).getStorage('presentHideToolbar');
  }

  private get _denseQuickTools() {
    return (
      this._availableWidth -
        this._seniorToolNavWidth -
        1 * SENIOR_TOOL_WIDTH -
        2 * TOOLBAR_PADDING_X <
      this._quickToolsWidthTotal
    );
  }

  private get _denseSeniorTools() {
    return (
      this._availableWidth -
        this._quickToolsWidthTotal -
        this._spaceWidthTotal <
      this._seniorToolsWidthTotal
    );
  }

  /**
   * When enabled, the toolbar will auto-hide when the mouse is not over it.
   */
  private get _enableAutoHide() {
    return (
      this.isPresentMode &&
      this._cachedPresentHideToolbar &&
      !this.presentSettingMenuShow &&
      !this.presentFrameMenuShow
    );
  }

  private get _hiddenQuickTools() {
    return this._quickTools
      .slice(this._visibleQuickToolSize)
      .filter(tool => !!tool.menu);
  }

  private get _quickTools() {
    const block = this.block;
    if (!block) {
      return [];
    }
    const quickTools = Array.from(
      this.std.provider.getAll(QuickToolIdentifier).entries()
    );
    const gfx = this.std.get(GfxControllerIdentifier);
    return quickTools
      .map(([id, tool]) => ({
        id,
        ...tool({ block, gfx, toolbarContainer: this.toolbarContainer }),
      }))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .filter(({ enable = true }) => enable);
  }

  private get _quickToolsWidthTotal() {
    return (
      this._quickTools.length * (QUICK_TOOL_SIZE + QUICK_TOOLS_GAP) -
      QUICK_TOOLS_GAP
    );
  }

  private get _seniorNextTooltip() {
    if (this._seniorScrollNextDisabled) return '';
    const nextTool =
      this._seniorTools[this.scrollSeniorToolIndex + this.scrollSeniorToolSize];
    return nextTool?.name ?? '';
  }

  private get _seniorPrevTooltip() {
    if (this._seniorScrollPrevDisabled) return '';
    const prevTool = this._seniorTools[this.scrollSeniorToolIndex - 1];
    return prevTool?.name ?? '';
  }

  private get _seniorScrollNextDisabled() {
    return (
      this.scrollSeniorToolIndex + this.scrollSeniorToolSize >=
      this._seniorTools.length
    );
  }

  private get _seniorScrollPrevDisabled() {
    return this.scrollSeniorToolIndex === 0;
  }

  private get _seniorToolNavWidth() {
    return this._denseSeniorTools
      ? (SENIOR_TOOL_NAV_SIZE + DIVIDER_SPACE) * 2
      : 0;
  }

  private get _seniorTools() {
    const block = this.block;
    if (!block) {
      return [];
    }
    const seniorTools = Array.from(
      this.std.provider.getAll(SeniorToolIdentifier).entries()
    );
    const gfx = this.std.get(GfxControllerIdentifier);
    return seniorTools
      .map(([id, tool]) => ({
        id,
        ...tool({ block, gfx, toolbarContainer: this.toolbarContainer }),
      }))
      .filter(({ enable = true }) => enable);
  }

  private get _seniorToolsWidthTotal() {
    return (
      this._seniorTools.length * (SENIOR_TOOL_WIDTH + SENIOR_TOOLS_GAP) -
      SENIOR_TOOLS_GAP
    );
  }

  private get _spaceWidthTotal() {
    return DIVIDER_WIDTH + DIVIDER_SPACE * 2 + TOOLBAR_PADDING_X * 2;
  }

  private get _visibleQuickToolSize() {
    if (!this._denseQuickTools) return this._quickTools.length;
    const availableWidth =
      this._availableWidth -
      this._seniorToolNavWidth -
      this._spaceWidthTotal -
      SENIOR_TOOL_WIDTH;
    return Math.max(
      1,
      Math.floor(
        (availableWidth - QUICK_TOOL_MORE_SIZE - DIVIDER_SPACE) /
          (QUICK_TOOL_SIZE + QUICK_TOOLS_GAP)
      )
    );
  }

  get edgelessTool() {
    return this.gfx.tool.currentToolName$.value;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get isPresentMode() {
    return this.edgelessTool === 'frameNavigator';
  }

  get scrollSeniorToolSize() {
    if (this._denseQuickTools) return 1;
    const seniorAvailableWidth =
      this._availableWidth - this._quickToolsWidthTotal - this._spaceWidthTotal;
    if (seniorAvailableWidth >= this._seniorToolsWidthTotal)
      return this._seniorTools.length;
    return (
      Math.floor(
        (seniorAvailableWidth - (SENIOR_TOOL_NAV_SIZE + DIVIDER_SPACE) * 2) /
          SENIOR_TOOL_WIDTH
      ) || 1
    );
  }

  get slots() {
    return this._slotsProvider.value;
  }

  constructor() {
    super();
  }

  private _onSeniorNavNext() {
    if (this._seniorScrollNextDisabled) return;
    this.scrollSeniorToolIndex = Math.min(
      this._seniorTools.length - this.scrollSeniorToolSize,
      this.scrollSeniorToolIndex + this.scrollSeniorToolSize
    );
  }

  private _onSeniorNavPrev() {
    if (this._seniorScrollPrevDisabled) return;
    this.scrollSeniorToolIndex = Math.max(
      0,
      this.scrollSeniorToolIndex - this.scrollSeniorToolSize
    );
  }

  private _openMoreQuickToolsMenu(e: { currentTarget: HTMLElement }) {
    if (!this._hiddenQuickTools.length) return;

    this._moreQuickToolsMenuRef = e.currentTarget;
    this._moreQuickToolsMenu = popMenu(
      popupTargetFromElement(e.currentTarget as HTMLElement),
      {
        middleware: [
          autoPlacement({
            allowedPlacements: ['top'],
          }),
          offset({
            mainAxis: (TOOLBAR_HEIGHT - QUICK_TOOL_MORE_SIZE) / 2 + 8,
          }),
        ],
        options: {
          onClose: () => {
            this._moreQuickToolsMenu = null;
            this._moreQuickToolsMenuRef = null;
          },
          items: this._hiddenQuickTools.map(tool => tool.menu!),
        },
      }
    );
  }

  @state() private accessor _dikwPins: string[] = [];
  @state() private accessor _dikwPinNotice = '';
  @state() private accessor _dikwDragging = '';
  private _dikwPinCleanup: (() => void) | null = null;

  private _saveDikwPins(next: string[]) {
    if (this.store.readonly || this.hasAttribute('disabled')) return;
    this.activePopper?.dispose(); this.activePopper = null;
    this._dismissCompactPanels();
    this._dikwPins = next;
    try { localStorage.setItem(DIKW_PINS_KEY, JSON.stringify({version: 1, tools: next})); this._dikwPinNotice = '工具栏已保存'; }
    catch { this._dikwPinNotice = '已调整；浏览器未允许保存，刷新后可能恢复'; }
  }

  private _dragDikwPin(event: PointerEvent, id: string) {
    if (event.button !== 0 || this.store.readonly || this.hasAttribute('disabled')) return;
    event.preventDefault(); event.stopPropagation();
    this._dikwPinCleanup?.();
    const start = {x: event.clientX, y: event.clientY};
    let moved = false;
    let cancelled = false;
    let scrollFrame = 0;
    let lastPointer: PointerEvent | null = null;
    const rail = this.renderRoot.querySelector<HTMLElement>('.dikw-toolbar');
    const overRail = (e: PointerEvent) => { const r=rail?.getBoundingClientRect(); return !!r && e.clientX>=r.left-8 && e.clientX<=r.right+8 && e.clientY>=r.top-8 && e.clientY<=r.bottom+8; };
    const before = (e: PointerEvent) => Array.from(this.renderRoot.querySelectorAll<HTMLElement>('.dikw-pinned-item')).find(el => e.clientX < el.getBoundingClientRect().left + el.offsetWidth/2)?.dataset.pinId;
    const scrollEdge = () => {
      if(!rail || !lastPointer || cancelled || !moved)return;
      const r=rail.getBoundingClientRect();
      const direction=lastPointer.clientX<r.left+36?-1:lastPointer.clientX>r.right-36?1:0;
      if(overRail(lastPointer)&&direction){
        rail.scrollLeft+=direction*8;
        for (const el of this.renderRoot.querySelectorAll<HTMLElement>('.dikw-pinned-item')) el.toggleAttribute('data-insert-before',el.dataset.pinId===before(lastPointer));
      }
      scrollFrame=requestAnimationFrame(scrollEdge);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      e.preventDefault();e.stopImmediatePropagation();
      if(cancelled)return;
      if (Math.hypot(e.clientX-start.x,e.clientY-start.y) > 5) moved = true;
      if (!moved) return;
      e.preventDefault(); this._dikwDragging = id;
      lastPointer=e;if(!scrollFrame)scrollFrame=requestAnimationFrame(scrollEdge);
      rail?.toggleAttribute('data-pin-drop', overRail(e));
      for (const el of this.renderRoot.querySelectorAll<HTMLElement>('.dikw-pinned-item')) el.toggleAttribute('data-insert-before',overRail(e) && el.dataset.pinId===before(e));
    };
    const finish = (e?: PointerEvent) => {
      if (e && e.pointerId !== event.pointerId) return;
      if(e){e.preventDefault();e.stopImmediatePropagation();}
      if (e && !cancelled && moved && overRail(e)) this._saveDikwPins(movePin(this._dikwPins,id,before(e)));
      this._dikwPinCleanup?.();
    };
    const key = (e: KeyboardEvent) => { if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelled=true;this._dikwDragging='';rail?.removeAttribute('data-pin-drop');} };
    const cancel = () => finish();
    window.addEventListener('pointermove',move,{capture:true,passive:false});
    window.addEventListener('pointerup',finish,true);
    window.addEventListener('pointercancel',cancel,true);
    window.addEventListener('keydown',key,true);
    window.addEventListener('blur',cancel);
    this._dikwPinCleanup = () => {
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);
      window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);
      rail?.removeAttribute('data-pin-drop');
      for(const el of this.renderRoot.querySelectorAll('[data-insert-before]'))el.removeAttribute('data-insert-before');
      this._dikwDragging='';this._dikwPinCleanup=null;
    };
  }

  private _renderDikwCompact(tool: CompactTool, pinned: boolean) {
    return html`<div class=${pinned ? 'dikw-pinned-item' : 'dikw-compact-row'} data-pin-id=${tool.id}>
      <button class="dikw-pin-grip" aria-label=${'拖动'+tool.label+(pinned?'排序':'到工具栏')} title="拖动到底部工具栏固定或排序" @pointerdown=${(e:PointerEvent)=>this._dragDikwPin(e,tool.id)}>⠿</button>
      ${tool.content}
      ${pinned ? nothing : html`<span class="dikw-tool-label">${tool.label}</span>`}
      <button class="dikw-pin-toggle" aria-label=${(pinned?'取消固定':'固定')+tool.label} title=${pinned?'移回更多工具':'固定到底部工具栏'} @click=${()=>this._saveDikwPins(pinned?this._dikwPins.filter(id=>id!==tool.id):movePin(this._dikwPins,tool.id))}>${pinned?'×':'＋'}</button>
    </div>`;
  }

  private _renderDikwContent() {
    const unavailable = this.store.readonly || this.hasAttribute('disabled');
    const compact = [...this._quickTools, ...this._seniorTools].flatMap(t => t.compact ?? []);
    const pinned = this._dikwPins.map(id=>compact.find(t=>t.id===id)).filter((t): t is CompactTool=>!!t);
    const pinnedContent = html`<div class="dikw-pinned" ?inert=${unavailable}>${repeat(pinned,t=>t.id,t=>this._renderDikwCompact(t,true))}</div>`;
    return html`
      ${renderDikwToolbar(this, this._dikwMoreOpen, this._toggleDikwMore, this._showDikwOptions, pinnedContent)}
      <section id="dikw-advanced-tools"
        class="dikw-advanced-panel edgeless-toolbar-container"
        data-open=${this._dikwMoreOpen && !unavailable}
        aria-label="更多工具" aria-hidden=${!this._dikwMoreOpen || unavailable}
        ?inert=${!this._dikwMoreOpen || unavailable}
        data-app-theme=${this._appTheme$.value}
        @keydown=${this._onDikwPanelKeyDown}
        @keyup=${stopPropagation}
        @pointerdown=${stopPropagation} @pointerup=${stopPropagation} @mousedown=${stopPropagation}
        @dblclick=${stopPropagation} @click=${stopPropagation} @wheel=${stopPropagation}
      >
        <div class="dikw-panel-heading"><span>更多工具</span>
          <button type="button" aria-label="关闭更多工具" @click=${() => this._closeDikwPanels(true)}>×</button>
        </div>
        <p class="dikw-pin-help">拖动 ⋮⋮ 到底栏常驻，也可点 ＋ 固定。</p>
        <div class="dikw-advanced-grid">${repeat(compact.filter(t=>!this._dikwPins.includes(t.id)),t=>t.id,t=>this._renderDikwCompact(t,false))}</div>
        <p class="dikw-pin-notice" role="status">${this._dikwDragging ? '拖到底栏松开固定；Esc 取消' : this._dikwPinNotice}</p>
      </section>
      ${this._dikwContextTool && !unavailable ? html`
        <section class="dikw-context-panel" aria-label="当前工具选项"
          @keydown=${this._onDikwPanelKeyDown} @keyup=${stopPropagation}
          @pointerdown=${stopPropagation} @pointerup=${stopPropagation} @mousedown=${stopPropagation}
          @dblclick=${stopPropagation} @click=${stopPropagation} @wheel=${stopPropagation}>
          <div class="dikw-panel-heading"><span>当前工具选项</span>
            <button type="button" aria-label="关闭工具选项" @click=${() => this._closeDikwPanels(true)}>×</button>
          </div>
          ${renderDikwToolOptions(this, this._dikwContextTool)}
        </section>` : nothing}
    `;
  }

  private _renderContent() {
    return html`
      <div class="quick-tools">
        ${this._quickTools
          .slice(0, this._visibleQuickToolSize)
          .map(
            tool => html`<div class="quick-tool-item">${tool.content}</div>`
          )}
      </div>
      <div class="quick-tool-more">
        <icon-button
          ?disabled=${!this._denseQuickTools}
          .size=${20}
          class="quick-tool-more-button"
          @click=${this._openMoreQuickToolsMenu}
          ?active=${this._quickTools
            .slice(this._visibleQuickToolSize)
            .some(tool => tool.type === this.edgelessTool)}
        >
          ${MoreHorizontalIcon({ width: '20px', height: '20px' })}
          <affine-tooltip tip-position="top" .offset=${25}>
            More Tools
          </affine-tooltip>
        </icon-button>
      </div>
      <div class="full-divider"></div>
      <div class="senior-nav-button-wrapper prev">
        <icon-button
          .size=${20}
          class="senior-nav-button"
          ?disabled=${this._seniorScrollPrevDisabled}
          @click=${this._onSeniorNavPrev}
        >
          ${ArrowLeftSmallIcon({ width: '20px', height: '20px' })}
          ${cache(
            this._seniorPrevTooltip
              ? html` <affine-tooltip tip-position="top" .offset=${4}>
                  ${this._seniorPrevTooltip}
                </affine-tooltip>`
              : nothing
          )}
        </icon-button>
      </div>
      <div class="senior-tools">
        ${this._seniorTools
          .slice(
            this.scrollSeniorToolIndex,
            this.scrollSeniorToolIndex + this.scrollSeniorToolSize
          )
          .map(
            tool => html`<div class="senior-tool-item">${tool.content}</div>`
          )}
      </div>
      <div class="senior-nav-button-wrapper next">
        <icon-button
          .size=${20}
          class="senior-nav-button"
          ?disabled=${this._seniorScrollNextDisabled}
          @click=${this._onSeniorNavNext}
        >
          ${ArrowRightSmallIcon({ width: '20px', height: '20px' })}
          ${cache(
            this._seniorNextTooltip
              ? html` <affine-tooltip tip-position="top" .offset=${4}>
                  ${this._seniorNextTooltip}
                </affine-tooltip>`
              : nothing
          )}
        </icon-button>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._toolbarProvider.setValue(this);
    const graph = this.store.workspace.doc.getMap(DIKW_BOARD_GRAPH_MAP);
    const updateBoardVariant = () => {
      this._isDikwBoard = isDikwBoard(
        graph.get('board:' + this.store.id),
        this.store.id
      );
      this.toggleAttribute('data-dikw-board', this._isDikwBoard);
      this._syncDikwAIEntry();
      // Outer widgets-container explicitly enables pointer events; override on host
      // so a fullscreen chrome box never intercepts canvas gestures.
      if (this._isDikwBoard) this.style.pointerEvents = 'none';
      else this.style.removeProperty('pointer-events');
      if (!this._isDikwBoard) this._closeDikwPanels();
    };
    updateBoardVariant();
    const refreshAI = () => this.requestUpdate();
    this.host.addEventListener('dikw:ai-availability',refreshAI);
    this.disposables.add(()=>this.host.removeEventListener('dikw:ai-availability',refreshAI));
    graph.observe(updateBoardVariant);
    this.disposables.add(() => graph.unobserve(updateBoardVariant));
    this.disposables.add(
      this.gfx.tool.currentToolName$.subscribe(tool => {
        if (this._isDikwBoard && !this.store.readonly && !this.hasAttribute('disabled')) {
          // Keyboard-selected basic tools get the same native options as rail clicks.
          if (['shape', 'connector', 'affine:note'].includes(tool)) {
            this.activePopper?.dispose();
            this.activePopper = null;
            this._showDikwOptions(tool);
          } else {
            this._dikwContextTool = '';
          }
          if (tool === 'frameNavigator') this._closeDikwPanels();
        }
        this._syncDikwAIEntry();
        this.requestUpdate();
      })
    );
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === this) {
          this._onContainerResize({ w: entry.contentRect.width });
        }
      }
      this._layoutDikwDock();
    });
    this._resizeObserver.observe(this);
    this.disposables.add(
      this.std
        .get(ThemeProvider)
        .theme$.subscribe(mode => this._themeProvider.setValue(mode))
    );
    if (!this.block) {
      return;
    }
    this._disposables.add(
      this.block.bindHotKey(
        {
          Escape: () => {
            if (this.gfx.selection.editing) return;
            if (this.edgelessTool === 'frameNavigator') return;
            if (this._isDikwBoard && !this.activePopper) {
              this._closeDikwPanels(true);
            }
            if (this.edgelessTool === 'default') {
              if (this.activePopper) {
                this.activePopper.dispose();
                this.activePopper = null;
              }
              return;
            }
            this.gfx.tool.setTool(DefaultTool);
          },
        },
        { global: true }
      )
    );
  }

  override disconnectedCallback() {
    this._dikwPinCleanup?.();
    if (this._isDikwBoard) this._closeDikwPanels();
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    this._dikwDockRail = null;
    this._dikwViewControls = null;
  }

  override firstUpdated() {
    const { _disposables, block, gfx } = this;
    if (!block) return;

    try { this._dikwPins = readPins(localStorage); } catch { this._dikwPins = []; }
    const syncPins = (event: StorageEvent) => { if(event.key===DIKW_PINS_KEY){ try{this._dikwPins=readPins(localStorage);}catch{this._dikwPins=[];} } };
    window.addEventListener('storage',syncPins);
    this.disposables.add(()=>window.removeEventListener('storage',syncPins));
    this.host.dispatchEvent(new CustomEvent('dikw:toolbar-state'));
    // Native draggable builders need the container after its first render.
    if (this._isDikwBoard) this.requestUpdate();
    const slots = this.std.get(EdgelessLegacySlotIdentifier);
    const editPropsStore = this.std.get(EditPropsStore);

    _disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
    _disposables.add(
      slots.readonlyUpdated.subscribe(() => {
        if (this._isDikwBoard && this.store.readonly) {
          this._closeDikwPanels();
          this._moreQuickToolsMenu?.close();
        }
        this.requestUpdate();
      })
    );
    _disposables.add(
      slots.toolbarLocked.subscribe(disabled => {
        this.toggleAttribute('disabled', disabled);
        this._syncDikwAIEntry();
        if (this._isDikwBoard) {
          if (disabled) this._closeDikwPanels();
          this.requestUpdate();
        }
      })
    );
    // This state from `editPropsStore` is not reactive,
    // if the value is updated outside of this component, it will not be reflected.
    _disposables.add(
      editPropsStore.slots.storageUpdated.subscribe(({ key }) => {
        if (key === 'presentHideToolbar') {
          this.requestUpdate();
        }
      })
    );
  }

  private _layoutDikwDock() {
    if (!this._isDikwBoard || this.isPresentMode) return;
    const rail = this.renderRoot.querySelector<HTMLElement>('.dikw-toolbar');
    if (!rail) return;
    // Measure sibling chrome, not the viewport or a fixed desktop reservation.
    // This also keeps coarse-pointer targets, pinned tools and safe areas in sync.
    const controls =
      this.parentElement?.querySelector<HTMLElement>(
        'affine-edgeless-zoom-toolbar-widget'
      ) ?? null;
    if (rail !== this._dikwDockRail) {
      if (this._dikwDockRail) this._resizeObserver?.unobserve(this._dikwDockRail);
      this._dikwDockRail = rail;
      this._resizeObserver?.observe(rail);
    }
    if (controls !== this._dikwViewControls) {
      if (this._dikwViewControls) {
        this._resizeObserver?.unobserve(this._dikwViewControls);
      }
      this._dikwViewControls = controls;
      if (controls) this._resizeObserver?.observe(controls);
    }
    const hostRect = this.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const viewRect = controls?.getBoundingClientRect();
    let bottom = 'max(12px, env(safe-area-inset-bottom))';
    if (
      viewRect &&
      viewRect.width > 0 &&
      viewRect.height > 0 &&
      railRect.right + 8 > viewRect.left
    ) {
      bottom =
        String(
          Math.max(12, hostRect.bottom - viewRect.bottom) + viewRect.height + 8
        ) + 'px';
    }
    this.style.setProperty('--dikw-dock-bottom', bottom);
  }

  override updated() { this._layoutDikwDock(); }

  override render() {
    const type = this.edgelessTool;
    if (!this._isDikwBoard && this.store.readonly && type !== 'frameNavigator') {
      return nothing;
    }

    if (this._isDikwBoard && !this.isPresentMode) {
      return this._renderDikwContent();
    }

    return html`
      <div
        class="edgeless-toolbar-wrapper"
        data-app-theme=${this._appTheme$.value}
      >
        <div
          class="edgeless-toolbar-toggle-control"
          data-enable=${this._enableAutoHide}
        >
          <smooth-corner
            class="edgeless-toolbar-smooth-corner"
            .borderRadius=${16}
            .smooth=${0.7}
            .borderWidth=${1}
            .bgColor=${'var(--affine-background-overlay-panel-color)'}
            .borderColor=${'var(--affine-border-color)'}
            style="filter: drop-shadow(${cssVar('toolbarShadow')})"
          >
            <div
              class="edgeless-toolbar-container"
              data-dense-quick=${
                this._denseQuickTools && this._hiddenQuickTools.length > 0
              }
              data-dense-senior=${this._denseSeniorTools}
              @dblclick=${stopPropagation}
              @mousedown=${stopPropagation}
              @pointerdown=${stopPropagation}
            >
              ${
                this.isPresentMode
                  ? html`<presentation-toolbar
                      .edgeless=${this.block}
                      .settingMenuShow=${this.presentSettingMenuShow}
                      .frameMenuShow=${this.presentFrameMenuShow}
                      .setSettingMenuShow=${(show: boolean) =>
                        (this.presentSettingMenuShow = show)}
                      .setFrameMenuShow=${(show: boolean) =>
                        (this.presentFrameMenuShow = show)}
                      .containerWidth=${this.containerWidth}
                    ></presentation-toolbar>`
                  : nothing
              }
              ${this.isPresentMode || this.store.readonly ? nothing : this._renderContent()}
            </div>
          </smooth-corner>
        </div>
      </div>
    `;
  }

  @state()
  accessor presentFrameMenuShow = false;

  @state()
  accessor presentSettingMenuShow = false;

  @state()
  accessor scrollSeniorToolIndex = 0;

  @query('.edgeless-toolbar-container')
  accessor toolbarContainer!: HTMLElement;
}

export const edgelessToolbarWidget = WidgetViewExtension(
  'affine:page',
  EDGELESS_TOOLBAR_WIDGET,
  literal`${unsafeStatic(EDGELESS_TOOLBAR_WIDGET)}`
);
