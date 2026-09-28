import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect,Store} from '../server/store.js';
import {initializeProfiles,verifyPin,changePin} from '../server/profiles.js';
test('프로필 초기화는 변경 PIN을 덮어쓰지 않으며 반복 오입력을 잠근다',async()=>{const s=new Store(await connect(true));try{await s.put('accounts','old',{id:'old',name:'기존 계정'});await initializeProfiles(s);assert.equal((await s.get<any>('accounts','old')).profileId,'GEOM');assert.ok(await verifyPin(s,'GEOM','0000'));await changePin(s,'GEOM','0000','0123');await initializeProfiles(s);assert.ok(await verifyPin(s,'GEOM','0123'));assert.ok(await verifyPin(s,'KYU','0000'));for(let i=0;i<5;i++)assert.equal(await verifyPin(s,'KYU','9999'),false);await assert.rejects(verifyPin(s,'KYU','0000'),/5분/);assert.ok(await verifyPin(s,'GEOM','0123'));}finally{await s.db.close();}});
