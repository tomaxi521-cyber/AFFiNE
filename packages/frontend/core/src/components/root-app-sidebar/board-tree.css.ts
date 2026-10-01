import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';
export const empty=style({padding:'6px 12px 8px 40px',fontSize:12,color:cssVarV2('text/secondary')});
export const list=style({listStyle:'none',padding:0,margin:0});
export const row=style({display:'flex',alignItems:'center',minHeight:34,borderRadius:6,selectors:{'&[data-active="true"]':{background:cssVarV2('button/secondary')},'&:hover':{background:cssVarV2('button/secondary')}}});
export const toggle=style({border:0,background:'transparent',color:cssVarV2('text/secondary'),width:26,height:32,flexShrink:0,cursor:'pointer',padding:0,selectors:{'&:focus-visible':{outline:'2px solid '+cssVarV2('input/border/active'),borderRadius:4}}});
export const link=style({border:0,background:'transparent',color:'inherit',font:'inherit',fontSize:14,textAlign:'left',textDecoration:'none',display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1,height:34,padding:'0 8px 0 0',cursor:'pointer',selectors:{'&:focus-visible':{outline:'2px solid '+cssVarV2('input/border/active'),borderRadius:4}}});
export const label=style({whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
