import {dimensionSQL} from './dimension-store.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED, VERSION } from '../world.js';
export function openStore(path,{dimension='overworld'}={}) {
  mkdirSync(dirname(path),{recursive:true});
  const raw=new DatabaseSync(path),db=dimension==='overworld'?raw:{exec:sql=>raw.exec(dimensionSQL(sql,dimension)),prepare:sql=>raw.prepare(dimensionSQL(sql,dimension)),close:()=>raw.close()};
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks(x INTEGER,y INTEGER,z INTEGER,block INTEGER NOT NULL,PRIMARY KEY(x,y,z));
    CREATE TABLE IF NOT EXISTS drops(id TEXT PRIMARY KEY,state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY, player TEXT NOT NULL,name TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  const version=JSON.stringify({seed:SEED,version:VERSION});
  const old=db.prepare('SELECT value FROM metadata WHERE key=?').get('world');
  if(old && old.value!==version) throw new Error('World generation version mismatch: migrate database first.');
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('world',version);
  const save=db.prepare('INSERT INTO players VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state,updated_at=excluded.updated_at');
  const block=db.prepare('INSERT INTO blocks VALUES (?,?,?,?) ON CONFLICT(x,y,z) DO UPDATE SET block=excluded.block');
  const savePlayer=p=>save.run(p.id,p.name,JSON.stringify({dimension:p.dimension||'overworld',x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,inventory:p.inventory,mined:p.mined||0,placed:p.placed||0,survival:p.survival,hotbar:p.hotbar}),Date.now());
  return {db,savePlayer,scope:dimension=>openStore(path,{dimension}),
    loadSurvival:()=>{const r=db.prepare("SELECT value FROM metadata WHERE key='survival'").get();return r?JSON.parse(r.value):null;},
    saveSurvival:state=>db.prepare("INSERT INTO metadata VALUES ('survival',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(state)),
    commit(p,{blocks=[],drops=[],survival,players=[]}){db.exec('BEGIN IMMEDIATE');try{for(const a of blocks)block.run(a.x,a.y,a.z,a.block);for(const d of drops)db.prepare('INSERT INTO drops VALUES (?,?)').run(d.id,JSON.stringify(d));if(p)savePlayer(p);for(const other of players)if(other!==p)savePlayer(other);if(survival)db.prepare("INSERT INTO metadata VALUES ('survival',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(survival));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
    loadPlayer:id=>{const p=db.prepare('SELECT state FROM players WHERE id=?').get(id);return p?JSON.parse(p.state):null;},
    changes:()=>db.prepare('SELECT * FROM blocks').all(),
    drops:()=>db.prepare('SELECT state FROM drops').all().map(r=>JSON.parse(r.state)),
    breakBlock(p,a,drop){db.exec('BEGIN IMMEDIATE');try{block.run(a.x,a.y,a.z,0);db.prepare('INSERT INTO drops VALUES (?,?)').run(drop.id,JSON.stringify(drop));savePlayer(p);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
    collectDrop(p,id){db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('DELETE FROM drops WHERE id=? RETURNING id').get(id);if(!row)throw new Error('Item already collected');savePlayer(p);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
    saveDrops(items){if(!items.length)return;db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE drops SET state=? WHERE id=?');for(const d of items)update.run(JSON.stringify(d),d.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
    edit(p,a,type) { db.exec('BEGIN IMMEDIATE');try {block.run(a.x,a.y,a.z,type);savePlayer(p);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;} },
    chat(p,text) {const time=Date.now();const r=db.prepare('INSERT INTO chat(player,name,text,created_at) VALUES (?,?,?,?)').run(p.id,p.name,text,time);db.prepare('DELETE FROM chat WHERE id < ?').run(Number(r.lastInsertRowid)-199);return {type:'chat',id:Number(r.lastInsertRowid),name:p.name,text,time};},
    history:()=>db.prepare('SELECT name,text,created_at AS time FROM chat ORDER BY id DESC LIMIT 30').all().reverse(),
    close:()=>db.close()
  };
}
