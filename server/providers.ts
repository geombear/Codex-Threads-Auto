import { z } from 'zod';
import type {Account,Topic,Product,Settings,Post} from './domain.js';
import {digest} from './domain.js';
import type {Store} from './store.js';
import { unseal } from './security.js';
import {subscriptionGenerate,subscriptionStatus} from './subscription.js';
import {chooseWritingStyle,writingInstruction,writingPrompt} from './writing.js';
export class ExternalError extends Error{constructor(public code:number,public uncertain=false,public modelIssue=false){super(code===401||code===403?'인증 또는 권한을 확인하세요.':code===503?'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도하세요.':code===429?'외부 서비스 호출 한도에 도달했습니다.':code===404?'모델 또는 외부 리소스를 찾을 수 없습니다. 설정에서 연결 시험을 실행하세요.':`외부 서비스 응답 오류 (${code}).`);}}
export async function request(url:string,init:RequestInit={}){
 let r:Response;try{r=await fetch(url,{...init,signal:AbortSignal.timeout(45000),redirect:'error'});}catch{throw new ExternalError(0,true);}
 if(!r.ok){let message='';try{message=(await r.json()).error?.message||'';}catch{}
  throw new ExternalError(r.status,r.status>=500,r.status===400&&/(model|response.?json.?schema|response.?mime|thinking|not supported)/i.test(message));
 }try{return await r.json();}catch{throw new ExternalError(0,true);}
}
class InvalidGeneration extends Error{constructor(){super('AI 응답 형식 또는 글자 수가 맞지 않습니다. 다시쓰기로 재시도할 수 있습니다.');}}
// Only generation is retried. Publishing still uses one request per operation.
export async function retryGeneration<T>(attempt:()=>Promise<T>,beforeAttempt:()=>Promise<void>,sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<T>{
 for(let n=0;;n++){await beforeAttempt();try{return await attempt();}catch(e){
  if(n>=1||!(e instanceof InvalidGeneration||e instanceof ExternalError&&[429,500,502,503,504].includes(e.code)))throw e;
  await sleep(1000);
 }}
}
const charLength=(s:string)=>[...s].length;
export const generatedSchema=z.object({body:z.string().refine(s=>charLength(s.trim())>=80&&charLength(s.trim())<=220),reply:z.string().refine(s=>charLength(s)<=100)});
const jsonSchema={type:'object',additionalProperties:false,required:['body','reply'],properties:{body:{type:'string',minLength:80,maxLength:220},reply:{type:'string',maxLength:100}}};
const probeSchema={type:'object',additionalProperties:false,required:['body','reply'],properties:{body:{type:'string'},reply:{type:'string'}}};
export function geminiKey(s:Settings){return process.env.GEMINI_API_KEY?.trim()||unseal(s.geminiKey);}
// Model-specific controls: a small output cap alone does not reduce thinking time.
export function shortThinking(model:string){
 if(/^gemini-2\.5-flash(?:-|$)/.test(model))return {thinkingConfig:{thinkingBudget:0}};
 if(/^gemini-2\.5-pro(?:-|$)/.test(model))return {thinkingConfig:{thinkingBudget:128}};
 if(/^gemini-3(?:\.|-)/.test(model))return {thinkingConfig:{thinkingLevel:'low'}};
 return {};
}
export function rankModels(names:string[]){return [...new Set(names)].filter(n=>/^gemini-\d[\w.-]+$/.test(n)&&/(flash|pro)/i.test(n)&&!/(preview|experimental|exp|image|audio|tts|live|robot|embedding|latest)/i.test(n)).sort((a,b)=>Number(!/flash/.test(a))-Number(!/flash/.test(b))||Number(/lite/.test(a))-Number(/lite/.test(b))||b.localeCompare(a,undefined,{numeric:true}));}
export async function models(provider:'gemini'|'openai',s:Settings):Promise<string[]>{
 if(provider==='openai'){await subscriptionStatus();return ['자동 선택 (Codex 기본 모델)'];}
 const key=geminiKey(s);if(!key)throw Error('.env의 GEMINI_API_KEY 또는 공통 설정에 Gemini API 키를 저장하세요.');
 const names:string[]=[];let page='';const seen=new Set<string>();
 do{const r=await request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),{headers:{'x-goog-api-key':key}});
 names.push(...(r.models||[]).filter((m:any)=>m.supportedGenerationMethods?.includes('generateContent')&&typeof m.name==='string').map((m:any)=>m.name.replace('models/','')));
 page=r.nextPageToken||'';if(page&&seen.has(page))throw Error('모델 목록 페이지가 반복됩니다.');seen.add(page);
 }while(page);
 return rankModels(names);
}
const selectedModels=new Map<string,string>();
const selectionFlights=new Map<string,Promise<string>>();
async function selectModel(s:Settings,keyId:string,store?:Store,failed?:string){
 if(!failed){const cached=store?(await store.get<{model:string}>('ai-models',keyId))?.model:selectedModels.get(keyId);if(cached&&/^gemini-[\w.-]+$/.test(cached))return cached;}
 const flightKey=keyId+':'+(failed||'initial');
 let flight=selectionFlights.get(flightKey);
 if(!flight){flight=(async()=>{const selected=(await models('gemini',s)).find(m=>m!==failed);if(!selected)throw Error('사용 가능한 대체 Gemini 텍스트 모델이 없습니다.');return selected;})();selectionFlights.set(flightKey,flight);}
 try{return await flight;}finally{selectionFlights.delete(flightKey);}
}
export type GenerationOptions={store?:Store;recent?:Post[];previousDraft?:string;test?:boolean};
export async function generate(provider:'gemini'|'openai',s:Settings,a:Account,t:Topic,product?:Product,feedback='',beforeAttempt:()=>Promise<void>=async()=>{},options:GenerationOptions={}){
 const key=provider==='gemini'?geminiKey(s):'',keyId=digest(key);let model='auto';
 if(provider==='gemini'&&!key)throw Error('.env에 GEMINI_API_KEY를 입력하세요.');
 const style=chooseWritingStyle(options.recent||[]);
 const instruction=options.test?'연결 시험이다. {"body":"연결 확인","reply":""}만 출력한다.':writingInstruction;
 const prompt=options.test?'연결 확인':writingPrompt(a,t,product,style,options.recent||[],feedback,options.previousDraft);
 const schema=options.test?probeSchema:jsonSchema;
 const parse=(raw:string)=>{try{const value=JSON.parse(raw);if(options.test){if(value.body!=='연결 확인'||value.reply!=='')throw Error();return {body:value.body as string,reply:''};}const value2=generatedSchema.parse(value);return {...value2,body:value2.body.trim()};}catch{throw new InvalidGeneration();}};
 let value:{body:string;reply:string},usage:any;
 if(provider==='gemini'){
  model=await selectModel(s,keyId,options.store);
  const attempt=async()=>{const r=await request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:1024,...shortThinking(model)}})});
   const result=parse(r.candidates?.[0]?.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('')||'');usage=r.usageMetadata;return result;
  };
  try{value=await retryGeneration(attempt,beforeAttempt);}catch(e){
   if(!(e instanceof ExternalError&&([404,410].includes(e.code)||e.modelIssue)))throw e;
   if(options.store)await options.store.remove('ai-models',keyId);selectedModels.delete(keyId);
   model=await selectModel(s,keyId,options.store,model);
   value=await retryGeneration(attempt,beforeAttempt);
  }
  if(options.store)await options.store.put('ai-models',keyId,{model});else selectedModels.set(keyId,model);
 }else{await beforeAttempt();value=parse(await subscriptionGenerate(instruction+'\n'+prompt,schema,''));usage={billing:'chatgpt-subscription'};}
 return {...value,usage,provider,model,writingStyle:style.id};
}
export interface Publisher{create(text:string,parent?:string,product?:Product):Promise<string>;status(container:string):Promise<string>;publish(container:string):Promise<{id:string}>;post(id:string):Promise<{id:string;text?:string;username?:string;permalink?:string}>;quota():Promise<void>}
export class ThreadsPublisher implements Publisher{
 constructor(private a:Account){}
 private async api(path:string,params:Record<string,string>={},post=false){const q=new URLSearchParams({...params,access_token:unseal(this.a.token)});return request(`https://graph.threads.net/v1.0/${path}${post?'':'?'+q}`,post?{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:q}:{});}
 async create(text:string,parent?:string,product?:Product){const p:Record<string,string>={media_type:product?.mediaType||'TEXT',text};if(parent)p.reply_to_id=parent;if(product?.mediaType==='IMAGE'){p.image_url=product.mediaUrl;p.alt_text=product.alt;}if(product?.mediaType==='VIDEO')p.video_url=product.mediaUrl;const r=await this.api(`${this.a.threadsId}/threads`,p,true);if(!r.id)throw new ExternalError(0,true);return r.id;}
 async status(c:string){const r=await this.api(c,{fields:'status,error_message'});return r.status;}
 async publish(c:string){const r=await this.api(`${this.a.threadsId}/threads_publish`,{creation_id:c},true);if(!r.id)throw new ExternalError(0,true);return {id:r.id};}
 async post(p:string){return this.api(p,{fields:'id,text,username,permalink'});}
 async quota(){const r=await this.api(`${this.a.threadsId}/threads_publishing_limit`,{fields:'quota_usage,config,reply_quota_usage,reply_config'});for(const x of r.data||[]){if(x.config?.quota_total!=null&&x.quota_usage>=x.config.quota_total)throw new ExternalError(429);if(x.reply_config?.quota_total!=null&&x.reply_quota_usage>=x.reply_config.quota_total)throw new ExternalError(429);}}
}
export class MockPublisher implements Publisher{
 calls:string[]=[];failAt=0;loseResponse=false;count=0;
 async create(text:string,parent?:string){this.calls.push(`create:${parent||'body'}:${text}`);return 'mock-container-'+(++this.count);}
 async status(){return 'FINISHED';}
 async publish(c:string){this.calls.push('publish:'+c);if(this.failAt&&this.calls.filter(x=>x.startsWith('publish:')).length===this.failAt)throw new ExternalError(429);if(this.loseResponse)throw new ExternalError(0,true);return {id:c.replace('container','post')};}
 async post(p:string){return {id:p};}async quota(){}
}
