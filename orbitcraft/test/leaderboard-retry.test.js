import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../games/leaderboard.js',import.meta.url),'utf8');
function fixture(storage=new Map()){
 const listeners={},timers=[],requests=[];let ok=false;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size;}};
 const win={addEventListener:(k,f)=>listeners[k]=f};win.window=win;win.parent=win;
 function Storage(){};Storage.prototype.setItem=localStorage.setItem;Storage.prototype.removeItem=localStorage.removeItem;
 const context={Storage,window:win,parent:win,localStorage,location:{pathname:'/games/index.html',origin:'http://orbit.test'},document:{addEventListener(){},querySelectorAll:()=>[]},setTimeout:(f,n)=>timers.push({f,n}),clearTimeout(){},console,URL,Promise,fetch:async(url,options)=>{requests.push({url,options});return {ok,status:ok?201:400,text:async()=> 'rejected'};}};
 vm.runInNewContext(source,context);
 return{storage,localStorage,requests,lb:win.Leaderboard,listeners,timers,setOk:v=>ok=v};
}
test('failed scores survive reload and retry only for their original player',async()=>{
 const a=fixture(new Map([['player-name','Pilot'],['lb-halved-v1','1']]));
 assert.equal(await a.lb.save('wordle',60000),false);
 assert.equal(a.storage.get('lb-pending-wordle-pilot'),'60000');
 assert.equal(a.storage.has('lb-sent-wordle-pilot'),false);
 const b=fixture(a.storage);b.localStorage.setItem('player-name','Other');b.setOk(true);b.listeners.online();await new Promise(r=>setImmediate(r));assert.equal(b.requests.length,0);
 b.localStorage.setItem('player-name','Pilot');b.listeners.online();await new Promise(r=>setImmediate(r));
 assert.equal(b.requests.length,1);assert.equal(JSON.parse(b.requests[0].options.body).score,60000);
 assert.equal(b.storage.has('lb-pending-wordle-pilot'),false);assert.match(b.storage.get('lb-sent-wordle-pilot'),/^60000\|/);
 assert.equal(await b.lb.save('wordle',50000),false);assert.equal(b.requests.length,1);
});
test('a lower failed score cannot overwrite the pending best',async()=>{
 const a=fixture(new Map([['player-name','Pilot'],['lb-halved-v1','1']]));
 await a.lb.save('slither',200);await a.lb.save('slither',100);
 assert.equal(a.storage.get('lb-pending-slither-pilot'),'200');
 a.setOk(true);a.listeners.online();await new Promise(r=>setImmediate(r));assert.equal(JSON.parse(a.requests.at(-1).options.body).score,200);
});
