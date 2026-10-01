import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';

const coarsePointer = '(any-pointer: coarse)';
export const folder = style({ marginBottom: 8 });
export const navigation = style({
  minWidth: 0,
  fontSize: 13,
  lineHeight: '20px',
});
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 6px 4px',
  color: cssVarV2('text/secondary'),
  fontSize: 13,
});
export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  minWidth: 0,
  minHeight: 32,
  borderRadius: 5,
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
    '&[data-active=true]': { background: 'var(--affine-hover-color)' },
  },
  '@media': { [coarsePointer]: { minHeight: 44 } },
});
export const button = style({
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 32,
  padding: '4px 6px',
  borderRadius: 4,
  selectors: {
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
      outlineOffset: -2,
    },
    '&:disabled': { cursor: 'default', opacity: 0.45 },
  },
  '@media': { [coarsePointer]: { minHeight: 44, minWidth: 44 } },
});
export const iconButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: 28,
  padding: 4,
  color: cssVarV2('text/secondary'),
  selectors: {
    '&:hover:not(:disabled)': { background: cssVarV2('button/secondary') },
  },
});
export const label = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  paddingInline: 2,
});
export const icon = style({ flexShrink: 0, color: cssVarV2('text/secondary') });
export const title = style({
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});
// Opacity keeps actions keyboard-accessible; focus-within reveals the group.
export const rowAction = style({
  opacity: 0,
  selectors: {
    [`${row}:hover &`]: { opacity: 1 },
    [`${row}:focus-within &`]: { opacity: 1 },
  },
  '@media': {
    '(hover: none), (any-pointer: coarse)': { opacity: 1 },
  },
});
export const actions = style([
  rowAction,
  {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
]);
export const actionSlot = style({ display: 'flex' });
export const indent = style({
  width: 28,
  flexShrink: 0,
  '@media': { [coarsePointer]: { width: 44 } },
});
export const tree = style({ minWidth: 0, paddingLeft: 0 });
export const small = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  padding: '4px 8px',
  margin: 0,
  overflowWrap: 'anywhere',
});
export const form = style({
  display: 'flex',
  gap: 4,
  padding: '4px 6px',
  flexWrap: 'wrap',
});
export const input = style({
  width: '100%',
  minWidth: 0,
  padding: '6px 8px',
  border: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  borderRadius: 5,
  background: cssVarV2('layer/background/primary'),
  color: 'inherit',
  font: 'inherit',
});
