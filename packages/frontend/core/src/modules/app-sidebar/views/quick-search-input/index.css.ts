import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '4px',
  fontSize: 13,
  width: '100%',
  height: '32px',
  '@media': { '(any-pointer: coarse)': { height: 44 } },
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px 0 8px',
  position: 'relative',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  ':hover': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});
export const icon = style({
  marginRight: '8px',
  color: cssVarV2('icon/primary'),
  fontSize: '16px',
});
export const spacer = style({
  flex: 1,
});
export const shortcutHint = style({
  color: cssVarV2('text/tertiary'),
  fontSize: 11,
});
export const quickSearchBarEllipsisStyle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
