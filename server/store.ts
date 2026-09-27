import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdirSync } from 'node:fs';
import { id,stamp } from './domain.js';

export interface DB {query<T=any>(sql:string,args?:any[]):Promise<{rows:T[]}>;close():Promise<void>}
export async function connect(memory=false):Promise<DB>{
 let db:DB;
 if(process.env.DATABASE_URL&&!memory){const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});db={query:async<T>(s:string,a?:any[])=>({rows:(await pool.query(s,a)).rows as T[]}),close:()=>pool.end()};}
 else{const root=process.env.DATA_DIR||'data';mkdirSync(root,{recursive:true});const p=new PGlite(memory?undefined:root+'/postgres');db={query:(s,a)=>p.query(s,a),close:()=>p.close()};}
 await db.query('CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL,PRIMARY KEY(kind,id))');
 await db.query('CREATE TABLE IF NOT EXISTS slots (account TEXT NOT NULL,day TEXT NOT NULL,slot INTEGER NOT NULL,post TEXT NOT NULL UNIQUE,PRIMARY KEY(account,day,slot))');
 await db.query('CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires BIGINT NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,at TEXT NOT NULL,account TEXT,event TEXT NOT NULL,detail TEXT NOT NULL)');
 return db;
}
export class Store {
 constructor(public db:DB){}
 async get<T>(kind:string,key:string):Promise<T|undefined>{return (await this.db.query<{data:T}>('SELECT data FROM records WHERE kind=$1 AND id=$2',[kind,key])).rows[0]?.data;}
 async list<T>(kind:string):Promise<T[]>{return (await this.db.query<{data:T}>('SELECT data FROM records WHERE kind=$1',[kind])).rows.map(x=>x.data);}
 async put(kind:string,key:string,data:unknown){await this.db.query('INSERT INTO records VALUES($1,$2,$3::jsonb) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',[kind,key,JSON.stringify(data)]);}
 async remove(kind:string,key:string){await this.db.query('DELETE FROM records WHERE kind=$1 AND id=$2',[kind,key]);}
 async reserve(account:string,day:string,slot:number,post:string){return (await this.db.query('INSERT INTO slots VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING post',[account,day,slot,post])).rows.length>0;}
 async reservePost(p:{id:string;accountId:string;date:string;slot:number}){return (await this.db.query("WITH inserted AS (INSERT INTO slots VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING post) INSERT INTO records(kind,id,data) SELECT 'posts',post,$5::jsonb FROM inserted RETURNING id",[p.accountId,p.date,p.slot,p.id,JSON.stringify(p)])).rows.length>0;}
 async lock(name:string,owner:string,ms=120000){return (await this.db.query('INSERT INTO locks VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE locks.expires < $4 RETURNING owner',[name,owner,Date.now()+ms,Date.now()])).rows.length>0;}
 async owns(name:string,owner:string){return (await this.db.query('SELECT owner FROM locks WHERE name=$1 AND owner=$2 AND expires>$3',[name,owner,Date.now()])).rows.length>0;}
 async unlock(name:string,owner:string){await this.db.query('DELETE FROM locks WHERE name=$1 AND owner=$2',[name,owner]);}
 async log(event:string,detail:string,account=''){await this.db.query('INSERT INTO audit VALUES($1,$2,$3,$4,$5)',[id(),stamp(),account,event,detail]);}
 async logs(){return (await this.db.query('SELECT * FROM audit ORDER BY at DESC LIMIT 200')).rows;}
}
