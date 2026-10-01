import { css } from 'lit';

/** Shared launcher chrome only. Never style native content or color previews. */
export const dikwCompactToolStyles = css`
  :host([compact]) { display: block; width: var(--dikw-tool-size, 36px); height: var(--dikw-tool-size, 36px); }
  .dikw-compact-button { display: grid; place-items: center; width: var(--dikw-tool-size, 36px); height: var(--dikw-tool-size, 36px); padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--affine-text-primary-color); cursor: pointer; }
  .dikw-compact-button:hover, .dikw-compact-button[aria-pressed='true'] { background: var(--affine-hover-color); }
  .dikw-compact-button:focus-visible { outline: 2px solid var(--affine-primary-color); outline-offset: -2px; }
  .dikw-compact-button:disabled { opacity: .35; cursor: not-allowed; }
  .dikw-compact-button svg { display: block; width: 20px; height: 20px; pointer-events: none; }
  @media (pointer: coarse) {
    :host([compact]) { --dikw-tool-size: 44px; }
  }
`;
