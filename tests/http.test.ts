import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
test('실제 HTTP: 최초 설정·인증·계정·등록·승인·동일 출처 보호',async()=>{
 const port=20000+Math.floor(Math.random()*30000),url='http://127.0.0.1:'+port;const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,GEMINI_API_KEY:'http-shared-test-key',DATA_DIR:mkdtempSync(join(tmpdir(),'thread-studio-test-')),PORT:String(port),APP_URL:url,ALLOW_LIVE_PUBLISH:'false'},stdio:['ignore','pipe','pipe']});
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('서버 시작 시간 초과')),30000);child.stdout.on('data',s=>{if(String(s).includes('Threads Studio:')){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(Error('서버 종료 '+code));});});
 const anon=await fetch(url+'/api/state');assert.equal(anon.status,401,await anon.text());
 const cross=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example'},body:JSON.stringify({password:'invalid-origin-password'})});assert.equal(cross.status,403);
 const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({profileId:'GEOM',pin:'0000'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
 async function post(path:string,body:unknown){const r=await fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,Cookie:cookie,'X-Profile-Id':'GEOM'},body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();}
 const a=await post('accounts',{name:'통합시험 계정'});assert.ok(a.id);assert.equal(a.auto,false);assert.equal(a.connected,false);
 const imported=await post('import',{accountId:a.id,date:'2026-10-02',items:[{body:'책상에 빈 공간을 조금 남겨 두면 어떨까요.',replies:[]}]});assert.equal(imported.count,1);
 const duplicate=await post('import',{accountId:a.id,date:'2026-10-02',items:[{body:'중복 슬롯',replies:[]}]});assert.equal(duplicate.count,0);
 let state=await (await fetch(url+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.topics.length,20);assert.equal(state.posts.length,1);assert.equal(state.settings.stopped,true);assert.equal(state.settings.hasGemini,true);assert.equal(state.settings.geminiKeySource,'env');assert.equal(state.settings.geminiModel,'auto');assert.equal(JSON.stringify(state).includes('http-shared-test-key'),false);
 await post(`posts/${state.posts[0].id}/action`,{action:'approve'});state=await (await fetch(url+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.posts[0].status,'scheduled');assert.ok(state.posts[0].approvedHash);assert.equal(state.liveEnabled,false);
 const loginK=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({profileId:'KYU',pin:'0000'})});assert.equal(loginK.status,200);const cookieK=loginK.headers.get('set-cookie')!.split(';')[0];
 const callK=(path:string,body:unknown,profile='KYU')=>fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,Cookie:cookieK,'X-Profile-Id':profile},body:JSON.stringify(body)});
 const denied=await callK('accounts',{id:a.id,name:'계정 탈취 시도'});assert.equal(denied.status,400);
 const deniedPost=await callK(`posts/${state.posts[0].id}/action`,{action:'cancel'});assert.equal(deniedPost.status,400);
 const wrongTab=await callK('accounts',{name:'이전 탭 요청'},'GEOM');assert.equal(wrongTab.status,409);
 const createdK=await callK('accounts',{name:'KYU 게시 계정',profileId:'GEOM'});assert.equal(createdK.status,200);assert.equal((await createdK.json()).profileId,'KYU');
 const shared=await (await fetch(url+'/api/state',{headers:{Cookie:cookieK}})).json();assert.equal(shared.settings.hasGemini,true);assert.equal(shared.settings.geminiKeySource,'env');assert.equal(JSON.stringify(shared).includes('http-shared-test-key'),false);assert.equal(shared.posts.length,1);assert.equal(shared.accounts.length,2);assert.equal(shared.posts[0].accountId,a.id);assert.equal(shared.posts[0].status,'scheduled');
 const badPin=await callK('profile/pin',{currentPin:'0000',newPin:'abcd'});assert.equal(badPin.status,400);
 const changed=await callK('profile/pin',{currentPin:'0000',newPin:'1357'});assert.equal(changed.status,200);
 const oldPin=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({profileId:'KYU',pin:'0000'})});assert.equal(oldPin.status,401);
 const newPin=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({profileId:'KYU',pin:'1357'})});assert.equal(newPin.status,200);
 const geomStill=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({profileId:'GEOM',pin:'0000'})});assert.equal(geomStill.status,200);
 }finally{child.kill();}
});
