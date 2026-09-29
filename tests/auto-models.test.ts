import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate,geminiKey,rankModels,generatedSchema,shortThinking} from '../server/providers.js';
import {accountSchema,defaultSettings} from '../server/domain.js';
import {Store,connect} from '../server/store.js';
const value={body:'책상에 물건이 늘면 정리함부터 찾게 되지. 그런데 빈 상자 하나를 올려두고 오늘 안 쓸 물건만 잠깐 옮겨봐. 컵과 메모장 자리가 드러나면 무엇을 남길지도 고르기 쉬워져. 정리의 시작이 꼭 새 물건일 필요는 없잖아.',reply:''};
const a={...accountSchema.parse({name:'test'}),id:'test',createdAt:''};
const t={id:'topic',accountId:'test',title:'정리',source:'',evidence:'',verified:false,expiresAt:'',active:true,priority:1,uses:0};
test('stable text ranking prefers regular Flash and handles new versions',()=>{
 assert.deepEqual(rankModels(['gemini-9-pro','gemini-8-flash','gemini-10-flash','gemini-10-flash-preview','gemini-10-flash-image','gemini-10-flash-lite','gemini-10-flash','embedding-1']),['gemini-10-flash','gemini-8-flash','gemini-10-flash-lite','gemini-9-pro']);
});
for(const failure of [404,410,'model400','bad400','invalid',401,'budget'] as const)test(`generation recovery: ${failure}`,async()=>{
 const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-'+failure;let posts=0,reserved=0,lists=0;const used:string[]=[];
 globalThis.fetch=async(url,init)=>{
  assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'mock-'+failure);
  if(!init?.method){lists++;return Response.json({models:['gemini-10-flash','gemini-9-flash'].map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))});}
  used.push(String(url));posts++;const payload=JSON.parse(String(init.body));
  assert.equal(payload.generationConfig.maxOutputTokens,1024);assert.deepEqual(payload.generationConfig.responseJsonSchema.required,['body','reply']);
  if(posts===1){
   if(failure==='invalid')return Response.json({candidates:[{content:{parts:[{text:'bad json'}]}}]});
   if(failure==='model400')return Response.json({error:{message:'model does not support responseJsonSchema'}},{status:400});
   if(failure==='bad400')return Response.json({error:{message:'Invalid API key'}},{status:400});
   if(typeof failure==='number')return new Response('',{status:failure});
  }
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
 };
 try{
  assert.equal(geminiKey({...defaultSettings,geminiKey:'invalid-old-key'}),'mock-'+failure);
  const result=generate('gemini',defaultSettings,a,t,undefined,'',async()=>{reserved++;if(failure==='budget')throw Error('budget');});
  if(failure===401||failure==='bad400'){await assert.rejects(result,{code:failure===401?401:400});assert.equal(posts,1);assert.equal(lists,1);}
  else if(failure==='budget'){await assert.rejects(result,/budget/);assert.equal(posts,0);}
  else{const out=await result;assert.equal(out.model,failure==='invalid'?'gemini-10-flash':'gemini-9-flash');assert.equal(posts,2);assert.equal(reserved,2);assert.equal(lists,failure==='invalid'?1:2);
   await generate('gemini',defaultSettings,a,t);assert.equal(posts,3);assert.equal(used[1],used[2]);assert.equal(lists,failure==='invalid'?1:2);
  }
 }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});
test('selected model survives store recreation; new credentials rediscover',async()=>{
 const store=new Store(await connect(true)),original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;let lists=0;
 process.env.GEMINI_API_KEY='persistent-mock';
 globalThis.fetch=async(_url,init)=>!init?.method?(lists++,Response.json({models:[{name:'models/gemini-9-flash',supportedGenerationMethods:['generateContent']}]})):Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
 try{await generate('gemini',defaultSettings,a,t,undefined,'',async()=>{},{store});await generate('gemini',defaultSettings,a,t,undefined,'',async()=>{},{store:new Store(store.db)});assert.equal(lists,1);
  process.env.GEMINI_API_KEY='different-mock';await generate('gemini',defaultSettings,a,t,undefined,'',async()=>{},{store});assert.equal(lists,2);
  assert.equal(JSON.stringify(await store.list('ai-models')).includes('persistent-mock'),false);
 }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;await store.db.close();}
});
test('short output validates code points and optional empty reply',()=>{
 assert.equal(generatedSchema.safeParse({body:'가'.repeat(80),reply:''}).success,true);
 assert.equal(generatedSchema.safeParse({body:'가'.repeat(221),reply:''}).success,false);
 assert.equal(generatedSchema.safeParse({body:'🙂'.repeat(150),reply:''}).success,true);
 assert.equal(generatedSchema.safeParse({body:'짧다',reply:''}).success,false);
});
test('thinking controls match known model families only',()=>{
 assert.deepEqual(shortThinking('gemini-2.5-flash'),{thinkingConfig:{thinkingBudget:0}});
 assert.deepEqual(shortThinking('gemini-2.5-pro'),{thinkingConfig:{thinkingBudget:128}});
 assert.deepEqual(shortThinking('gemini-3.8-flash'),{thinkingConfig:{thinkingLevel:'low'}});
 assert.deepEqual(shortThinking('gemini-10-flash'),{});
});

