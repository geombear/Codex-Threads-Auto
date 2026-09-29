import {DateTime} from 'luxon';
import {Store} from './store.js';
import {Account,Post,Product,Topic,Settings,defaultSettings,id,stamp,kindAt,slotTime,snapshot,validatePost} from './domain.js';
import {generate,Publisher,ThreadsPublisher,MockPublisher,ExternalError} from './providers.js';

export class Engine{
 constructor(public store:Store,private factory?:(a:Account)=>Publisher){}
 async settings():Promise<Settings>{return await this.store.get<Settings>('settings','main')||defaultSettings;}
 async savePost(p:Post){p.updatedAt=stamp();await this.store.put('posts',p.id,p);}
 async approve(p:Post){const a=await this.store.get<Account>('accounts',p.accountId);if(!a)throw Error('계정이 없습니다.');p.issues=validatePost(p,a,await this.store.list<Post>('posts'));if(p.issues.length){p.status='blocked';await this.savePost(p);throw Error(p.issues.join(' / '));}p.approvedHash=snapshot(p);p.status='scheduled';p.steps=[p.body,...p.replies].map((text,i)=>({key:`${p.id}:${p.version}:${i}`,text,status:'pending',attempts:0}));await this.savePost(p);await this.store.log('승인',`${p.id} 버전 ${p.version}`,a.id);}
 async reserveCall(a:Account,provider:string,purpose:'generate'|'rewrite'|'test'='generate',retry=false){const owner=id();if(!await this.store.lock('budget',owner))throw Error('다른 생성 작업을 처리 중입니다. 잠시 후 다시 시도하세요.');try{const s=await this.settings();const day=stamp().slice(0,10),month=day.slice(0,7);const usage=await this.store.list<any>('usage');if(usage.filter(x=>x.day===day).length>=s.dailyCalls||usage.filter(x=>x.day===day&&x.accountId===a.id).length>=a.dailyCalls)throw Error('오늘의 생성 호출 한도입니다. 기존 예약글은 유지됩니다.');const u={id:id(),day,accountId:a.id,provider,purpose,kind:retry?'retry':purpose,reservedUsd:0,at:stamp()};await this.store.put('usage',u.id,u);return u;}finally{await this.store.unlock('budget',owner);}}
 async plan(a:Account,date:string,slots=[0,1,2]){
  const owner=id(),key='generation:'+a.id;
  if(!await this.store.lock(key,owner,1800000))throw Error('이 계정의 글을 생성 중입니다. 완료 후 다시 시도하세요.');
  try{return await this.planSequential(a,date,slots);}finally{await this.store.unlock(key,owner);}
 }
 private async planSequential(a:Account,date:string,slots:number[]){
 const results:Post[]=[];for(const slot of slots){
  const p:Post={id:id(),accountId:a.id,date,slot,scheduledAt:slotTime(a,date,slot),kind:kindAt(a,date,slot),body:'',replies:[],evidence:[],status:'held',issues:[],version:1,steps:[],createdAt:stamp(),updatedAt:stamp(),provider:'',simulated:!a.live};
  if(!await this.store.reservePost(p))continue;
  try{
   const topics=(await this.store.list<Topic>('topics')).filter(t=>t.accountId===a.id&&t.active&&(!t.expiresAt||Date.parse(t.expiresAt)>Date.now())).sort((x,y)=>x.uses/x.priority-y.uses/y.priority);const topic=topics[0];if(!topic)throw Error('사용 가능한 주제가 없습니다. 주제 보관함에 등록하세요.');p.topicId=topic.id;
   const posts=await this.store.list<Post>('posts');
   if(p.kind==='affiliate'){p.product=(await this.store.list<Product>('products')).find(pr=>pr.accountId===a.id&&pr.active&&pr.verified&&Date.parse(pr.validUntil)>Date.parse(p.scheduledAt)&&!posts.some(x=>x.id!==p.id&&x.product?.id===pr.id&&!['cancelled','skipped'].includes(x.status)&&Math.abs(Date.parse(p.scheduledAt)-Date.parse(x.scheduledAt))<a.productInterval*86400000));if(!p.product){if(a.fallbackEveryday)p.kind='everyday';else throw Error('검증된 상품이 부족합니다.');}}
   const generated=await this.createCopy(a,topic,p,posts);
   this.applyCopy(p,generated,topic,a);
   p.issues=validatePost(p,a,posts);p.status=p.issues.length?'blocked':'review';topic.uses++;topic.lastUsed=stamp();await this.store.put('topics',topic.id,topic);await this.savePost(p);if(a.auto&&!p.issues.length)await this.approve(p);
  }catch(e){p.error=(e as Error).message;p.status='held';await this.savePost(p);}results.push(p);
 }return results;}
 async createCopy(a:Account,topic:Topic,p:Post,posts:Post[],feedback='',purpose:'generate'|'rewrite'='generate'){
  const s=await this.settings(),errors:string[]=[];let attempts=0;
  const recent=posts.filter(x=>x.accountId===a.id&&x.body&&x.status!=='cancelled').sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt)).slice(0,12);
  for(const provider of (s.fallback?['gemini','openai']:['gemini']) as ('gemini'|'openai')[]){
   try{let u:Awaited<ReturnType<Engine['reserveCall']>>|undefined;
    const generated=await generate(provider,s,a,topic,p.product,feedback,async()=>{u=await this.reserveCall(a,provider,purpose,attempts++>0);},{store:this.store,recent,previousDraft:purpose==='rewrite'?p.body:''});
    if(u)await this.store.put('usage',u.id,{...u,usage:generated.usage,model:generated.model});
    return generated;
   }catch(e){errors.push((e as Error).message);await this.store.log('생성 오류',provider+': '+(e as Error).message,a.id);}
  }
  throw Error(errors.join(' / '));
 }
 private applyCopy(p:Post,generated:Awaited<ReturnType<Engine['createCopy']>>,topic:Topic,a:Account){
  p.body=(p.product?p.product.prefix+'\n':'')+generated.body;
  p.replies=p.product?[`${p.product.disclosure}\n${generated.reply}\n${p.product.url}`]:generated.reply?[generated.reply]:[];
  p.evidence=[...(topic.verified&&topic.evidence?[topic.evidence]:[]),...(a.facts?[a.facts]:[]),...(p.product?[p.product.features]:[])];
  delete p.brief;p.writingStyle=generated.writingStyle;p.provider=generated.provider+'/'+generated.model;
 }
 async rewrite(postId:string,profileId:string,feedback=''){
  const owner=id(),key='publish:'+postId;
  if(!await this.store.lock(key,owner,600000))throw Error('이 글을 처리 중입니다. 완료 후 다시 시도하세요.');
  let generationKey='';
  try{
   const p=await this.store.get<Post>('posts',postId);if(!p)throw Error('글이 없습니다.');
   const a=await this.store.get<Account>('accounts',p.accountId);if(!a||a.profileId!==profileId)throw Error('선택한 프로필의 글만 다시 쓸 수 있습니다.');
   if(!['review','blocked','held'].includes(p.status)||p.steps.some(s=>s.postId||s.containerId||['sending','creating','uncertain'].includes(s.status))||!p.body&&!p.error)throw Error('게시 전 검토·보류 글만 다시 쓸 수 있습니다. 예약된 글은 먼저 보류하세요.');
   if((p.rewriteCount||0)>=5)throw Error('이 글의 AI 다시쓰기 한도(5회)에 도달했습니다.');
   const lock='generation:'+a.id;if(!await this.store.lock(lock,owner,600000))throw Error('이 계정의 글을 생성 중입니다. 완료 후 다시 시도하세요.');generationKey=lock;
   const topic=p.topicId?await this.store.get<Topic>('topics',p.topicId):undefined;
   if(!topic||topic.accountId!==a.id||!topic.active||topic.expiresAt&&Date.parse(topic.expiresAt)<=Date.now())throw Error('유효한 원래 주제가 필요합니다. 주제 보관함에서 확인하세요.');
   if(p.product){const product=await this.store.get<Product>('products',p.product.id);if(!product||product.accountId!==a.id||!product.active||!product.verified||Date.parse(product.validUntil)<Math.max(Date.now(),Date.parse(p.scheduledAt)))throw Error('상품 근거 또는 유효기간을 확인하세요.');p.product=product;}
   const posts=await this.store.list<Post>('posts');
   const generated=await this.createCopy(a,topic,p,posts,feedback,'rewrite');
   if(!await this.store.owns(key,owner)||!await this.store.owns(generationKey,owner))throw Error('작업 잠금이 만료되었습니다. 기존 글을 유지합니다.');
   const updated={...p};this.applyCopy(updated,generated,topic,a);
   // Reject a near-identical rewrite as well as duplicates of other posts.
   updated.issues=validatePost(updated,a,[...posts.filter(x=>x.id!==p.id),{...p,id:'previous:'+p.id}]);
   if(updated.issues.some(i=>i.includes('너무 비슷')))throw Error('이전 글과 너무 비슷하게 생성되어 기존 글을 유지했습니다. 다른 구성으로 요청해 주세요.');
   await this.store.put('versions',id(),{postId:p.id,version:p.version,body:p.body,replies:p.replies,writingStyle:p.writingStyle,at:stamp()});
   updated.version++;updated.rewriteCount=(p.rewriteCount||0)+1;updated.approvedHash=undefined;updated.steps=[];updated.nextAttempt=undefined;updated.error=undefined;
   updated.status=updated.issues.length?'blocked':'review';await this.savePost(updated);
   await this.store.log('AI 다시쓰기',p.id+' / '+updated.writingStyle,a.id);return updated;
  }finally{if(generationKey)await this.store.unlock(generationKey,owner);await this.store.unlock(key,owner);}
 }
 async guard(a:Account,owner:string,p:Post){if(!await this.store.owns('publish:'+p.id,owner))throw Error('작업 잠금이 만료되어 확인이 필요합니다.');const s=await this.settings(),fresh=await this.store.get<Account>('accounts',a.id);if(s.stopped||!fresh||fresh.paused||fresh.live!==!p.simulated)throw Error('전체 또는 계정 발행이 중지되었습니다.');if(a.live&&(process.env.ALLOW_LIVE_PUBLISH!=='true'||!fresh.token||!fresh.threadsId))throw Error('실제 게시 허용과 계정 연결이 필요합니다.');return fresh;}
 async publish(postId:string,now=new Date()){
 const owner=id(),name='publish:'+postId;if(!await this.store.lock(name,owner,300000))return;
 try{const p=await this.store.get<Post>('posts',postId);if(!p||!['scheduled','partial','publishing'].includes(p.status))return;
 const a=await this.store.get<Account>('accounts',p.accountId);if(!a)return;
 if(p.steps.some(s=>['sending','creating','uncertain'].includes(s.status))){p.status='uncertain';p.error='이전 요청의 결과 확인이 필요합니다. 자동 재전송하지 않습니다.';await this.savePost(p);return;}
 if(!p.steps.some(s=>s.postId)&&now.getTime()-Date.parse(p.scheduledAt)>a.graceMinutes*60000){p.status='skipped';p.error='지연 허용 시간이 지나 건너뛰었습니다.';await this.savePost(p);return;}
 if(p.steps[0]?.postId&&now.getTime()-Date.parse(p.scheduledAt)>86400000){p.status='held';p.error='답글 복구 기한(24시간)이 지났습니다.';await this.savePost(p);return;}
 await this.guard(a,owner,p);
 if(snapshot(p)!==p.approvedHash){p.status='blocked';p.error='승인한 콘텐츠가 변경되었습니다.';await this.savePost(p);return;}
 const issues=validatePost(p,a,await this.store.list<Post>('posts'),now);if(p.product){const current=await this.store.get<Product>('products',p.product.id);if(!current?.active||!current.verified||Date.parse(current.validUntil)<now.getTime())issues.push('상품 근거가 철회되었거나 만료되었습니다.');}
 if(issues.length){p.status='blocked';p.issues=issues;await this.savePost(p);return;}
 const api=this.factory?this.factory(a):a.live?new ThreadsPublisher(a):new MockPublisher();
 p.status='publishing';await this.savePost(p);
 try{await api.quota();for(let i=0;i<p.steps.length;i++){
  const step=p.steps[i];if(step.postId)continue;if(step.attempts>=4)throw Error('최대 재시도 횟수에 도달했습니다.');
  await this.guard(a,owner,p);if(i>0){if(!p.steps[0].postId)throw Error('본문 게시 결과가 없습니다.');await api.post(p.steps[0].postId);}
  if(!step.containerId){step.status='creating';step.attempts++;await this.savePost(p);await this.guard(a,owner,p);step.containerId=await api.create(step.text,i>0?p.steps[0].postId:undefined,i===0?p.product:undefined);step.status='ready';await this.savePost(p);}
  const state=await api.status(step.containerId!);if(state==='IN_PROGRESS'){p.status=i?'partial':'scheduled';p.nextAttempt=new Date(now.getTime()+60000).toISOString();await this.savePost(p);return;}if(state!=='FINISHED')throw Error(`미디어 처리 상태 ${state}: 확인이 필요합니다.`);
  await this.guard(a,owner,p);step.status='sending';await this.savePost(p);const out=await api.publish(step.containerId!);step.postId=out.id;step.status='complete';await this.savePost(p);await this.store.log(p.simulated?'모의 게시':'실제 게시',`${p.id} / ${i===0?'본문':'답글 '+i} / ${out.id}`,a.id);
  try{step.permalink=(await api.post(out.id)).permalink;await this.savePost(p);}catch{/* 게시 ID 저장 이후 조회 실패는 재게시 사유가 아니다. */}
 }
 p.status='complete';p.error=undefined;await this.savePost(p);
 }catch(e){const err=e as Error;const step=p.steps.find(x=>!x.postId);if(step?.status==='sending'&&(!(e instanceof ExternalError)||e.uncertain)){step.status='uncertain';p.status='uncertain';}
 else if(step?.status==='creating'&&e instanceof ExternalError&&e.uncertain){step.status='uncertain';p.status='uncertain';}
 else{if(step){step.status=step.containerId?'ready':'pending';step.attempts++;}p.status=e instanceof ExternalError&&[429,500,502,503].includes(e.code)&&(!step||step.attempts<4)?(p.steps[0]?.postId?'partial':'scheduled'):'held';}
 if(e instanceof ExternalError&&[401,403].includes(e.code)){a.paused=true;await this.store.put('accounts',a.id,a);}p.error=err.message;p.nextAttempt=new Date(now.getTime()+60000*Math.pow(2,step?.attempts||1)).toISOString();await this.savePost(p);await this.store.log('발행 보류',`${p.id}: ${err.message}`,a.id);}
 }finally{await this.store.unlock(name,owner);}
 }
 private ticking=false;
 async tick(){if(this.ticking)return;this.ticking=true;try{const s=await this.settings();if(s.stopped)return;const accounts=await this.store.list<Account>('accounts');for(const a of accounts.filter(a=>!a.paused)){
 try{const posts=(await this.store.list<Post>('posts')).filter(p=>p.accountId===a.id&&['scheduled','partial','publishing'].includes(p.status)&&Date.parse(p.scheduledAt)<=Date.now()&&(!p.nextAttempt||Date.parse(p.nextAttempt)<=Date.now()));for(const p of posts)await this.publish(p.id);if(a.auto){const tomorrow=DateTime.now().setZone(a.timezone).plus({days:1}).toISODate()!;await this.plan(a,tomorrow);}}catch(e){await this.store.log('작업 오류',(e as Error).message,a.id);}
 }}finally{this.ticking=false;}}
}
