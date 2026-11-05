export const SIGN_LINES=4,SIGN_WIDTH=90;
export function glyphWidth(char){if(/\p{Mark}/u.test(char))return 0;if(char===' ')return 4;if("!.,:;'|i".includes(char))return 2;if('l`'.includes(char))return 3;if('I[]t'.includes(char))return 4;if('fr(){}"*'.includes(char))return 5;if('@~'.includes(char))return 7;return char.codePointAt(0)>0x2fff?10:6;}
export const lineWidth=line=>[...line].reduce((n,c)=>n+glyphWidth(c),0);
export function fitLine(value){let out='',width=0,count=0;for(const c of String(value??'').slice(0,256).replace(/[\p{Cc}\p{Cf}]/gu,'')){const w=glyphWidth(c);if(width+w>SIGN_WIDTH||count++>=128)break;out+=c;width+=w;}return out;}
export const fitSign=lines=>Array.from({length:SIGN_LINES},(_,i)=>fitLine(typeof lines?.[i]==='string'?lines[i]:''));
