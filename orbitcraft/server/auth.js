import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../chatter/config.js';
// Names and IDs always come from verified Orbit identity, never from the client.
export async function authenticate(token, { orbitName = false } = {}) {
  if(typeof token!=='string'||token.length>8192)throw new Error('Sign in to Orbit first.');
  const headers={apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`};
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Orbit session expired. Sign in to Orbit again.');
  const user=await response.json();if(!user.id)throw new Error('Invalid Orbit identity.');
  const profile=await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=username,display_name,first_name,last_name`,{headers,signal:AbortSignal.timeout(8000)});
  if(!profile.ok)throw new Error('Could not read Orbit profile.');
  const rows=await profile.json();if(!rows[0]?.username)throw new Error('Finish creating your Orbit profile first.');
  let expiry=Date.now()+45*60*1000;
  try{const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(Number.isFinite(claims.exp))expiry=Math.min(expiry,claims.exp*1000);}catch{/* Identity has already been verified by Supabase. */}
  const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
  const full=[clean(rows[0].first_name),clean(rows[0].last_name)].filter(Boolean).join(' ');
  const display=clean(rows[0].display_name);
  const name=orbitName?(display||full||clean(rows[0].username)):(full||(display!==rows[0].username&&display.includes(' ')?display:'Player'));
  return {id:user.id,name:name.slice(0,80),expiresAt:expiry};
}
