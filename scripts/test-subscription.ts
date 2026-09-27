import {generate} from '../server/providers.js';
import {accountSchema,defaultSettings} from '../server/domain.js';
const a={...accountSchema.parse({name:'구독 연결 시험'}),id:'test',createdAt:new Date().toISOString()};
const result=await generate('openai',defaultSettings,a,{id:'test',accountId:a.id,title:'책상 위 작은 여백',source:'',evidence:'',verified:false,expiresAt:'',active:true,priority:1,uses:0});
console.log(JSON.stringify({ok:true,billing:result.usage.billing,body:result.body,structured:true}));
