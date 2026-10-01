import { style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  maxWidth: '100%',
  overflow: 'hidden',
  flexShrink: 0,
  minWidth: 0,
  background: 'var(--affine-background-secondary-color)',
  borderBottom: '1px solid var(--affine-border-color)',
});
export const strip = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  padding: '6px 12px 0',
  minHeight: 40,
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflowX: 'auto',
  scrollbarWidth: 'thin',
});
export const tab = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  maxWidth: 260,
  borderRadius: '7px 7px 0 0',
  border: '1px solid transparent',
  borderBottom: 0,
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&[data-active="true"]': {
      background: 'var(--affine-background-primary-color)',
      color: 'var(--affine-text-primary-color)',
      borderColor: 'var(--affine-border-color)',
      boxShadow: 'inset 0 2px 0 var(--affine-primary-color)',
    },
  },
});
export const select = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 70,
  maxWidth: 220,
  minHeight: 34,
  padding: '5px 8px 5px 12px',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  borderRadius: 5,
  ':hover': { background: 'var(--affine-hover-color)' },
  ':focus-visible': {
    outline: '2px solid var(--affine-primary-color)',
    outlineOffset: -2,
  },
});
export const label = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const close = style({
  flexShrink: 0,
  width: 28,
  height: 28,
  marginRight: 3,
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
  fontSize: 18,
  cursor: 'pointer',
  ':hover': { background: 'var(--affine-hover-color)' },
  ':focus-visible': {
    outline: '2px solid var(--affine-primary-color)',
    outlineOffset: -2,
  },
  ':disabled': { opacity: 0.5, cursor: 'wait' },
});
export const error = style({
  padding: '5px 12px',
  fontSize: 12,
  color: 'var(--affine-error-color)',
});
