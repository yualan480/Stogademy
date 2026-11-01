import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED, VERSION } from '../world.js';
export function openStore(path) {
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks(x INTEGER,y INTEGER,z INTEGER,block INTEGER NOT NULL,PRIMARY KEY(x,y,z));
    CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY, player TEXT NOT NULL,name TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  const version=JSON.stringify({seed:SEED,version:VERSION});
  const old=db.prepare('SELECT value FROM metadata WHERE key=?').get('world');
  if(old && old.value!==version) throw new Error('World generation version mismatch: migrate database first.');
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('world',version);
  const save=db.prepare('INSERT INTO players VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state,updated_at=excluded.updated_at');
  const block=db.prepare('INSERT INTO blocks VALUES (?,?,?,?) ON CONFLICT(x,y,z) DO UPDATE SET block=excluded.block');
  const savePlayer=p=>save.run(p.id,p.name,JSON.stringify({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,inventory:p.inventory,mined:p.mined||0,placed:p.placed||0}),Date.now());
  return {db,savePlayer,
    loadPlayer:id=>{const p=db.prepare('SELECT state FROM players WHERE id=?').get(id);return p?JSON.parse(p.state):null;},
    changes:()=>db.prepare('SELECT * FROM blocks').all(),
    edit(p,a,type) { db.exec('BEGIN IMMEDIATE');try {block.run(a.x,a.y,a.z,type);savePlayer(p);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;} },
    chat(p,text) {const time=Date.now();const r=db.prepare('INSERT INTO chat(player,name,text,created_at) VALUES (?,?,?,?)').run(p.id,p.name,text,time);db.prepare('DELETE FROM chat WHERE id < ?').run(Number(r.lastInsertRowid)-199);return {type:'chat',id:Number(r.lastInsertRowid),name:p.name,text,time};},
    history:()=>db.prepare('SELECT name,text,created_at AS time FROM chat ORDER BY id DESC LIMIT 30').all().reverse(),
    close:()=>db.close()
  };
}
