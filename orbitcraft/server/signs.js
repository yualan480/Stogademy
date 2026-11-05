import {raycast} from '../world.js';
import {fitSign} from '../sign-text.js';
export const signKey=a=>`${a.x},${a.y},${a.z}`;
export const newSign=a=>({x:a.x,y:a.y,z:a.z,lines:fitSign([]),token:crypto.randomUUID(),revision:0});
export const publicSign=s=>({x:s.x,y:s.y,z:s.z,lines:s.lines,revision:s.revision});
export function openSign(s,p,hit){const key=signKey(hit);if(!s.world.signs[key])s.atomic(p,()=>s.world.signs[key]=newSign(hit));const sign=s.world.signs[key];p.signEdit={key,token:sign.token,revision:sign.revision};p.send({type:'sign-open',sign:publicSign(sign)});}
export function signMessage(s,p,m){if(!['sign-save','sign-cancel'].includes(m.type))return false;if(m.type==='sign-cancel'){p.signEdit=null;return true;}const edit=p.signEdit,sign=edit&&s.world.signs[edit.key],hit=raycast(p,s.g.get);if(!sign||sign.token!==edit.token||!hit||hit.block!==38||signKey(hit)!==edit.key||Math.hypot(p.x-sign.x-.5,p.y-sign.y,p.z-sign.z-.5)>6)throw Error('Stand near and look at the sign to edit it.');if(sign.revision!==edit.revision)throw Error('This sign changed. Close the editor and right-click it again.');if(!Array.isArray(m.lines))throw Error('Sign text must contain four lines.');const lines=fitSign(m.lines);s.atomic(p,()=>{sign.lines=lines;sign.revision++;});p.signEdit=null;s.g.broadcastNear({type:'sign-update',sign:publicSign(sign)},sign);p.send({type:'sign-saved'});return true;}
