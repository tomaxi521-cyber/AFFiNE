import { css } from 'lit';

/** Chrome only: never style the world, content elements, or zoom widget. */
export const dikwToolbarStyles = css`
  :host([data-dikw-board]) {
    --dikw-tool-size: 36px;
    --dikw-dock-height: 48px;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: none;
  }
  :host([data-dikw-board]) .edgeless-toolbar-wrapper {
    position: absolute;
    bottom: 0;
  }
  :host([data-dikw-board]) .edgeless-toolbar-wrapper[hidden] {
    display: none;
  }
  .dikw-advanced-panel.edgeless-toolbar-container,
  .dikw-context-panel {
    position: absolute;
    left: 50%;
    bottom: calc(var(--dikw-dock-bottom, 12px) + var(--dikw-dock-height) + 8px);
    transform: translateX(-50%);
    display: block;
    box-sizing: border-box;
    height: auto;
    padding: 12px;
    border: 1px solid var(--affine-border-color);
    border-radius: 12px;
    background: var(--affine-background-overlay-panel-color);
    color: var(--affine-text-primary-color);
    box-shadow: 0 3px 14px rgb(0 0 0 / 8%);
    pointer-events: auto;
    max-height: calc(100% - var(--dikw-dock-bottom, 12px) - var(--dikw-dock-height) - 20px);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .dikw-advanced-panel.edgeless-toolbar-container {
    width: 276px;
    max-width: calc(100% - 24px);
  }
  /* Retain native controllers and keyboard bindings while the panel is closed. */
  .dikw-advanced-panel[data-open='false'] {
    visibility: hidden;
    pointer-events: none;
  }
  .dikw-advanced-grid { display: flex; flex-direction: column; gap: 4px; }
  .dikw-compact-row { display: flex; align-items: center; gap: 4px; min-height: var(--dikw-tool-size); border-radius: 8px; }
  .dikw-tool-label { flex: 1; font-size: 13px; }
  .dikw-fixed-tools { display: flex; flex-direction: row; gap: 2px; flex-shrink: 0; }
  .dikw-fixed-item { width: var(--dikw-tool-size); height: var(--dikw-tool-size); flex-shrink: 0; }
  .dikw-context-panel { width: min(680px, calc(100% - 24px)); }
  .dikw-context-panel > edgeless-shape-menu,
  .dikw-context-panel > edgeless-connector-menu,
  .dikw-context-panel > edgeless-note-menu {
    position: relative;
    z-index: auto;
    display: flex;
    width: 100%;
    min-width: 0;
  }
  .dikw-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--affine-text-secondary-color);
  }
  .dikw-panel-heading button {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 20px;
  }
  .dikw-panel-heading button:hover { background: var(--affine-hover-color); }
  .dikw-panel-heading button:focus-visible {
    outline: 2px solid var(--affine-primary-color);
  }
  .dikw-toolbar {
    position: absolute;
    left: 50%;
    bottom: var(--dikw-dock-bottom, 12px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100% - 24px);
    height: var(--dikw-dock-height);
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: contain;
    /* Keep button hit areas intact even with a classic scrollbar. */
    scrollbar-width: none;
    padding: 5px;
    border: 1px solid var(--affine-border-color);
    border-radius: 12px;
    background: var(--affine-background-overlay-panel-color);
    color: var(--affine-text-primary-color);
    box-shadow: 0 3px 14px rgb(0 0 0 / 8%);
    pointer-events: auto;
  }
  .dikw-toolbar::-webkit-scrollbar {
    display: none;
  }
  .dikw-tool {
    flex: 0 0 var(--dikw-tool-size);
    width: var(--dikw-tool-size);
    height: var(--dikw-tool-size);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  .dikw-tool > span, .dikw-tool svg {
    display: block;
    width: 20px;
    height: 20px;
    pointer-events: none;
  }
  .dikw-tool:hover:not(:disabled) {
    background: var(--affine-hover-color);
  }
  .dikw-tool[aria-pressed='true'], .dikw-tool[aria-expanded='true'] {
    background: var(--affine-hover-color);
    box-shadow: inset 0 0 0 1px var(--affine-border-color);
  }
  .dikw-tool:focus-visible {
    outline: 2px solid var(--affine-primary-color);
    outline-offset: -2px;
  }
  .dikw-tool:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .dikw-toolbar-divider {
    flex: 0 0 1px;
    height: 24px;
    background: var(--affine-border-color);
    margin: 0 2px;
  }
  .dikw-readonly {
    font-size: 10px;
    line-height: 20px;
    color: var(--affine-text-secondary-color);
  }

  @media (pointer: coarse) {
    :host([data-dikw-board]) {
      --dikw-tool-size: 44px;
      --dikw-dock-height: 56px;
    }
    .dikw-panel-heading button {
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }
  }
`;
