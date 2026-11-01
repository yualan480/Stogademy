import { SEED,VERSION } from '../world.js';
// Durable Object SQLite is private to the single public-world instance.
export function cloudStore(storage){
 const sql=storage.sql;
 sql.exec('CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 sql.exec('CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,updated_at INTEGER NOT NULL)');
 sql.exec('CREATE TABLE IF NOT EXISTS blocks(x INTEGER,y INTEGER,z INTEGER,block INTEGER NOT NULL,PRIMARY KEY(x,y,z))');
 sql.exec('CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY,player TEXT,name TEXT,text TEXT,created_at INTEGER)');
 const version=JSON.stringify({seed:SEED,version:VERSION});
 const old=sql.exec("SELECT value FROM metadata WHERE key='world'").toArray()[0];
 if(old && old.value!==version)throw new Error('World generation mismatch: migrate database first.');
 sql.exec("INSERT OR IGNORE INTO metadata VALUES ('world',?)",version);
 const savePlayer=p=>sql.exec('INSERT INTO players VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state,updated_at=excluded.updated_at',p.id,p.name,JSON.stringify({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,inventory:p.inventory,mined:p.mined,placed:p.placed}),Date.now());
 return {savePlayer,
 loadPlayer:id=>{const p=sql.exec('SELECT state FROM players WHERE id=?',id).toArray()[0];return p?JSON.parse(p.state):null;},
 changes:()=>sql.exec('SELECT * FROM blocks').toArray(),
 edit:(p,a,b)=>storage.transactionSync(()=>{sql.exec('INSERT INTO blocks VALUES (?,?,?,?) ON CONFLICT(x,y,z) DO UPDATE SET block=excluded.block',a.x,a.y,a.z,b);savePlayer(p);}),
 chat:(p,text)=>storage.transactionSync(()=>{const time=Date.now();const row=sql.exec('INSERT INTO chat(player,name,text,created_at) VALUES (?,?,?,?) RETURNING id',p.id,p.name,text,time).toArray()[0];sql.exec('DELETE FROM chat WHERE id < ?',row.id-199);return {type:'chat',id:row.id,name:p.name,text,time};}),
 history:()=>sql.exec('SELECT name,text,created_at AS time FROM chat ORDER BY id DESC LIMIT 30').toArray().reverse()
 };
}
