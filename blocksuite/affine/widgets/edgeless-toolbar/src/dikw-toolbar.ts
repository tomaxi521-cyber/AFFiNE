import { type ShapeName, ShapeType } from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import {
  AiIcon,
  ConnectorLIcon,
  EdgelessIcon,
  MoreHorizontalIcon,
  PageIcon,
  ShapeIcon,
  TextIcon,
} from '@blocksuite/icons/lit';
import { ToolIdentifier, type ToolType } from '@blocksuite/std/gfx';
import { html, nothing, type TemplateResult } from 'lit';

import type { EdgelessToolbarWidget } from './edgeless-toolbar.js';

export const DIKW_BOARD_GRAPH_MAP = 'dikw:board-graph:v1';

/** Match the workspace relation contract, not arbitrary edgeless documents. */
export function isDikwBoard(value: unknown, docId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    record.docId === docId &&
    typeof record.operationId === 'string' &&
    record.operationId.length > 0 &&
    (record.parentId === null ||
      (typeof record.parentId === 'string' && record.parentId.length > 0)) &&
    record.parentId !== docId
  );
}

const tools = [
  { name: 'affine:note', label: '笔记', shortcut: 'N', icon: PageIcon },
  { name: 'text', label: '文字', shortcut: 'T', icon: TextIcon },
  { name: 'shape', label: '形状', shortcut: 'S', icon: ShapeIcon },
  { name: 'connector', label: '连接线', shortcut: 'C', icon: ConnectorLIcon },
] as const;

function toolOptions(host: EdgelessToolbarWidget, name: string) {
  switch (name) {
    case 'pan':
      return { panning: false };
    case 'affine:note':
      return { childFlavour: 'affine:paragraph', childType: 'text', tip: 'Text' };
    case 'shape':
      return { shapeName: ShapeType.Rect };
    case 'connector':
      return { mode: host.std.get(EditPropsStore).lastProps$.value.connector.mode };
    default:
      return {};
  }
}

/** Reuse the native option menus instead of offering a second creation dock. */
export function renderDikwToolOptions(host: EdgelessToolbarWidget, tool: string) {
  const setTool = (options: Record<string, unknown>) => {
    if (host.store.readonly || host.hasAttribute('disabled')) return;
    const controller = host.std.getOptional(ToolIdentifier(tool));
    if (!controller) return;
    host.gfx.tool.setTool(controller.constructor as ToolType, options);
  };
  switch (tool) {
    case 'shape':
      return html`<edgeless-shape-menu
        .edgeless=${host.block}
        .onChange=${(shapeName: ShapeName) => setTool({ shapeName })}
      ></edgeless-shape-menu>`;
    case 'connector':
      return html`<edgeless-connector-menu
        .edgeless=${host.block}
        .onChange=${(props: Record<string, unknown>) => {
          if (host.store.readonly || host.hasAttribute('disabled')) return;
          const editProps = host.std.get(EditPropsStore);
          editProps.recordLastProps('connector', props);
          setTool({ mode: editProps.lastProps$.value.connector.mode });
        }}
      ></edgeless-connector-menu>`;
    case 'affine:note':
      return html`<edgeless-note-menu
        .edgeless=${host.block}
        .onChange=${(props: Record<string, unknown>) => {
          const current = host.gfx.tool.currentToolOption$.value?.options;
          setTool({ ...toolOptions(host, tool), ...current, ...props });
        }}
      ></edgeless-note-menu>`;
    default:
      return nothing;
  }
}

