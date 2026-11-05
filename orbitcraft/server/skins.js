import {SUPABASE_URL,SUPABASE_ANON_KEY} from '../../chatter/config.js';
import {SKIN_PRICE,validSkin} from '../skins.js';
async function wallet(p,path,{body}={}){if(!p.authToken)throw Error('Sign in to Orbit to change your skin.');const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method:body?'POST':'GET',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${p.authToken}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok){const error=Error(data?.message||'Could not reach your Orbit wallet. Please try again.');error.definitive=true;throw error;}return data;}
export const skinWallet={receipt:async(p,key)=>(await wallet(p,`orbit_ledger?user_id=eq.${encodeURIComponent(p.id)}&reason=eq.spend&amount=eq.-${SKIN_PRICE}&ref=like.${key}:*&select=ref&limit=1`)).length>0,spend:(p,key)=>wallet(p,'rpc/spend_orbits',{body:{p_item:key,p_price:SKIN_PRICE}})};
export async function chooseSkin(game,p,m,payment=skinWallet){if(!validSkin(m.skin))throw Error('Choose one of the available skins.');if(p.skinBuying)throw Error('Your skin change is still processing.');p.skinBuying=true;try{
 if(p.survival.skinChosen&&p.survival.skin===m.skin&&!p.survival.skinPurchase){p.send({type:'skin-saved',skin:m.skin,price:0});return;}
 if(!p.survival.skinChosen){game.survival.atomic(p,()=>{p.survival.skin=m.skin;p.survival.skinChosen=true;});p.send({type:'skin-saved',skin:m.skin,price:0});return;}
 let pending=p.survival.skinPurchase;
 if(pending&&pending.skin!==m.skin){if(pending.status==='charging')throw Error('Finish your pending skin change before choosing another skin.');if(await payment.receipt(p,pending.key))throw Error('Finish your pending skin change before choosing another skin.');game.survival.atomic(p,()=>delete p.survival.skinPurchase);pending=null;}
 if(!pending){pending={skin:m.skin,key:'ocskin_'+crypto.randomUUID().replaceAll('-','').slice(0,16)};game.survival.atomic(p,()=>p.survival.skinPurchase=pending);}
 // Persist the purchase key before charging. A lost response or failed save can
 // retry against the ledger receipt instead of charging the player again.
 let balance;if(!await payment.receipt(p,pending.key)){if(pending.status==='charging')throw Error('Your payment is still being confirmed. Try this skin again shortly.');game.survival.atomic(p,()=>pending.status='charging');try{balance=await payment.spend(p,pending.key);}catch(error){if(error.definitive)game.survival.atomic(p,()=>pending.status='ready');throw error;}}
 game.survival.atomic(p,()=>{p.survival.skin=pending.skin;delete p.survival.skinPurchase;});p.send({type:'skin-saved',skin:p.survival.skin,price:SKIN_PRICE,...(Number.isFinite(balance)?{balance}:{})});
 }finally{p.skinBuying=false;}}
