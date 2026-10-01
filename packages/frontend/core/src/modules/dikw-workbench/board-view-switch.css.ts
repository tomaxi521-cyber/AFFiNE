import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const switchGroup = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  gap: 2,
  padding: 2,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
});

export const viewButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 32,
  minWidth: 44,
  padding: '4px 8px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  font: 'inherit',
  fontSize: 12,
  lineHeight: '20px',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover:not(:disabled)': {
      background: cssVarV2('button/secondary'),
      color: cssVarV2('text/primary'),
    },
    '&[aria-pressed="true"]': {
      background: cssVarV2('button/secondary'),
      color: cssVarV2('text/primary'),
      fontWeight: 600,
    },
    '&:focus-visible': {
      outline: `2px solid ${cssVarV2('input/border/active')}`,
      outlineOffset: 2,
    },
    '&:disabled': {
      cursor: 'default',
      opacity: 0.6,
    },
  },
});