function navigateToolbar(event: KeyboardEvent) {
  // Native buttons own Enter/Space. Do not let those keys pan the canvas.
  if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation();
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const toolbar = event.currentTarget as HTMLElement;
  const buttons: HTMLButtonElement[] = [];
  const collect=(root: Element | ShadowRoot)=>{for(const child of root.children){
    if(child instanceof HTMLButtonElement && !child.disabled)buttons.push(child);
    if(child.shadowRoot)collect(child.shadowRoot);
    collect(child);
  }};
  collect(toolbar);
  const index = buttons.indexOf(event.composedPath()[0] as HTMLButtonElement);
  if (index < 0 || !buttons.length) return;
  event.preventDefault();
  event.stopPropagation();
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

/** Plain buttons activate existing controllers; options use the native menus. */
export function renderDikwToolbar(
  host: EdgelessToolbarWidget,
  moreOpen: boolean,
  toggleMore: () => void,
  showOptions: (tool: string) => void,
  pinnedContent?: TemplateResult
) {
  const locked = host.hasAttribute('disabled');
  const readonly = host.store.readonly;
  const closePopper = () => {
    host.activePopper?.dispose();
    host.activePopper = null;
  };
  return html`
    <div class="dikw-toolbar" role="toolbar" aria-label="白板工具" aria-orientation="horizontal"
      @keydown=${navigateToolbar}
      @keyup=${(event: KeyboardEvent) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
      @pointerdown=${stopPropagation} @pointerup=${stopPropagation} @mousedown=${stopPropagation} @mouseup=${stopPropagation}
      @dblclick=${stopPropagation} @click=${stopPropagation} @wheel=${stopPropagation}>
      <button type="button" class="dikw-tool" data-tool="ai" aria-label="AI 助手" title="AI 助手"
        ?disabled=${locked || !host.host.hasAttribute('data-dikw-ai-enabled')}
        @click=${()=>host.host.dispatchEvent(new CustomEvent('dikw:ai-open'))}>
        <span aria-hidden="true">${AiIcon()}</span>
      </button>
      <span class="dikw-toolbar-divider" role="separator"></span>
      ${tools.map(tool => {
        const controller = host.std.getOptional(ToolIdentifier(tool.name));
        const requiresEdit = true;
        const disabled = locked || !controller || (readonly && requiresEdit);
        return html`
          <button type="button" class="dikw-tool" data-tool=${tool.name}
            aria-label=${tool.label} aria-keyshortcuts=${tool.shortcut}
            aria-pressed=${host.edgelessTool === tool.name ? 'true' : 'false'}
            title=${tool.label + ' (' + tool.shortcut + ')'} ?disabled=${disabled}
            @click=${() => {
              if (disabled || host.hasAttribute('disabled') || (host.store.readonly && requiresEdit)) return;
              closePopper();
              // Gfx packages depend on this widget: resolve registered controllers
              // rather than importing their constructors and creating a cycle.
              if (controller) {
                host.gfx.tool.setTool(
                  controller.constructor as ToolType,
                  toolOptions(host, tool.name)
                );
                showOptions(tool.name);
              }
            }}>
            <span aria-hidden="true">${tool.icon()}</span>
            <affine-tooltip tip-position="top">${tool.label} (${tool.shortcut})</affine-tooltip>
          </button>
        `;
      })}
      <span class="dikw-toolbar-divider" role="separator"></span>
      <button type="button" class="dikw-tool" data-tool="whiteboard" aria-label="白板" title="白板"
        aria-pressed=${host.edgelessTool === 'dikw:board-placement' ? 'true' : 'false'}
        ?disabled=${locked || readonly}
        @click=${() => {
          if (host.store.readonly || host.hasAttribute('disabled')) return;
          closePopper();
          showOptions('dikw:board-placement');
          host.dispatchEvent(new CustomEvent('dikw:board-tool', {
            bubbles: true, composed: true, detail: { action: 'open' },
          }));
        }}>
        <span aria-hidden="true">${EdgelessIcon()}</span>
        <affine-tooltip tip-position="top">白板 · 点击画布创建子白板</affine-tooltip>
      </button>
      ${pinnedContent}
      <button type="button" class="dikw-tool" data-tool="more" aria-label="更多工具"
        title="更多工具" aria-expanded=${moreOpen ? 'true' : 'false'}
        aria-controls="dikw-advanced-tools" ?disabled=${locked || readonly}
        @click=${() => { closePopper(); toggleMore(); }}>
        <span aria-hidden="true">${MoreHorizontalIcon()}</span>
        <affine-tooltip tip-position="top">${moreOpen ? '收起更多工具' : '更多工具'}</affine-tooltip>
      </button>
      ${readonly ? html`<span class="dikw-readonly">只读</span>` : nothing}
    </div>
  `;
}
