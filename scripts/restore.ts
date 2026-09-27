import {readFileSync} from 'node:fs';
import {connect,Store} from '../server/store.js';
import {defaultSettings,id,stamp} from '../server/domain.js';
try{process.loadEnvFile('.env');}catch{}
const file=process.argv[2];if(!file)throw Error('사용법: npm run restore -- backups/파일.json');
const backup=JSON.parse(readFileSync(file,'utf8'));if(backup.version!==1||!Array.isArray(backup.records)||!Array.isArray(backup.slots))throw Error('지원하지 않는 백업 파일입니다.');
const db=await connect(),store=new Store(db);
try{if((await db.query('SELECT id FROM records LIMIT 1')).rows.length)throw Error('빈 저장소에만 복원할 수 있습니다. 기존 data 폴더를 먼저 별도 보관하세요.');for(const r of backup.records){if(['oauth'].includes(r.kind))continue;const data=r.data;if(r.kind==='settings'){data.stopped=true;}if(r.kind==='accounts'){data.paused=true;data.auto=false;}if(r.kind==='posts'&&!['cancelled','skipped','complete'].includes(data.status)){data.status='uncertain';data.error='백업 복원 이후 외부 게시 이력을 대조해야 합니다. 재전송이 차단되었습니다.';}await store.put(r.kind,r.id,data);}if(!await store.get('settings','main'))await store.put('settings','main',defaultSettings);for(const s of backup.slots)await store.reserve(s.account,s.day,s.slot,s.post);for(const a of backup.audit||[])await db.query('INSERT INTO audit VALUES($1,$2,$3,$4,$5)',[a.id,a.at,a.account,a.event,a.detail]);await store.log('백업 복원',`백업 시각 ${backup.at}. 전체·계정 중지 및 미완료 결과 확인 상태로 복원.`);console.log('복원 완료. 외부 이력 확인 전 자동 발행을 재개하지 마세요.');}finally{await db.close();}
