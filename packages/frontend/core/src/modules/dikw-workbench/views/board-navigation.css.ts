import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  position: 'relative',
  flexShrink: 0,
  minWidth: 0,
  padding: '4px 12px',
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/primary'),
  fontSize: 13,
  lineHeight: 1.5,
});

export const toolbar = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 8px',
  minWidth: 0,
});

export const path = style({
  flex: '1 1 160px',
  minWidth: 0,
  overflowX: 'auto',
  scrollbarWidth: 'thin',
});

export const breadcrumbs = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  listStyle: 'none',
  margin: 0,
  padding: 2,
});

export const crumb = style({
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  gap: 2,
  minWidth: 0,
  color: cssVarV2('text/secondary'),
});

export const current = style({
  maxWidth: 240,
  padding: '4px 6px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVarV2('text/primary'),
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
  color: cssVarV2('text/secondary'),
});

export const textButton = style({
  minHeight: 32,
  minWidth: 32,
  padding: '4px 8px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'start',
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

export const breadcrumbButton = style([
  textButton,
  {
    maxWidth: 200,
    padding: '4px 6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
]);

export const button = style([
  textButton,
  { borderColor: cssVarV2('layer/insideBorder/border') },
]);

export const recovery = style({
  position: 'relative',
});

export const summary = style([
  textButton,
  { boxSizing: 'border-box', whiteSpace: 'nowrap' },
]);

export const recoveryPanel = style({
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 280,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'min(320px, 50vh)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: 12,
  boxSizing: 'border-box',
  border: '1px solid ' + cssVarV2('layer/insideBorder/border'),
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
});

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  marginTop: 8,
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
  margin: '4px 0',
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

export const children = style({
  display: 'flex',
  flexDirection: 'column',
  listStyle: 'none',
  margin: 0,
  padding: 0,
  gap: 4,
});

export const childButton = style([
  textButton,
  { width: '100%', overflowWrap: 'anywhere' },
]);
