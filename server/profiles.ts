import {Store} from './store.js';
import {passwordHash,passwordOK} from './security.js';
import {Account,stamp} from './domain.js';
export const profileNames=['GEOM','KYU'] as const;
export type ProfileName=typeof profileNames[number];
type Profile={id:ProfileName;hash:string;failures:number;lockedUntil:number};
export async function initializeProfiles(store:Store){
 for(const name of profileNames)if(!await store.get('profiles',name))await store.put('profiles',name,{id:name,hash:passwordHash('0000'),failures:0,lockedUntil:0});
 for(const a of await store.list<Account>('accounts'))if(!a.profileId)await store.put('accounts',a.id,{...a,profileId:'GEOM'});
}
export async function verifyPin(store:Store,name:ProfileName,pin:string){
 const p=await store.get<Profile>('profiles',name);if(!p)throw Error('프로필이 없습니다.');
 if(p.lockedUntil>Date.now())throw Error('PIN 입력이 잠겼습니다. 5분 후 다시 시도하세요.');
 if(!passwordOK(pin,p.hash)){p.failures++;if(p.failures>=5){p.lockedUntil=Date.now()+300000;p.failures=0;}await store.put('profiles',name,p);return false;}
 p.failures=0;p.lockedUntil=0;await store.put('profiles',name,p);return true;
}
export async function changePin(store:Store,name:ProfileName,current:string,next:string){
 if(!/^\d{4}$/.test(next))throw Error('PIN은 숫자 4자리로 입력하세요.');
 if(!await verifyPin(store,name,current))throw Error('현재 PIN이 맞지 않습니다.');
 await store.put('profiles',name,{id:name,hash:passwordHash(next),failures:0,lockedUntil:0});await store.log('PIN 변경',`${name} 프로필 PIN 변경`);
}
