// Anonymous Showdown name verification only. Never relay passwords, cookies, or login requests.
export async function showdownGuestAuth(request,fetcher=fetch){
 if(request.method!=='POST')return new Response('POST required',{status:405,headers:{Allow:'POST'}});
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return new Response('Origin denied',{status:403});
 if(Number(request.headers.get('Content-Length')||0)>8192)return new Response('Request too large',{status:413});
 let data;try{const text=await request.text();if(text.length>8192)return new Response('Request too large',{status:413});data=JSON.parse(text);}catch{return new Response('Invalid JSON',{status:400});}
 if(!data||typeof data!=='object'||Array.isArray(data))return new Response('Invalid JSON',{status:400});
 if(!/^[a-z0-9]{1,18}$/.test(data.userid||'')||!/^\d{1,8}\|[a-f0-9]{32,4096}$/i.test(data.challstr||''))return new Response('Invalid name or challenge',{status:400});
 try{const response=await fetcher('https://play.pokemonshowdown.com/~~showdown/action.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({act:'getassertion',userid:data.userid,challstr:data.challstr}),signal:AbortSignal.timeout(10000)});if(!response.ok)return new Response('Name verification unavailable',{status:502});const body=await response.text();if(body.length>16384)return new Response('Invalid verification response',{status:502});return new Response(body,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Name verification unavailable',{status:502});}
}
