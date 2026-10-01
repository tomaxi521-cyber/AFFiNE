import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';
export const panel = style({position:'absolute',top:92,left:80,zIndex:20,width:300,maxWidth:'calc(100% - 96px)',maxHeight:'calc(100% - 112px)',overflow:'auto',padding:16,borderRadius:12,border:'1px solid '+cssVarV2('layer/insideBorder/border'),background:cssVarV2('layer/background/primary'),color:cssVarV2('text/primary'),boxShadow:'0 8px 32px rgba(0,0,0,.1)',display:'flex',flexDirection:'column',gap:12});
export const row = style({display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'});
export const button = style({font:'inherit',fontSize:13,padding:'9px 12px',border:'1px solid '+cssVarV2('layer/insideBorder/border'),borderRadius:7,background:'transparent',color:'inherit',cursor:'pointer',textAlign:'left',selectors:{'&:hover':{background:cssVarV2('button/secondary')},'&:focus-visible':{outline:'2px solid '+cssVarV2('input/border/active')},'&:disabled':{opacity:.45,cursor:'not-allowed'}}});
export const hint = style({fontSize:12,lineHeight:1.6,color:cssVarV2('text/secondary'),margin:0});
export const field = style({width:'100%',font:'inherit',fontSize:13,padding:8,borderRadius:6,color:'inherit',background:'transparent',border:'1px solid '+cssVarV2('layer/insideBorder/border')});
