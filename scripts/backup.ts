import {mkdirSync,writeFileSync} from 'node:fs';
import {connect,Store} from '../server/store.js';
import {stamp} from '../server/domain.js';
if(process.env.NODE_ENV!=='test'){try{process.loadEnvFile('.env');}catch{}}
const db=await connect(),store=new Store(db);
try{const settings=await store.get<any>('settings','main');if(settings&&!settings.stopped)throw Error('먼저 화면에서 전체 중지를 누르고 서버를 종료하세요.');const out={version:1,at:stamp(),records:(await db.query('SELECT * FROM records')).rows,slots:(await db.query('SELECT * FROM slots')).rows,audit:(await db.query('SELECT * FROM audit')).rows};mkdirSync('backups',{recursive:true});const file=`backups/studio-${Date.now()}.json`;writeFileSync(file,JSON.stringify(out),{mode:0o600});console.log(`백업 저장: ${file}. 암호화 키는 별도 안전한 장소에 보관하세요.`);}finally{await db.close();}
