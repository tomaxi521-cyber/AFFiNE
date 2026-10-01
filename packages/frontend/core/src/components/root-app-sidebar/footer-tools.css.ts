import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';
export const tools = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  width: '100%',
  gap: 4,
  paddingTop: 8,
  borderTop: '1px solid ' + cssVarV2('layer/insideBorder/border'),
});
export const iconButton = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: 32,
  height: 32,
  padding: 6,
  '@media': { '(any-pointer: coarse)': { width: 44, height: 44, padding: 12 } },
  flexShrink: 0,
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  cursor: 'pointer',
  selectors: {
    '&:hover, &[data-active="true"], &[data-state="open"]': {
      background: cssVarV2('button/secondary'),
      color: cssVarV2('text/primary'),
    },
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
      outlineOffset: -2,
    },
  },
});
