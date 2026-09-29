import {Store} from './store.js';
import {Account,Settings,defaultSettings,stamp} from './domain.js';

export async function migrateGenerationLimits(store:Store){
 if(await store.get('migrations','short-writing-v1'))return;
 const s=await store.get<Settings>('settings','main');
 if(!s)await store.put('settings','main',defaultSettings);
 else if(s.dailyCalls===30)await store.put('settings','main',{...s,dailyCalls:300});
 for(const a of await store.list<Account>('accounts'))if(a.dailyCalls===12)await store.put('accounts',a.id,{...a,dailyCalls:50});
 await store.put('migrations','short-writing-v1',{at:stamp()});
}
