// Local PostgreSQL integration check. Install @electric-sql/pglite separately,
// then set PGLITE_MODULE to its module path; no production credentials are used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-a111-111111111111',old='22222222-2222-4222-a222-222222222222',challenger='33333333-3333-4333-a333-333333333333',unarmed='44444444-4444-4444-a444-444444444444',faker='55555555-5555-4555-a555-555555555555';
const migration=await readFile(new URL('../migration-loop-sword-only.sql',import.meta.url),'utf8');
const scalar=async sql=>(await db.query(sql)).rows[0].v;
async function asUser(id,sql){await db.exec(`set request.jwt.claim.sub='${id}';set role authenticated;`);try{return await db.query(sql);}finally{await db.exec('reset role;');}}
try{
 await db.exec(`
 create role anon;create role authenticated;
 create schema auth;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key,email text unique);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,display_name text);
 create table public.orbit_loop(id int primary key,holder uuid,price int default 0,start_price int default 50000,takes int default 0,taken_at timestamptz);
 create table public.orbit_loop_history(id bigint generated always as identity primary key,user_id uuid,price int,how text,taken_at timestamptz default now());
 create table public.game_inventory(user_id uuid,item_id text,qty int check(qty>=0),primary key(user_id,item_id));
 create table public.game_shield(user_id uuid primary key,active_until timestamptz);
 create table public.game_sword(id int primary key,holder uuid);
 create table public.game_players(user_id uuid primary key,active boolean default true,left_at timestamptz,victories int default 0);
 create table public.game_log(id bigint generated always as identity primary key,kind text,actor uuid,target uuid,outcome text,created_at timestamptz default now());
 create function public.game_cfg(text) returns int language sql as $$select 7$$;
 create function public.game_newcomer(uuid) returns boolean language sql as $$select false$$;
 create function public._loop_move(uuid,text,int default null) returns void language sql as $$select null::void$$;
 create function public.challenge_loop() returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.take_orbit_loop(int) returns jsonb language sql security definer as $$update public.orbit_loop set holder=auth.uid() returning '{}'::jsonb$$;
 grant execute on function public.take_orbit_loop(int) to authenticated;
 grant update on public.orbit_loop to authenticated;
 insert into auth.users values('${owner}','30yua@tesdk12.net'),('${old}','old@tesdk12.net'),('${challenger}','challenger@tesdk12.net'),('${unarmed}','unarmed@tesdk12.net'),('${faker}','fake@tesdk12.net');
 insert into public.profiles values('${owner}','Owner'),('${old}','Old holder'),('${challenger}','Challenger'),('${unarmed}','Unarmed'),('${faker}','30yua');
 insert into public.game_players(user_id,active) select id,id<>'${owner}' from auth.users;
 insert into public.orbit_loop values(1,'${old}',90000,50000,2,now());
 insert into public.game_shield values('${old}',now()+interval '48 hours');
 insert into public.game_sword values(1,'${challenger}');
 `);
 await db.exec(migration);
 assert.equal(await scalar('select holder::text v from public.orbit_loop'),owner,'Restoration must match login identity, not the spoofed display name.');
 assert.equal(await scalar("select how v from public.orbit_loop_history order by id desc limit 1"),'restored');
 assert.equal(await scalar(`select active v from public.game_players where user_id='${owner}'`),true);
 assert.equal(await scalar(`select active_until<=now() v from public.game_shield where user_id='${old}'`),true);
 for(const sql of ['select public.take_orbit_loop(1000000)','select public.designate_loop(auth.uid(),\'event\')',"select public._loop_move(auth.uid(),'challenge')",`update public.orbit_loop set holder='${unarmed}' where id=1`])await assert.rejects(asUser(unarmed,sql),/permission denied/);
 await assert.rejects(asUser(unarmed,'select public.challenge_loop()'),/Sword of Stars/);
 assert.equal(await scalar('select holder::text v from public.orbit_loop'),owner);
 assert.equal(await scalar('select count(*)::int v from public.game_log'),0);
 await db.exec(`insert into public.game_inventory values('${challenger}','sword',1);`);
 const won=(await asUser(challenger,'select public.challenge_loop() v')).rows[0].v;
 assert.equal(won.outcome,'transferred');assert.equal(await scalar('select holder::text v from public.orbit_loop'),challenger);
 assert.equal(await scalar(`select qty v from public.game_inventory where user_id='${challenger}' and item_id='sword'`),0);
 assert.equal(await scalar('select holder::text v from public.game_sword'),null);
 assert.equal(await scalar(`select victories v from public.game_players where user_id='${challenger}'`),1);
 const transfers=await scalar('select count(*)::int v from public.orbit_loop_history');await db.exec(migration);
 assert.equal(await scalar('select holder::text v from public.orbit_loop'),challenger,'Rerunning migration must not steal a legitimate win.');assert.equal(await scalar('select count(*)::int v from public.orbit_loop_history'),transfers);
 await db.exec(`insert into public.game_inventory values('${unarmed}','sword',1);insert into public.game_shield values('${challenger}',now()+interval '48 hours');update public.game_sword set holder='${unarmed}';`);
 const blocked=(await asUser(unarmed,'select public.challenge_loop() v')).rows[0].v;
 assert.equal(blocked.outcome,'blocked');assert.equal(await scalar('select holder::text v from public.orbit_loop'),challenger);assert.equal(await scalar(`select qty v from public.game_inventory where user_id='${unarmed}' and item_id='sword'`),0);
 await db.exec(`update public.game_inventory set qty=1 where user_id='${unarmed}' and item_id='sword';`);await assert.rejects(asUser(unarmed,'select public.challenge_loop()'),/cooldown/);assert.equal(await scalar(`select qty v from public.game_inventory where user_id='${unarmed}' and item_id='sword'`),1);
 console.log('PASS: PostgreSQL restoration to verified 30yua; purchase/event/helper/direct-write denied; no-Sword challenge denied; Sword consumed on win and Shield block; cooldown enforced; migration rerun preserves legitimate ownership.');
}finally{await db.close();}
