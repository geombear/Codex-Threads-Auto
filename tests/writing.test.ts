import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseWritingStyle,writingStyles,writingPrompt} from '../server/writing.js';
import {accountSchema,Post} from '../server/domain.js';

test('style rotation avoids the last two and balances a full cycle',()=>{
 const recent:{writingStyle:string}[]=[];
 for(let i=0;i<24;i++){const style=chooseWritingStyle(recent,()=>0);assert.ok(!recent.slice(0,2).some(p=>p.writingStyle===style.id));recent.unshift({writingStyle:style.id});if(i===7)assert.equal(new Set(recent.map(p=>p.writingStyle)).size,8);}
});
test('prompt includes recent structures, rewrite feedback and only verified evidence',()=>{
 const a={...accountSchema.parse({name:'a'}),id:'a',createdAt:''};
 const t={id:'t',accountId:'a',title:'생활',source:'https://example.com',evidence:'확인하지 않은 주장',verified:false,expiresAt:'',active:true,priority:1,uses:0};
 const recent=Array.from({length:8},(_,i)=>({body:'이전 글 '+i,writingStyle:'note'} as Post));
 const p=JSON.parse(writingPrompt(a,t,undefined,writingStyles[0],recent,'대화로 시작','기존 초안'));
 assert.equal(p.topic.verifiedEvidence,'');assert.equal(p.recentPosts.length,4);assert.equal(p.previousDraft,'기존 초안');assert.equal(p.rewriteRequest,'대화로 시작');assert.equal(p.writingStyle.id,'dialogue');assert.equal(p.brief,undefined);
});
