// Local PostgreSQL plus actual OrbitBank preview checks. No production writes.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const bankSource=await readFile(new URL('../orbit-bank.js',import.meta.url),'utf8');
const sandbox={window:{dispatchEvent(){},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},CustomEvent:class{},document:{hidden:false},fetch:async()=>({ok:false})};
vm.runInNewContext(bankSource,sandbox,{filename:'orbit-bank.js'});
const bank=sandbox.window.OrbitBank;
assert.equal(bank.preview('snake',2000),40000);
assert.equal(bank.preview('snake',10000),200000);
assert.equal(bank.preview('snake',10000000),200000000);
assert.equal(bank.preview('game2048',2),1);
assert.equal(bank.preview('tetris',1),0);
for(const score of [0,-1,NaN,Infinity,-Infinity,undefined,10000001])assert.equal(bank.preview('snake',score),0);
for(let i=1;i<=1000;i++){const score=(i*9173)%10000000+1,rate=(i*1307)%100000+1;bank.rates.precision=rate/1000;assert.equal(bank.preview('precision',score),Number((BigInt(score)*BigInt(rate)+500n)/1000n));}
assert.equal(bank.preview('unknown',1000000),0);assert.equal(bank.preview('__proto__',1000000),0);
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const migration=await readFile(new URL('../../chatter/migration-game-payouts-uncapped.sql',import.meta.url),'utf8');
const user=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
async function claim(id,game,score,ref){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');try{return (await db.query('select public.claim_game_orbits($1,$2,$3) v',[game,score,ref])).rows[0].v;}finally{await db.exec('reset role');}}
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].v;
try{
 await db.exec(`
 create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.game_rates(game text primary key,permille int not null check(permille between 1 and 100000));
 insert into public.game_rates values('snake',20000),('game2048',250),('slope',1000),('max_rate',100000),('tiny',1);
 create table public.orbit_ledger(id bigint generated always as identity primary key,user_id uuid not null,amount int not null,reason text not null,ref text not null,created_at timestamptz not null default now(),unique(user_id,reason,ref),constraint orbit_ledger_amount_check check(amount<>0 and amount between -1000000 and 1000000),constraint orbit_ledger_reason_check check(reason in ('game','spend','staff_event','time_on_orbit')));
 create function public.claim_game_orbits(text,bigint,text) returns int language sql security definer as $$select 20000$$;
 `);
 await db.exec(migration);
 assert.equal(await claim(user(1),'snake',2000,'round-1'),40000);
 assert.equal(await claim(user(2),'snake',10000,'round-2'),200000);
 assert.equal(await claim(user(3),'snake',1000000,'round-3'),20000000);
 assert.equal(await claim(user(4),'max_rate',10000000,'round-max'),1000000000);
 assert.equal(await claim(user(5),'game2048',2,'half-up'),1);
 assert.equal(await claim(user(6),'tiny',1,'too-small'),0);
 assert.equal(await claim(user(1),'snake',2000,'cooldown-round'),0);
 assert.equal(await claim(user(1),'snake',2000,'round-1'),0);
 assert.equal(await scalar('select count(*)::int v from orbit_ledger where user_id=$1',[user(1)]),1);
 await db.query("update orbit_ledger set created_at=now()-interval '16 seconds' where user_id=$1",[user(1)]);
 assert.equal(await claim(user(1),'snake',2000,'round-1'),0,'Duplicate refs must return zero even after cooldown.');
 assert.equal(await claim(user(1),'snake',2000,'round-new'),40000);
 assert.equal(await scalar("select sum(amount)::bigint::text v from orbit_ledger where user_id=$1",[user(1)]),'80000');
 assert.equal(await claim(user(1),'game2048',1000,'different-game'),250);
 for(const [game,score,ref]of [['unknown',99999,'bad-game'],['snake',0,'zero'],['snake',-1,'negative'],['snake',null,'null'],['snake',10000001,'score-limit'],['snake',2000,''],['snake',2000,' '.repeat(2)],['snake',2000,'x'.repeat(81)]])assert.equal(await claim(user(7),game,score,ref),0);
 assert.equal(await claim(null,'snake',2000,'anonymous'),0);
 assert.equal(await scalar('select count(*)::int v from orbit_ledger where user_id=$1',[user(7)]),0);
 await assert.rejects(db.query("insert into orbit_ledger(user_id,amount,reason,ref)values($1,1000001,'staff_event','unrelated-positive')",[user(8)]),/check constraint/);
 await assert.rejects(db.query("insert into orbit_ledger(user_id,amount,reason,ref)values($1,-1000001,'spend','unrelated-negative')",[user(8)]),/check constraint/);
 await db.exec('set role anon');try{await assert.rejects(db.query("select public.claim_game_orbits('snake',2000,'anon')"),/permission denied/);}finally{await db.exec('reset role');}
 await db.exec('set role authenticated');try{await assert.rejects(db.query("insert into orbit_ledger(user_id,amount,reason,ref)values('00000000-0000-4000-a000-000000000008',100,'game','forged')"),/permission denied/);}finally{await db.exec('reset role');}
 await db.exec("update game_rates set permille=25000 where game='snake'");
 const count=await scalar('select count(*)::int v from orbit_ledger');await db.exec(migration);
 assert.equal(await scalar("select permille v from game_rates where game='snake'"),25000);
 assert.equal(await scalar('select count(*)::int v from orbit_ledger'),count);
 assert.equal(await claim(user(9),'snake',2000,'owner-rate'),50000);
 console.log('PASS: uncapped previews and PostgreSQL rewards over 20k, 100k and 1m (up to 1b); half-up rounding; owner rates preserved; score/auth/reference checks, cooldown and duplicate protection; unrelated ledger limits retained; safe reruns.');
}finally{await db.close();}
