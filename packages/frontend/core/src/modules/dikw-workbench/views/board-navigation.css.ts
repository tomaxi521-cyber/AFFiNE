import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  padding: '12px 16px',
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/primary'),
  fontSize: 14,
  lineHeight: 1.5,
});

export const breadcrumbs = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  listStyle: 'none',
  margin: 0,
  padding: 0,
});

export const crumb = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  maxWidth: '100%',
  color: cssVarV2('text/secondary'),
});

export const current = style({
  padding: '4px 8px',
  overflowWrap: 'anywhere',
  color: cssVarV2('text/primary'),
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
});

export const textButton = style({
  minHeight: 32,
  minWidth: 0,
  padding: '4px 8px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'start',
  overflowWrap: 'anywhere',
  cursor: 'pointer',
  selectors: {
    '&:hover:not(:disabled)': {
      background: cssVarV2('button/secondary'),
    },
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
      outlineOffset: 2,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const button = style([
  textButton,
  { borderColor: cssVarV2('layer/insideBorder/border') },
]);

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: 12,
  border: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  borderRadius: 6,
});

export const input = style({
  width: '100%',
  maxWidth: 360,
  minHeight: 32,
  boxSizing: 'border-box',
  padding: '4px 8px',
  border: '1px solid ' + cssVarV2('input/border/default'),
  borderRadius: 6,
  color: 'inherit',
  font: 'inherit',
  background: cssVarV2('layer/background/primary'),
  selectors: {
    '&:focus-visible': {
      outline: '2px solid ' + cssVarV2('input/border/active'),
      outlineOffset: 2,
    },
    '&[aria-invalid="true"]': {
      borderColor: cssVarV2('status/error'),
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const error = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  margin: 0,
  color: cssVarV2('status/error'),
  overflowWrap: 'anywhere',
});

export const hint = style({
  margin: 0,
  color: cssVarV2('text/secondary'),
  fontSize: 13,
});

export const status = style([
  hint,
  { selectors: { '&:empty': { margin: 0, height: 0 } } },
]);

export const heading = style({
  margin: '0 0 4px',
  fontSize: 14,
  fontWeight: 600,
});

export const children = style({
  display: 'flex',
  flexDirection: 'column',
  listStyle: 'none',
  margin: 0,
  padding: 0,
  gap: 4,
});

export const childButton = style([textButton, { width: '100%' }]);
