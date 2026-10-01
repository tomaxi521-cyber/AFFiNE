import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 10px 8px',
  color: cssVarV2('text/secondary'),
  fontSize: 13,
});
export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 36,
  borderRadius: 7,
  selectors: {
    '&:hover': { background: cssVarV2('button/secondary') },
    '&[data-active=true]': { background: cssVarV2('button/secondary') },
  },
});
export const button = style({
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 5,
  selectors: {
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
    },
  },
});
export const label = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});
export const small = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  padding: '6px 12px',
});
export const form = style({
  display: 'flex',
  gap: 4,
  padding: 6,
  flexWrap: 'wrap',
});
export const input = style({
  width: '100%',
  minWidth: 0,
  padding: '7px 8px',
  border: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  borderRadius: 5,
  background: cssVarV2('layer/background/primary'),
  color: 'inherit',
});
