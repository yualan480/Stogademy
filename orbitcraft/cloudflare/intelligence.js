import { authenticate } from '../server/auth.js';
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const topics=['clues','theories','activity','alliances','map'];
export class OrbitIntelligence {
 constructor(ctx){this.sql=ctx.storage.sql;this.clients=new Map();this.sql.exec('CREATE TABLE IF NOT EXISTS intelligence (id TEXT PRIMARY KEY, kind TEXT NOT NULL, author TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL)');}
 rows(kind){return this.sql.exec('SELECT data FROM intelligence WHERE kind=? ORDER BY created LIMIT 500',kind).toArray().map(r=>JSON.parse(r.data));}
 snapshot(){return {type:'snapshot',messages:this.rows('message'),stars:this.rows('star'),links:this.rows('link'),online:[...new Map([...this.clients.values()].filter(Boolean).map(p=>[p.id,{id:p.id,name:p.name}])).values()]};}
 broadcast(){const data=JSON.stringify(this.snapshot());for(const [ws,p] of this.clients)if(p)try{ws.send(data);}catch{this.clients.delete(ws);}}
 mutate(p,m){
  const kind=m.type==='message'?'message':m.type.startsWith('star-')?'star':m.type.startsWith('link-')?'link':null;if(!kind)throw Error('Unknown action.');
  const existing=m.id?this.sql.exec('SELECT * FROM intelligence WHERE id=?',m.id).toArray()[0]:null;
  if(m.type.endsWith('-delete')){if(!existing||existing.kind!==kind||existing.author!==p.id)throw Error('You can only delete your own contributions.');this.sql.exec('DELETE FROM intelligence WHERE id=?',m.id);if(kind==='star')for(const link of this.rows('link'))if(link.from===m.id||link.to===m.id)this.sql.exec('DELETE FROM intelligence WHERE id=?',link.id);return;}
  if(m.type==='star-move'){if(!existing||existing.kind!=='star'||existing.author!==p.id)throw Error('You can only move your own stars.');const s=JSON.parse(existing.data);s.x=this.coordinate(m.x);s.y=this.coordinate(m.y);this.sql.exec('UPDATE intelligence SET data=? WHERE id=?',JSON.stringify(s),s.id);return;}
  if(!['message','star-create','link-create'].includes(m.type))throw Error('Unknown action.');
  if(kind!=='message'&&this.rows(kind).length>=500)throw Error('The map is full. Remove older contributions first.');
  const row={id:crypto.randomUUID(),author:p.id,name:p.name,created:Date.now()};
  if(kind==='message'){row.text=clean(m.text,1500);row.topic=topics.includes(m.topic)?m.topic:'theories';if(!row.text)throw Error('Write a message first.');}
  if(kind==='star'){Object.assign(row,{title:clean(m.title,80),body:clean(m.body,1000),source:clean(m.source,120)||'Player theory',confidence:['low','medium','high'].includes(m.confidence)?m.confidence:'low',kind:m.kind==='report'?'report':'theory',x:this.coordinate(m.x),y:this.coordinate(m.y)});if(!row.title||!row.body)throw Error('Add a title and a theory or report.');}
  if(kind==='link'){const stars=this.rows('star');if(m.from===m.to||!stars.some(s=>s.id===m.from)||!stars.some(s=>s.id===m.to))throw Error('Choose two different existing stars.');Object.assign(row,{from:m.from,to:m.to,label:clean(m.label,100)||'Unverified connection'});if(this.rows('link').some(l=>(l.from===m.from&&l.to===m.to)||(l.to===m.from&&l.from===m.to)))throw Error('Those stars are already connected.');}
  this.sql.exec('INSERT INTO intelligence VALUES (?,?,?,?,?)',row.id,kind,p.id,JSON.stringify(row),row.created);
  if(kind==='message')this.sql.exec("DELETE FROM intelligence WHERE kind='message' AND id NOT IN (SELECT id FROM intelligence WHERE kind='message' ORDER BY created DESC LIMIT 300)");
 }
 coordinate(v){if(!Number.isFinite(v))throw Error('Invalid star position.');return Math.max(.04,Math.min(.96,v));}
 async fetch(request){const url=new URL(request.url);if(url.pathname.endsWith('/health'))return Response.json({ok:true,service:'orbit-intelligence',version:1});if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});if(request.headers.get('Origin')!==url.origin)return new Response('Origin denied',{status:403});if(this.clients.size>=128)return new Response('Intelligence is busy. Try again shortly.',{status:503});
  const [client,ws]=Object.values(new WebSocketPair());ws.accept();this.clients.set(ws,null);let p=null,busy=false,last=0,quota=0,windowAt=Date.now();const timeout=setTimeout(()=>ws.close(4001,'Sign in required'),10000);const send=m=>ws.send(JSON.stringify(m));
  ws.addEventListener('message',async e=>{try{if(typeof e.data!=='string'||e.data.length>12000)throw Error('Message too large.');if(Date.now()-windowAt>60000){quota=0;windowAt=Date.now();}if(++quota>120)return ws.close(4008,'Rate limit');const m=JSON.parse(e.data);if(!p){if(busy)return;busy=true;if(m.type!=='auth')throw Error('Sign in required.');p=await authenticate(m.token,{orbitName:true});if(ws.readyState!==1)return;clearTimeout(timeout);this.clients.set(ws,p);send({type:'identity',id:p.id});this.broadcast();return;}if(Date.now()>p.expiresAt)return ws.close(4001,'Session expired');if(Date.now()-last<250)throw Error('Please wait a moment.');this.mutate(p,m);last=Date.now();send({type:'ack',action:m.type});this.broadcast();}catch(err){try{send({type:'error',message:err.message});}catch{}if(!p)ws.close(4001,'Authentication failed');}});
  const close=()=>{clearTimeout(timeout);this.clients.delete(ws);this.broadcast();};ws.addEventListener('close',close);ws.addEventListener('error',close);return new Response(null,{status:101,webSocket:client});
 }
}
