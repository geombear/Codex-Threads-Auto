import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
test('실제 HTTP: 최초 설정·인증·계정·등록·승인·동일 출처 보호',async()=>{
 const url='http://127.0.0.1:4317';const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,DATA_DIR:mkdtempSync(join(tmpdir(),'thread-studio-test-')),PORT:'4317',APP_URL:url,ALLOW_LIVE_PUBLISH:'false'},stdio:['ignore','pipe','pipe']});
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('서버 시작 시간 초과')),30000);child.stdout.on('data',s=>{if(String(s).includes('Threads Studio:')){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(Error('서버 종료 '+code));});});
 const anon=await fetch(url+'/api/state');assert.equal(anon.status,401);
 const cross=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example'},body:JSON.stringify({password:'invalid-origin-password'})});assert.equal(cross.status,403);
 const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({password:randomBytes(24).toString('hex')})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
 async function post(path:string,body:unknown){const r=await fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,Cookie:cookie},body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();}
 const a=await post('accounts',{name:'통합시험 계정'});assert.ok(a.id);assert.equal(a.auto,false);assert.equal(a.connected,false);
 const imported=await post('import',{accountId:a.id,date:'2026-10-02',items:[{body:'책상에 빈 공간을 조금 남겨 두면 어떨까요.',replies:[]}]});assert.equal(imported.count,1);
 const duplicate=await post('import',{accountId:a.id,date:'2026-10-02',items:[{body:'중복 슬롯',replies:[]}]});assert.equal(duplicate.count,0);
 let state=await (await fetch(url+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.topics.length,20);assert.equal(state.posts.length,1);assert.equal(state.settings.stopped,true);
 await post(`posts/${state.posts[0].id}/action`,{action:'approve'});state=await (await fetch(url+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.posts[0].status,'scheduled');assert.ok(state.posts[0].approvedHash);assert.equal(state.liveEnabled,false);
 }finally{child.kill();}
});
