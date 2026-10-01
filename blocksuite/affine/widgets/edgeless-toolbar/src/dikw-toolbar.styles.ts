import { css } from 'lit';

/** Chrome only: never style the world, content elements, or zoom widget. */
export const dikwToolbarStyles = css`
  :host([data-dikw-board]) {
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
    bottom: calc(var(--dikw-dock-bottom, 14px) + 72px);
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
    max-height: calc(100% - var(--dikw-dock-bottom, 14px) - 96px);
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
  .dikw-compact-row { display: flex; align-items: center; gap: 4px; min-height: 44px; border-radius: 8px; }
  .dikw-tool-label { flex: 1; font-size: 13px; }
  .dikw-pin-grip, .dikw-pin-toggle { border: 0; background: transparent; color: var(--affine-text-secondary-color); border-radius: 5px; padding: 0; cursor: pointer; }
  .dikw-pin-grip { width: 20px; height: 40px; cursor: grab; touch-action: none; }
  .dikw-pin-toggle { width: 28px; height: 32px; font-size: 17px; }
  .dikw-pin-grip:hover, .dikw-pin-toggle:hover { background: var(--affine-hover-color); }
  .dikw-pin-grip:focus-visible, .dikw-pin-toggle:focus-visible { outline: 2px solid var(--affine-primary-color); }
  .dikw-pin-help, .dikw-pin-notice { font-size: 11px; line-height: 1.5; color: var(--affine-text-secondary-color); margin: 4px 0 8px; }
  .dikw-pin-notice:empty { display: none; }
  .dikw-pinned { display: flex; flex-direction: row; gap: 4px; flex-shrink: 0; }
  .dikw-pinned-item { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
  .dikw-pinned-item .dikw-pin-grip { position: absolute; left: 0; top: -6px; width: 44px; height: 10px; z-index: 2; opacity: .5; }
  .dikw-pinned-item .dikw-pin-toggle { position: absolute; right: -6px; top: -3px; width: 16px; height: 16px; z-index: 2; opacity: 0; background: var(--affine-background-overlay-panel-color); }
  .dikw-pinned-item:hover .dikw-pin-toggle, .dikw-pinned-item:focus-within .dikw-pin-toggle { opacity: 1; }
  .dikw-toolbar[data-pin-drop] { outline: 2px solid var(--affine-primary-color); }
  .dikw-pinned-item[data-insert-before]::before { content: ''; position: absolute; left: -3px; top: 0; bottom: 0; width: 2px; background: var(--affine-primary-color); }
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
    bottom: var(--dikw-dock-bottom, 14px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100% - 24px);
    height: 60px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: contain;
    /* Keep the 44px hit area intact even with a classic scrollbar. */
    scrollbar-width: none;
    padding: 7px;
    border: 1px solid var(--affine-border-color);
    border-radius: 14px;
    background: var(--affine-background-overlay-panel-color);
    color: var(--affine-text-primary-color);
    box-shadow: 0 3px 14px rgb(0 0 0 / 8%);
    pointer-events: auto;
  }
  .dikw-toolbar::-webkit-scrollbar {
    display: none;
  }
  .dikw-tool {
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  .dikw-tool > span, .dikw-tool svg {
    display: block;
    width: 24px;
    height: 24px;
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
    height: 28px;
    background: var(--affine-border-color);
    margin: 0 3px;
  }
  .dikw-readonly {
    font-size: 10px;
    line-height: 20px;
    color: var(--affine-text-secondary-color);
  }

`;
