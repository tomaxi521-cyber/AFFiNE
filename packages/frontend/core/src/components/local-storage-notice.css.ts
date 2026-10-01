import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const notice = style({
  flexShrink: 0,
  minWidth: 0,
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/secondary'),
  borderBottom: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  fontSize: 12,
  lineHeight: '20px',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: 12,
  rowGap: 2,
  // 31px + the notice's bottom border = 32px at a single desktop line.
  minHeight: 31,
  boxSizing: 'border-box',
  padding: '1px 12px',
});

export const status = style({
  fontWeight: 500,
});

// Never truncate or hide the risk sentence, including at narrow widths.
export const risk = style({
  color: cssVarV2('text/secondary'),
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 4,
  marginInlineStart: 'auto',
});

export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 28,
  boxSizing: 'border-box',
  padding: '2px 8px',
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  lineHeight: '20px',
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: cssVarV2('button/secondary') },
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
      outlineOffset: 1,
    },
  },
  '@media': {
    '(any-pointer: coarse)': {
      minWidth: 44,
      minHeight: 44,
    },
  },
});

export const syncButton = style([
  button,
  {
    fontWeight: 500,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
]);

export const details = style({
  padding: '8px 12px 12px',
  borderTop: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  overflowWrap: 'anywhere',
});

export const warning = style({
  margin: '0 0 8px',
  maxWidth: '90ch',
});
