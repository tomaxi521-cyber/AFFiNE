import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';
export const workspaceAndUserWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  padding: '0 4px',
});
export const workspaceWrapper = style({ minWidth: 0, flex: 1 });
export const brandButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  minHeight: 32,
  padding: '4px 2px',
  border: 0,
  borderRadius: 5,
  background: 'transparent',
  color: cssVarV2('text/primary'),
  font: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  selectors: {
    '&:hover': { background: cssVarV2('button/secondary') },
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
    },
  },
  '@media': { '(any-pointer: coarse)': { minHeight: 44 } },
});
export const brandMark = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  background: cssVarV2('text/primary'),
  color: cssVarV2('layer/background/primary'),
  fontSize: 13,
  fontWeight: 600,
});
export const quickSearchRow = style({
  display: 'flex',
  alignItems: 'center',
  padding: '2px 0',
  marginLeft: -4,
  marginRight: -4,
});
export const quickSearch = style({ width: 0, flex: 1 });
export const bottomContainer = style({ gap: 2 });
