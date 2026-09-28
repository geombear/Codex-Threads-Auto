import { z } from 'zod';
import { DateTime } from 'luxon';
import { createHash, randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const stamp = () => new Date().toISOString();
export const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const accountSchema = z.object({
  name:z.string().min(1).max(80), theme:z.string().max(2000).default('생활 속 작은 관찰'),
  audience:z.string().max(1000).default('일상을 편하게 만들고 싶은 사람'),
  tone:z.string().max(3000).default('친구에게 이야기하듯 자연스러운 존댓말'),
  facts:z.string().max(10000).default(''), banned:z.string().max(2000).default('무조건,역대급,최저가,품절 임박'),
  timezone:z.string().refine(v=>DateTime.now().setZone(v).isValid,'시간대를 확인하세요.').default('Asia/Seoul'),
  times:z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).length(3).refine(v=>new Set(v).size===3).default(['08:00','12:30','21:30']),
  everydayRatio:z.number().int().min(1).max(20).default(2), affiliateRatio:z.number().int().min(0).max(10).default(1),
  warmupDays:z.number().int().min(0).max(90).default(0), productInterval:z.number().int().min(1).max(365).default(14),
  auto:z.boolean().default(false), paused:z.boolean().default(false), live:z.boolean().default(false),
  fallbackEveryday:z.boolean().default(true), dailyCalls:z.number().int().min(0).max(500).default(12),
  graceMinutes:z.number().int().min(1).max(120).default(30),
});
export type Account = z.infer<typeof accountSchema> & {id:string; createdAt:string; profileId?:'GEOM'|'KYU'; threadsId?:string; username?:string; token?:string; expiresAt?:string};
export const topicSchema=z.object({accountId:z.string(),title:z.string().min(1).max(200),source:z.string().max(2000).default(''),evidence:z.string().max(10000).default(''),verified:z.boolean().default(false),expiresAt:z.string().default(''),active:z.boolean().default(true),priority:z.number().int().min(1).max(10).default(1)});
export type Topic=z.infer<typeof topicSchema>&{id:string;uses:number;lastUsed?:string};
export const productSchema=z.object({accountId:z.string(),name:z.string().min(1).max(200),program:z.string().min(1).max(200),url:z.string().url(),source:z.string().url(),features:z.string().min(1).max(10000),disclosure:z.string().min(5).max(300),prefix:z.string().min(2).max(200).default('[광고]'),policyUrl:z.string().url(),verified:z.boolean().default(false),verifiedAt:z.string().min(1),validUntil:z.string().min(1),active:z.boolean().default(true),mediaUrl:z.string().default(''),mediaType:z.enum(['TEXT','IMAGE','VIDEO']).default('TEXT'),mediaRights:z.string().max(2000).default(''),alt:z.string().max(1000).default('')});
export type Product=z.infer<typeof productSchema>&{id:string};
export type Status='review'|'blocked'|'scheduled'|'publishing'|'partial'|'complete'|'uncertain'|'held'|'cancelled'|'skipped';
export type Step={key:string; text:string;containerId?:string;postId?:string;permalink?:string;status:'pending'|'creating'|'ready'|'sending'|'complete'|'uncertain';attempts:number};
export type Post={id:string;accountId:string;date:string;slot:number;scheduledAt:string;kind:'everyday'|'affiliate';body:string;replies:string[];topicId?:string;product?:Product;brief?:Record<string,string>;evidence:string[];status:Status;issues:string[];version:number;approvedHash?:string;steps:Step[];createdAt:string;updatedAt:string;provider:string;simulated:boolean;nextAttempt?:string;error?:string};
export const settingsSchema=z.object({geminiModel:z.string().max(100).default(''),openaiModel:z.string().max(100).default(''),fallback:z.boolean().default(false),dailyCalls:z.number().int().min(0).max(2000).default(30),paidAllowed:z.boolean().default(false),maxCallUsd:z.number().min(0).max(100).default(0),monthlyUsd:z.number().min(0).max(1000).default(0),stopped:z.boolean().default(true),appId:z.string().max(100).default('')});
export type Settings=z.infer<typeof settingsSchema>&{geminiKey?:string;openaiKey?:string;appSecret?:string};
export const defaultSettings=settingsSchema.parse({});
export const starterTopics=['아침 준비를 가볍게','책상 위 정리','잠깐 쉬는 시간','출근길의 작은 관찰','주말의 느린 시작','장을 보기 전 확인','물건을 고르는 기준','디지털 파일 정리','집중하기 좋은 환경','저녁 루틴','비 오는 날의 준비','가방 속 꼭 필요한 것','약속 전 여유','혼자 보내는 시간','작은 공간 활용','메모하는 습관','산책하며 보는 풍경','필요한 것과 갖고 싶은 것','하루를 마무리하는 질문','다음 주를 위한 준비'];
export function slotTime(a:Account,date:string,slot:number){const d=DateTime.fromISO(`${date}T${a.times[slot]}`,{zone:a.timezone});if(!d.isValid)throw Error('예약 날짜가 올바르지 않습니다.');return d.toUTC().toISO()!;}
export function kindAt(a:Account,date:string,slot:number):Post['kind']{const days=Math.floor(DateTime.fromISO(date,{zone:a.timezone}).diff(DateTime.fromISO(a.createdAt).setZone(a.timezone).startOf('day'),'days').days);if(days<a.warmupDays)return 'everyday';return ((Math.max(0,days)*3+slot)%(a.everydayRatio+a.affiliateRatio))<a.everydayRatio?'everyday':'affiliate';}
export function snapshot(p:Post){return digest({accountId:p.accountId,body:p.body,replies:p.replies,product:p.product,evidence:p.evidence,version:p.version});}
export function normalized(s:string){return s.replace(/\[광고\]/g,'').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();}
export function similar(a:string,b:string){const n=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));const x=n(normalized(a)),y=n(normalized(b));return [...x].filter(v=>y.has(v)).length/Math.max(1,new Set([...x,...y]).size);}
export function safePublicUrl(s:string){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(u.hostname)&&u.hostname.includes('.');}catch{return false;}}
export function validatePost(p:Post,a:Account,others:Post[],now=new Date()):string[]{
 const issues:string[]=[];const all=[p.body,...p.replies].join('\n');
 if(!p.body.trim()||[p.body,...p.replies].some(t=>[...t].length>500))issues.push('본문 또는 답글 길이를 확인하세요(최대 500자).');
 if(p.replies.length>3)issues.push('답글은 최대 3개입니다.');
 if(p.accountId!==a.id)issues.push('계정 정보가 일치하지 않습니다.');
 if(a.banned.split(',').some(w=>w.trim()&&all.includes(w.trim())))issues.push('금지 표현이 포함되어 있습니다.');
 if(/치료|통증|완치|수익 보장|전문가.*추천|의사.*추천/.test(all))issues.push('건강·효능·권위·수익 주장은 별도 검토가 필요합니다.');
 if(/직접 (써|사용|구매)|내가|우리 (아이|남편|아내)|결제했|써봤|사용해봤|어제/.test(all)&&!a.facts.trim())issues.push('확인된 실제 경험이 없습니다.');
 if(/\d+(원|만원|%|시간|분|kg|그램|개월)/.test(all)&&!p.evidence.length)issues.push('숫자 주장의 근거가 없습니다.');
 const recent=others.filter(x=>x.id!==p.id&&!['cancelled','skipped'].includes(x.status));
 if(recent.some(x=>normalized(x.body)===normalized(p.body)||similar(x.body,p.body)>.72))issues.push('기존 글과 내용이 너무 비슷합니다.');
 if(p.kind==='affiliate'){
  const pr=p.product;
  if(!pr||pr.accountId!==a.id)issues.push('이 계정에 등록된 상품이 필요합니다.');
  else{
   if(!pr.active||!pr.verified||!Number.isFinite(Date.parse(pr.validUntil))||Date.parse(pr.validUntil)<now.getTime())issues.push('상품 근거 확인 또는 유효기간 갱신이 필요합니다.');
   if(!p.body.startsWith(pr.prefix)||!pr.prefix.includes('광고'))issues.push('본문 첫 광고 표시가 필요합니다.');
   if(!p.replies.length||!p.replies[0].includes(pr.disclosure)||!p.replies[0].includes(pr.url))issues.push('답글의 고지 또는 등록 링크가 누락되었습니다.');
   if(!safePublicUrl(pr.url)||!safePublicUrl(pr.source)||!safePublicUrl(pr.policyUrl))issues.push('상품·정책 주소는 공개 HTTPS 주소여야 합니다.');
   if(pr.mediaType!=='TEXT'&&(!safePublicUrl(pr.mediaUrl)||!pr.mediaRights.trim()))issues.push('공개 미디어 주소와 사용 권한이 필요합니다.');
   if(recent.some(x=>x.accountId===a.id&&x.product?.id===pr.id&&Math.abs(Date.parse(p.scheduledAt)-Date.parse(x.scheduledAt))<a.productInterval*86400000))issues.push('동일 상품 재소개 간격이 부족합니다.');
   const links=all.match(/https?:\/\/[^\s]+/g)||[];if(links.some(x=>x!==pr.url))issues.push('등록 링크 이외의 URL은 사용할 수 없습니다.');
  }
 }else if(/https?:\/\//.test(all))issues.push('일상글의 임의 URL을 제거하세요.');
 return [...new Set(issues)];
}
