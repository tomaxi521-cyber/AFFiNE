import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const navWrapperStyle = style({
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
  paddingBottom: 8,
  // Docked navigation may exceed half a narrow viewport; never become an overlay.
  maxWidth: '100%',
  selectors: {
    '&[data-has-border=true]': {
      borderRight: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
    },
    '&[data-is-electron="false"]': {
      backgroundColor: cssVarV2('layer/background/primary'),
    },
  },
});
export const navHeaderButton = style({
  width: '32px',
  height: '32px',
  flexShrink: 0,
});
export const navHeaderNavigationButtons = style({
  display: 'flex',
  alignItems: 'center',
  columnGap: '32px',
});
export const navStyle = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});
export const navHeaderStyle = style({
  flex: '0 0 auto',
  minHeight: '44px',
  padding: '4px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const navBodyStyle = style({
  flex: '1 1 auto',
  minHeight: 0,
  height: 0,
  display: 'flex',
  flexDirection: 'column',
  rowGap: '4px',
});
export const resizeHandleShortcutStyle = style({
  alignItems: 'flex-end',
  marginBottom: '2px',
});
