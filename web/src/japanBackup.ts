import type {RecordEntry} from './types';
import {verifyPhoto,validateRecordInput,MAX_PHOTO_BYTES} from './security';
const LIMIT=80*1024*1024,MAX_ITEMS=250;
const FIELDS=['reviewId','brandId','brandName','breweryName','prefecture','municipality',
 'breweryAddress','productName','sakeType','sakeTypeOther','brewingMethod','heatTreatment',
 'processingStyles','riceVariety','polishingRatio','alcoholPercent','vintage','drinkingDate',
 'rating','aromaTagIds','tasteTagIds','sweetDry','lightRich','acidity','umami','notes','photoId','createdAt'] as const;
export interface JapanArchiveItem{record:RecordEntry;photo:File|null}
const encode=async(blob:Blob)=>{
 const b=new Uint8Array(await blob.arrayBuffer());let bin='';
 for(let i=0;i<b.length;i+=16384)bin+=String.fromCharCode(...b.slice(i,i+16384));
 return btoa(bin);
};
const decode=(b64:string,mime:string):File=>{
 if(b64.length>15*1024*1024||!/^[a-zA-Z0-9+/]*={0,2}$/.test(b64))
  throw Error('バックアップ画像の形式が不正です。');
 const bin=atob(b64),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 if(!bytes.length||bytes.length>MAX_PHOTO_BYTES)throw Error('バックアップ画像が制限を超えています。');
 return new File([bytes],'restored-label',{type:mime});
};
const parseRecord=(src:unknown):RecordEntry=>{
 if(!src||typeof src!=='object'||Array.isArray(src))throw Error('記録形式が不正です。');
 const raw=src as Record<string,unknown>,entry={} as Record<string,string>;
 for(const key of FIELDS){
  const value=raw[key];
  if(typeof value!=='string'||value.length>4000)throw Error('記録フィールドの形式が不正です: '+key);
  entry[key]=value;
 }
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(entry.reviewId)||
     !/^\d{4}-\d{2}-\d{2}T/.test(entry.createdAt))throw Error('記録ID・作成日時が不正です。');
 validateRecordInput(entry as unknown as RecordEntry);
 return entry as unknown as RecordEntry;
};
/** Creates a portable JSON archive containing photos. Never includes access tokens. */
export async function buildJapanBackup(records:RecordEntry[],readPhoto:(id:string)=>Promise<Blob>):Promise<Blob>{
 if(records.length>MAX_ITEMS)throw Error('写真付きバックアップは1回250件まで。CSVで全件書出しできます。');
 const items:unknown[]=[];let estimated=0;
 for(const r of records){
  const entry=parseRecord(r),photo=r.photoId?await readPhoto(r.photoId):null;
  const item={record:entry,photoMime:photo?.type||'',photoData:photo?await encode(photo):null};
  const serial=JSON.stringify(item);estimated+=serial.length;
  if(estimated>LIMIT)throw Error('バックアップの80MB制限を超えました。件数を分けてください。');
  items.push(item);
 }
 return new Blob([JSON.stringify({format:'sakefolio-japan-v1',createdAt:new Date().toISOString(),items})],
  {type:'application/json'});
}
export async function readJapanBackup(file:File):Promise<JapanArchiveItem[]>{
 if(file.size>LIMIT)throw Error('バックアップは80MB以下にしてください。');
 const data:unknown=JSON.parse(await file.text());
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('バックアップ形式が不正です。');
 const root=data as Record<string,unknown>;
 if(root.format!=='sakefolio-japan-v1'||!Array.isArray(root.items)||root.items.length>MAX_ITEMS)
  throw Error('Sakefolio日本酒のバックアップではありません。');
 const items:JapanArchiveItem[]=[],ids=new Set<string>();
 for(const source of root.items){
  if(!source||typeof source!=='object'||Array.isArray(source))throw Error('バックアップ項目の形式が不正です。');
  const item=source as Record<string,unknown>,record=parseRecord(item.record);
  if(ids.has(record.reviewId))throw Error('バックアップに重複IDがあります。');
  ids.add(record.reviewId);
  const photo=item.photoData===null?null:
   typeof item.photoData==='string'&&typeof item.photoMime==='string'?
     decode(item.photoData,item.photoMime):null;
  if(item.photoData!==null&&!photo)throw Error('バックアップの写真形式が不正です。');
  if(photo)await verifyPhoto(photo);
  items.push({record,photo});
 }
 return items;
}
