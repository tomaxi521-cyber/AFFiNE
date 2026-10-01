import { css } from 'lit';

/** Shared launcher chrome only. Never style native content or color previews. */
export const dikwCompactToolStyles = css`
  :host([compact]) { display: block; width: 44px; height: 44px; }
  .dikw-compact-button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--affine-text-primary-color); cursor: pointer; }
  .dikw-compact-button:hover, .dikw-compact-button[aria-pressed='true'] { background: var(--affine-hover-color); }
  .dikw-compact-button:focus-visible { outline: 2px solid var(--affine-primary-color); outline-offset: -2px; }
  .dikw-compact-button:disabled { opacity: .35; cursor: not-allowed; }
  .dikw-compact-button svg { display: block; width: 24px; height: 24px; pointer-events: none; }
`;
