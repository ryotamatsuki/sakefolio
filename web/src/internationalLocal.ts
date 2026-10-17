import {detectPhotoType,verifyPhoto} from './security.ts';
import {BEVERAGE_KINDS} from './internationalCatalog.ts';
import {validateTechnicalSpecs} from './internationalInput.ts';
import type {BeverageKind} from './internationalCatalog.ts';

const DB='sakefolio-international-local-v1';
const STORE='drinks';
export const MAX_LOCAL_PHOTO_BYTES=10*1024*1024;
const MAX_TEXT=4000,MAX_IMPORT_BYTES=80*1024*1024;
export interface InternationalRecord {
 id:string;
 kind:BeverageKind;
 brandName:string;
 productName:string;
 producer:string;
 region:string;
 country:'中国';
 sourceUrl:string;
 attributes:Record<string,string>;
 experience:'tasted'|'catalogued'|'test';
 tastedAt:string;
 rating:string;
 aroma:string;
 taste:string;
 notes:string;
 createdAt:string;
 photo:Blob|null;
 photoId?:string;
}
export type InternationalTextRecord=Omit<InternationalRecord,'photo'>;
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateInternationalRecord(r:InternationalRecord):void {
 if(!isObject(r)||typeof r.id!=='string'||!/^[\w-]{8,100}$/.test(r.id))throw new Error('記録IDが不正です。');
 if(!BEVERAGE_KINDS.includes(r.kind))throw new Error('酒類が不正です。');
 if(r.country!=='中国')throw new Error('対象国が不正です。');
 for(const field of ['brandName','productName','producer','region','sourceUrl','experience','tastedAt','rating','aroma','taste','notes','createdAt']){
   const v=r[field as keyof InternationalRecord];
   if(typeof v!=='string'||v.length>MAX_TEXT||/[\u0000-\u001f]/.test(v))throw new Error(field+'を確認してください。');
 }
 if(!r.brandName.trim()||!r.productName.trim())throw new Error('銘柄と商品名は必須です。');
 if(!['tasted','catalogued','test'].includes(r.experience))throw new Error('記録種別が不正です。');
 if(r.rating&&!/^[1-5]$/.test(r.rating))throw new Error('評価は1～5のみです。');
 if((r.experience==='catalogued'&&(r.rating||r.tastedAt))||(r.experience==='test'&&r.tastedAt))throw new Error('飲酒していない商品に不正な飲酒日・評価が含まれます。');
 if(r.experience==='tasted'){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(r.tastedAt)||Number.isNaN(Date.parse(r.tastedAt+'T12:00:00Z'))||
     new Date(r.tastedAt+'T12:00:00Z').toISOString().slice(0,10)!==r.tastedAt)throw new Error('飲酒日が不正です。');
 }
 if(r.sourceUrl){let u:URL;try{u=new URL(r.sourceUrl)}catch{throw new Error('出典URLを確認してください。')}
   if(u.protocol!=='https:'||u.username||u.password)throw new Error('出典URLはHTTPSのみ利用できます。');}
 if(!isObject(r.attributes)||Object.keys(r.attributes).length>25)throw new Error('詳細項目が不正です。');
 for(const [key,value] of Object.entries(r.attributes))
   if(!/^[a-zA-Z]{1,40}$/.test(key)||typeof value!=='string'||value.length>MAX_TEXT)
     throw new Error('詳細項目に不正な値があります。');
 validateTechnicalSpecs(r.attributes);
 if(r.photoId!==undefined&&(typeof r.photoId!=='string'||r.photoId.length>200||!/^[\w-]*$/.test(r.photoId)))
   throw new Error('写真IDが不正です。');
 if(r.experience==='test'&&!r.notes.includes('UXTEST'))throw new Error('評価テストはUXTESTと明記してください。');
 if(r.photo!==null&&(!(r.photo instanceof Blob)||r.photo.size>MAX_LOCAL_PHOTO_BYTES))
   throw new Error('写真の形式・容量を確認してください。');
}
function openLocal():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('このブラウザではIndexedDBが利用できません。'));
 return new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB,1);
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(new Error('端末内データを開けません。ブラウザの設定をご確認ください。'));
   request.onblocked=()=>reject(new Error('別タブでデータが使用されています。閉じて再試行してください。'));
 });
}
async function requestStore<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await openLocal();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,mode),req=fn(tx.objectStore(STORE));
   let result:T;
   req.onsuccess=()=>{result=req.result;};
   req.onerror=()=>{tx.abort();};
   tx.oncomplete=()=>{db.close();resolve(result);};
   tx.onerror=()=>{db.close();reject(new Error('端末内データの保存・読み込みに失敗しました。'));};
   tx.onabort=()=>{db.close();reject(new Error('端末内データの操作が中断されました。'));};
 });
}
export async function listInternationalRecords():Promise<InternationalRecord[]>{
 const values=await requestStore<InternationalRecord[]>('readonly',s=>s.getAll());
 return values.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function saveInternationalRecord(data:InternationalRecord,photoFile:File|null):Promise<void>{
 if(photoFile){await verifyPhoto(photoFile);data.photo=photoFile;}
 validateInternationalRecord(data);
 // add() prevents overwriting another tasting with the same ID.
 await requestStore('readwrite',s=>s.add(data));
}
const encodePhoto=async(blob:Blob):Promise<string>=>{
 const buffer=await blob.arrayBuffer(),bytes=new Uint8Array(buffer);
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.slice(i,i+32768));
 return btoa(binary);
};
const decodePhoto=(encoded:string,type:string):Blob=>{
 if(encoded.length>15*1024*1024||!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))throw new Error('写真のバックアップ形式が不正です。');
 const binary=atob(encoded);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const magic=detectPhotoType(bytes.slice(0,32));
 if(!magic||magic.mime!==type||bytes.length>MAX_LOCAL_PHOTO_BYTES)throw new Error('写真の形式または容量が不正です。');
 return new Blob([bytes],{type});
};
export async function buildBackup(records:InternationalRecord[]):Promise<Blob>{
 const out=[];
 for(const r of records){
   validateInternationalRecord(r);
   const {photo,...fields}=r;
   out.push({...fields,photoData:photo?await encodePhoto(photo):null,photoMime:photo?.type||''});
 }
 return new Blob([JSON.stringify({format:'Sakefolio-international-v1',exportedAt:new Date().toISOString(),records:out})],{type:'application/json'});
}
export async function restoreBackup(file:File):Promise<{added:number;duplicates:number}>{
 if(file.size>MAX_IMPORT_BYTES)throw new Error('バックアップは80MB以下にしてください。');
 const data:unknown=JSON.parse(await file.text());
 if(!isObject(data)||data.format!=='Sakefolio-international-v1'||!Array.isArray(data.records)||
   data.records.length>2000)throw new Error('Sakefolio国際酒類のバックアップではありません。');
 const incoming:InternationalRecord[]=[];
 const inBatch=new Set<string>();
 for(const raw of data.records){
   if(!isObject(raw))throw new Error('バックアップ内の形式が不正です。');
   const {photoData,photoMime,...fields}=raw;
   const photo=typeof photoData==='string'?
     decodePhoto(photoData,typeof photoMime==='string'?photoMime:''):null;
   const record={...fields,photo} as unknown as InternationalRecord;
   validateInternationalRecord(record);
   if(inBatch.has(record.id))throw new Error('同じ記録IDがバックアップ内に重複しています。');
   inBatch.add(record.id);incoming.push(record);
 }
 const existing=await listInternationalRecords();
 const ids=new Set(existing.map(r=>r.id));
 let added=0,duplicates=0;
 // Validate every record before mutating the database; existing IDs never overwritten.
 for(const r of incoming){
   if(ids.has(r.id)){duplicates++;continue;}
   try{await requestStore('readwrite',s=>s.add(r));added++;ids.add(r.id);}
   catch{throw new Error('一部の復元処理に失敗しました。'+added+'件まで保存済みです。再試行時に重複は追加しません。');}
 }
 return {added,duplicates};
}
