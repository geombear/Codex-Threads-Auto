import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,connect} from '../server/store.js';
import {Engine} from '../server/engine.js';
import {accountSchema,defaultSettings,Post,Account,Topic,stamp,id} from '../server/domain.js';
import {migrateGenerationLimits} from '../server/migrations.js';

test('legacy default limits migrate once and preserve other configured values',async()=>{
 const store=new Store(await connect(true));try{
  await store.put('settings','main',{...defaultSettings,dailyCalls:30});
  await store.put('accounts','old',{id:'old',dailyCalls:12});await store.put('accounts','custom',{id:'custom',dailyCalls:19});
  await migrateGenerationLimits(store);assert.equal((await store.get<any>('settings','main')).dailyCalls,300);
  assert.equal((await store.get<any>('accounts','old')).dailyCalls,50);assert.equal((await store.get<any>('accounts','custom')).dailyCalls,19);
  await store.put('settings','main',{...defaultSettings,dailyCalls:30});await migrateGenerationLimits(store);assert.equal((await store.get<any>('settings','main')).dailyCalls,30);
 }finally{await store.db.close();}
});
test('rewrite preserves slot and old version, clears approval and refuses unsafe state',async()=>{
 const store=new Store(await connect(true)),engine=new Engine(store),oldFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
 const a:Account={...accountSchema.parse({name:'a'}),id:id(),profileId:'GEOM',createdAt:stamp()};
 const topic:Topic={id:id(),accountId:a.id,title:'메모',evidence:'',verified:false,source:'',expiresAt:'',active:true,priority:1,uses:1};
 const p:Post={id:id(),accountId:a.id,date:'2026-10-10',slot:0,scheduledAt:'2026-10-10T00:00:00Z',kind:'everyday',body:'처음 작성한 글',replies:[],topicId:topic.id,evidence:[],status:'review',issues:[],version:1,steps:[],createdAt:stamp(),updatedAt:stamp(),provider:'test',simulated:true,writingStyle:'question',approvedHash:'old'};
 let calls=0,fail=false,seenPrompt:any;
 process.env.GEMINI_API_KEY='rewrite-mock-key';
 globalThis.fetch=async(_url,init)=>{
  if(!init?.method)return Response.json({models:[{name:'models/gemini-9-flash',supportedGenerationMethods:['generateContent']}]});
  calls++;if(fail)return new Response('',{status:401});seenPrompt=JSON.parse(JSON.parse(String(init.body)).contents[0].parts[0].text);
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({body:'떠오른 생각을 붙잡으려고 메모 앱을 켰는데 제목부터 고민하게 되지. 첫 줄을 예쁘게 쓰려다 정작 남기고 싶던 말이 멀어지는 느낌. 제목 자리는 비워 두고 지금 떠오르는 단어부터 적어봐. 메모는 남에게 보여줄 표지가 없어도 되니까.',reply:''})}]}}]});
 };
 try{
  await store.put('accounts',a.id,a);await store.put('topics',topic.id,topic);await store.reservePost(p);
  await assert.rejects(engine.rewrite(p.id,'KYU'),/프로필/);assert.equal(calls,0);
  const out=await engine.rewrite(p.id,'GEOM','질문으로 끝내지 마');assert.equal(out.version,2);assert.equal(out.rewriteCount,1);assert.equal(out.status,'review');assert.equal(out.approvedHash,undefined);assert.notEqual(out.writingStyle,'question');
  assert.equal(out.scheduledAt,p.scheduledAt);assert.equal(out.slot,p.slot);assert.equal((await store.list<any>('versions'))[0].body,p.body);
  assert.equal((await store.db.query('SELECT * FROM slots')).rows.length,1);assert.equal((await store.list<any>('usage'))[0].kind,'rewrite');assert.equal(seenPrompt.previousDraft,p.body);assert.equal(seenPrompt.rewriteRequest,'질문으로 끝내지 마');
  fail=true;await assert.rejects(engine.rewrite(p.id,'GEOM'));assert.equal((await store.get<Post>('posts',p.id))?.body,out.body);assert.equal((await store.get<Post>('posts',p.id))?.rewriteCount,1);
  fail=false;await assert.rejects(engine.rewrite(p.id,'GEOM'),/너무 비슷/);assert.equal((await store.get<Post>('posts',p.id))?.version,2);
  out.rewriteCount=5;await store.put('posts',p.id,out);const before=calls;await assert.rejects(engine.rewrite(p.id,'GEOM'),/5회/);assert.equal(calls,before);
  out.rewriteCount=0;out.steps=[{key:'x',text:'posted',status:'complete',attempts:1,postId:'published'}];await store.put('posts',p.id,out);await assert.rejects(engine.rewrite(p.id,'GEOM'),/게시 전/);assert.equal(calls,before);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;await store.db.close();}
});
