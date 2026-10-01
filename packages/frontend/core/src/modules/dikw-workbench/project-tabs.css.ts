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
  gap: 2,
  padding: '3px 8px',
  minHeight: 34,
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
  borderRadius: 5,
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&[data-active="true"]': {
      background: 'var(--affine-hover-color)',
      color: 'var(--affine-text-primary-color)',
    },
  },
});
export const select = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 70,
  maxWidth: 220,
  minHeight: 28,
  '@media': { '(any-pointer: coarse)': { minHeight: 44 } },
  padding: '3px 8px',
  boxSizing: 'border-box',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 13,
  lineHeight: '20px',
  cursor: 'pointer',
  borderRadius: 5,
  ':hover': { background: 'var(--affine-hover-color)' },
  ':focus-visible': {
    outline: '2px solid var(--affine-text-secondary-color)',
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
  width: 24,
  height: 24,
  marginRight: 2,
  // Reserve the hit area so revealing close never shifts the title.
  opacity: 0,
  pointerEvents: 'none',
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
  fontSize: 18,
  cursor: 'pointer',
  ':hover': { background: 'var(--affine-hover-color)' },
  ':focus-visible': {
    outline: '2px solid var(--affine-text-secondary-color)',
    outlineOffset: -2,
  },
  ':disabled': { cursor: 'wait' },
  selectors: {
    [`${tab}:hover &, ${tab}:focus-within &`]: {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  '@media': {
    '(any-pointer: coarse), (hover: none)': {
      opacity: 1,
      pointerEvents: 'auto',
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const error = style({
  padding: '5px 12px',
  fontSize: 12,
  color: 'var(--affine-error-color)',
});
