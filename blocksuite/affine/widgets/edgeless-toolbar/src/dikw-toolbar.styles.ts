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
    left: 84px;
    top: 50%;
    transform: translateY(-50%);
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
    max-height: calc(100% - 120px);
    overflow: auto;
    overscroll-behavior: contain;
  }
  .dikw-advanced-panel.edgeless-toolbar-container {
    width: 236px;
    max-width: calc(100% - 96px);
  }
  /* Retain native controllers and keyboard bindings while the panel is closed. */
  .dikw-advanced-panel[data-open='false'] {
    visibility: hidden;
    pointer-events: none;
  }
  .dikw-advanced-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
    align-items: center;
  }
  .dikw-advanced-quick,
  .dikw-advanced-senior {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 64px;
    border-radius: 8px;
    background: var(--affine-hover-color);
  }
  .dikw-advanced-senior > * { width: 96px; height: 64px; }
  .dikw-context-panel { width: min(680px, calc(100% - 96px)); }
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
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    width: 60px;
    max-height: calc(100% - 120px);
    overflow-y: auto;
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
    width: 28px;
    background: var(--affine-border-color);
    margin: 3px 0;
  }
  .dikw-readonly {
    font-size: 10px;
    line-height: 20px;
    color: var(--affine-text-secondary-color);
  }
  @media (max-width: 600px) {
    .dikw-toolbar { left: 8px; }
  }
`;
