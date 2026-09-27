import {randomBytes,createCipheriv,createDecipheriv,scryptSync,timingSafeEqual} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const root=process.env.DATA_DIR||'data';
mkdirSync(root,{recursive:true});
const keyFile=root+'/encryption.key';
if(!process.env.ENCRYPTION_KEY&&!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32).toString('base64'),{mode:0o600});
const key=Buffer.from(process.env.ENCRYPTION_KEY||readFileSync(keyFile,'utf8'),'base64');
if(key.length!==32)throw Error('ENCRYPTION_KEY는 32바이트 base64여야 합니다.');
export function seal(s:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(s,'utf8'),c.final()]);return [iv,c.getAuthTag(),data].map(x=>x.toString('base64')).join('.');}
export function unseal(s?:string){if(!s)return '';const [iv,tag,data]=s.split('.').map(x=>Buffer.from(x,'base64'));const c=createDecipheriv('aes-256-gcm',key,iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString('utf8');}
export function passwordHash(s:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64).toString('hex');}
export function passwordOK(s:string,h:string){try{const [salt,hash]=h.split(':');return timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(s,salt,64));}catch{return false;}}
