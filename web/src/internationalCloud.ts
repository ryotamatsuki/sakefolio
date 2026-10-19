/** ChinaDrinks: separate, versioned Google Sheets table within the same Sakefolio_Data file.
 * No writes to existing Japanese Brands/Bottles/Reviews or Photos tables.
 */
import type {StorageInfo} from './types';
import type {InternationalRecord} from './internationalLocal';
import {validateInternationalRecord} from './internationalLocal.ts';
import {APP_MARKER,uploadPhoto,getPhotoBlob} from './google.ts';
import {sanitizePhotoForStorage} from './photos.ts';
import {notifyAuthSessionSignal,recordAuthAuditEvent} from './authSession';

export const CHINA_TABLE='ChinaDrinks';
export const CHINA_HEADERS=[
 'id','kind','brandName','productName','producer','region','country','sourceUrl','attributesJson',
 'experience','tastedAt','rating','aroma','taste','notes','createdAt','photoId'
] as const;
type Field=typeof CHINA_HEADERS[number];
const columns=CHINA_HEADERS.length;
const endpoint=(id:string)=>'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id);
const location="'"+CHINA_TABLE+"'!";
async function sheetApi<T>(token:string,url:string,init:RequestInit={}):Promise<T>{
 if(!token)throw Error('Googleアカウントに接続してください。');
 init.signal?.throwIfAborted();
 const requestId=crypto.randomUUID(),startedAt=Date.now();
 recordAuthAuditEvent('api-request',{requestId,tokenPresent:true,apiHost:'sheets.googleapis.com',method:(init.method||'GET').toUpperCase() as 'GET'|'POST'|'PUT'});
 let response:Response;
 try{
   response=await fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),
     headers:{Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}});
 }catch(error){
   const aborted=init.signal?.aborted||error instanceof Error&&error.name==='AbortError';
   const timeout=error instanceof Error&&error.name==='TimeoutError';
   recordAuthAuditEvent('api-response',{requestId,tokenPresent:true,apiHost:'sheets.googleapis.com',
     outcome:aborted?'aborted':timeout?'timeout':'network-error',durationMs:Date.now()-startedAt});
   if(aborted)throw error;
   throw Error(timeout?'中国酒のGoogle Sheets応答がタイムアウトしました。接続を確認して再試行してください。':'中国酒のGoogle Sheets通信エラー。接続を確認して再試行してください。');
 }
 const eventId=response.status===401?notifyAuthSessionSignal('authorization-invalid'):undefined;
 recordAuthAuditEvent('api-response',{requestId,tokenPresent:true,apiHost:'sheets.googleapis.com',status:response.status,
   ...(eventId?{eventId}:{}),outcome:response.status===401?'unauthorized':response.ok?'success':'failure',durationMs:Date.now()-startedAt});
 if(!response.ok)throw Error('中国酒のGoogle Sheets保存・読み込みに失敗しました（HTTP '+response.status+'）。');
 return response.json() as Promise<T>;
}
async function values(token:string,sheetId:string,signal?:AbortSignal):Promise<string[][]>{
 const r=await sheetApi<{values?:string[][]}>(token,
   endpoint(sheetId)+'/values/'+encodeURIComponent(location+'A1:Q'),{signal});
 return r.values||[];
}
export async function ensureChinaTable(token:string,storage:StorageInfo,signal?:AbortSignal):Promise<void>{
 const url=endpoint(storage.spreadsheetId);
 const meta=await sheetApi<{sheets?:{properties:{sheetId:number;title:string}}[]}>(token,url+'?fields=sheets(properties(sheetId,title))',{signal});
 const sheet=meta.sheets?.find(s=>s.properties.title===CHINA_TABLE);
 if(!sheet){
   try{
     await sheetApi(token,url+':batchUpdate',{method:'POST',signal,body:JSON.stringify({
       requests:[{addSheet:{properties:{title:CHINA_TABLE,gridProperties:{columnCount:20,rowCount:1000,frozenRowCount:1}}}}]
     })});
   }catch(e){
     // If another tab was created concurrently, check it rather than duplicate.
     const again=await sheetApi<{sheets?:{properties:{title:string}}[]}>(token,url+'?fields=sheets(properties(title))',{signal});
     if(!again.sheets?.some(s=>s.properties.title===CHINA_TABLE))throw e;
   }
 }
 const existing=await sheetApi<{values?:string[][]}>(token,url+'/values/'+encodeURIComponent(location+'A1:Q1'),{signal});
 const header=existing.values?.[0]||[];
 if(!header.length){
   await sheetApi(token,url+'/values/'+encodeURIComponent(location+'A1:Q1')+'?valueInputOption=RAW',
     {method:'PUT',signal,body:JSON.stringify({values:[CHINA_HEADERS]})});
 }else if(CHINA_HEADERS.some((h,i)=>header[i]!==h)||header.length!==columns){
   throw Error('ChinaDrinksの列構造が異なります。データ保護のため操作を中止しました。');
 }
}
export function deserializeChinaRow(row:string[]):InternationalRecord|null{
 if(!row[0])return null;
 let attributes:Record<string,string>={};
 try{
   const parsed:unknown=JSON.parse(String(row[8]||'{}'));
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
   attributes=parsed as Record<string,string>;
 }catch{return null;}
 const record={
   id:String(row[0]||''),kind:String(row[1]||'') as InternationalRecord['kind'],
   brandName:String(row[2]||''),productName:String(row[3]||''),producer:String(row[4]||''),
   region:String(row[5]||''),country:String(row[6]||'') as '中国',sourceUrl:String(row[7]||''),
   attributes,experience:String(row[9]||'') as InternationalRecord['experience'],
   tastedAt:String(row[10]||''),rating:String(row[11]||''),aroma:String(row[12]||''),
   taste:String(row[13]||''),notes:String(row[14]||''),createdAt:String(row[15]||''),
   photo:null,photoId:String(row[16]||'')
 } satisfies InternationalRecord;
 try{validateInternationalRecord(record);return record;}catch{return null;}
}
export function serializeChinaRow(r:InternationalRecord):string[]{
 validateInternationalRecord(r);
 const row:Record<Field,string>={
   id:r.id,kind:r.kind,brandName:r.brandName,productName:r.productName,producer:r.producer,
   region:r.region,country:r.country,sourceUrl:r.sourceUrl,attributesJson:JSON.stringify(r.attributes),
   experience:r.experience,tastedAt:r.tastedAt,rating:r.rating,aroma:r.aroma,taste:r.taste,
   notes:r.notes,createdAt:r.createdAt,photoId:r.photoId||''
 };
 return CHINA_HEADERS.map(h=>row[h]);
}
export async function loadChinaCloud(token:string,storage:StorageInfo,signal?:AbortSignal):Promise<InternationalRecord[]>{
 await ensureChinaTable(token,storage,signal);
 const data=await values(token,storage.spreadsheetId,signal);
 if(CHINA_HEADERS.some((h,i)=>data[0]?.[i]!==h))throw Error('ChinaDrinksのヘッダーを確認できません。');
 const records:InternationalRecord[]=[];
 const ids=new Set<string>();
 for(const row of data.slice(1)){
   const item=deserializeChinaRow(row);
   if(!item)continue;
   if(ids.has(item.id))throw Error('ChinaDrinksの同一IDが重複しています。管理画面で確認してください。');
   ids.add(item.id);records.push(item);
 }
 return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
const saving=new Set<string>();
export async function saveChinaCloud(token:string,storage:StorageInfo,record:InternationalRecord,photoFile:File|null,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 validateInternationalRecord(record);
 const key=storage.spreadsheetId+':'+record.id;
 if(saving.has(key))throw Error('この中国酒記録は保存中です。');
 saving.add(key);
 try{
   await ensureChinaTable(token,storage,signal);
   const sheet=await values(token,storage.spreadsheetId,signal);
   const head=sheet[0]||[];
   if(CHINA_HEADERS.some((h,i)=>head[i]!==h))throw Error('ChinaDrinksの列構造が変わっています。');
   const existing=sheet.slice(1).filter(x=>x[0]===record.id);
   if(existing.length>1)throw Error('記録IDが重複しています。上書きしません。');
   if(existing.length){
     const expected=serializeChinaRow(record);
     if(expected.some((v,i)=>v!==String(existing[0][i]||'')))throw Error('同じIDに別のデータがあります。上書きしません。');
     return;
   }
   if(photoFile){
     // Reserve and retain the ID before upload. A retry can find or recreate this
     // exact private Drive file after an uncertain upload/Sheets response.
     if(!record.photoId){
       signal?.throwIfAborted();
       const reserved=await fetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',{
         signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token}});
       if(!reserved.ok)throw Error('写真IDを予約できません（HTTP '+reserved.status+'）。');
       const ids=await reserved.json() as {ids?:string[]};
       if(!ids.ids?.[0])throw Error('写真IDを予約できませんでした。');
       record.photoId=ids.ids[0];
     }
     signal?.throwIfAborted();
     const check=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(record.photoId)+'?fields=id,parents,appProperties',{
       signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token}})
       .catch(()=>{throw Error('写真確認中の通信エラー。再試行してください。');});
     if(check.status===404){
       const safePhoto=await sanitizePhotoForStorage(photoFile);
       await uploadPhoto(token,storage.photoFolderId,safePhoto,record.photoId,record.id,signal);
     }else{
       if(!check.ok)throw Error('写真確認に失敗しました（HTTP '+check.status+'）。');
       const found=await check.json() as {parents?:string[];appProperties?:Record<string,string>};
       if(!found.parents?.includes(storage.photoFolderId)||
          found.appProperties?.sakefolioApp!==APP_MARKER||
          found.appProperties?.sakefolioKind!=='photo'||
          found.appProperties?.reviewId!==record.id)
         throw Error('写真の保存先または記録IDが一致しません。');
     }
     await getPhotoBlob(token,record.photoId,storage.photoFolderId,signal);
   }
   const row=serializeChinaRow(record);
   await sheetApi(token,endpoint(storage.spreadsheetId)+'/values/'+encodeURIComponent(location+'A:Q')+
     ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',signal,body:JSON.stringify({values:[row]})});
   const verified=(await values(token,storage.spreadsheetId,signal)).slice(1).filter(x=>x[0]===record.id);
   if(verified.length!==1||row.some((x,i)=>x!==String(verified[0][i]||'')))
     throw Error('保存結果を確認できません。再試行前にGoogle Sheetsを確認してください。');
 }finally{saving.delete(key);}
}
