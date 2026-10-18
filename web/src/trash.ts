/** Non-destructive per-user tombstones in the app-owned spreadsheet.
 * Removing a record from the collection does not delete the underlying
 * Sheets row or photo. UI must describe this as moving to Trash.
 */
import type {StorageInfo} from './types';
export type RecordKind='japan'|'china';
export interface TrashEntry{kind:RecordKind;id:string;deletedAt:string}
const TAB='SakefolioTrash';
const HEAD=['kind','recordId','deletedAt'];
const base=(id:string)=>'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id);
const range=(r:string)=>encodeURIComponent("'"+TAB+"'!"+r);
async function call<T>(token:string,url:string,init:RequestInit={}):Promise<T>{
 if(!token)throw Error('Googleに接続してください。');
 const r=await fetch(url,{...init,signal:AbortSignal.timeout(45000),
  headers:{Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{})}});
 if(!r.ok)throw Error('ゴミ箱のGoogle Sheets操作に失敗しました（HTTP '+r.status+'）。');
 return r.json() as Promise<T>;
}
async function ensure(token:string,storage:StorageInfo){
 const root=base(storage.spreadsheetId);
 const meta=await call<{sheets?:{properties:{title:string}}[]}>(token,root+'?fields=sheets(properties(title))');
 if(!meta.sheets?.some(x=>x.properties.title===TAB)){
  try{await call(token,root+':batchUpdate',{method:'POST',
   body:JSON.stringify({requests:[{addSheet:{properties:{title:TAB}}}]})});}
  catch(e){
   const again=await call<{sheets?:{properties:{title:string}}[]}>(token,root+'?fields=sheets(properties(title))');
   if(!again.sheets?.some(x=>x.properties.title===TAB))throw e;
  }
 }
 const read=await call<{values?:string[][]}>(token,root+'/values/'+range('A1:C1'));
 const h=read.values?.[0]||[];
 if(!h.length){await call(token,root+'/values/'+range('A1:C1')+'?valueInputOption=RAW',
  {method:'PUT',body:JSON.stringify({values:[HEAD]})});}
 else if(HEAD.some((v,i)=>h[i]!==v)||h.length!==HEAD.length)throw Error('ゴミ箱の列が変更されています。安全のため操作を中止しました。');
}
async function rows(token:string,storage:StorageInfo):Promise<string[][]>{
 await ensure(token,storage);
 const r=await call<{values?:string[][]}>(token,base(storage.spreadsheetId)+'/values/'+range('A1:C'));
 const values=r.values||[];
 if(HEAD.some((h,i)=>values[0]?.[i]!==h))throw Error('ゴミ箱のヘッダーが不正です。');
 return values;
}
export async function listTrash(token:string,storage:StorageInfo):Promise<TrashEntry[]>{
 const r=await rows(token,storage),seen=new Set<string>(),result:TrashEntry[]=[];
 for(const row of r.slice(1)){
  if(!row?.[0])continue;
  if(!['china','japan'].includes(row[0])||!/^[\w-]{1,100}$/.test(row[1]||'')||
     !/^\d{4}-\d{2}-\d{2}T/.test(row[2]||''))throw Error('ゴミ箱内に不正なデータがあります。');
  const key=row[0]+':'+row[1];
  if(seen.has(key))throw Error('ゴミ箱で記録IDが重複しています。手動確認が必要です。');
  seen.add(key);result.push({kind:row[0] as RecordKind,id:row[1],deletedAt:row[2]});
 }
 return result;
}
export async function moveToTrash(token:string,storage:StorageInfo,kind:RecordKind,id:string):Promise<void>{
 if(!/^[\w-]{1,100}$/.test(id))throw Error('記録IDが不正です。');
 const all=await listTrash(token,storage);
 if(all.some(x=>x.kind===kind&&x.id===id))return;
 const deletedAt=new Date().toISOString();
 await call(token,base(storage.spreadsheetId)+'/values/'+range('A:C')+
  ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',
   body:JSON.stringify({values:[[kind,id,deletedAt]]})});
 if(!(await listTrash(token,storage)).some(x=>x.kind===kind&&x.id===id))
  throw Error('ゴミ箱への移動結果を確認できません。');
}
export async function restoreFromTrash(token:string,storage:StorageInfo,kind:RecordKind,id:string):Promise<void>{
 const current=await rows(token,storage);
 const matches=current.map((x,index)=>({row:x,index})).filter(x=>x.index>0&&x.row[0]===kind&&x.row[1]===id);
 if(matches.length!==1)throw Error('復元対象が存在しないか重複しています。');
 // Keep physical Sheets rows; clear only the exact app-created tombstone.
 const rowNumber=matches[0].index+1;
 await call(token,base(storage.spreadsheetId)+'/values/'+range('A'+rowNumber+':C'+rowNumber)+':clear',
  {method:'POST',body:'{}'});
 if((await listTrash(token,storage)).some(x=>x.kind===kind&&x.id===id))
  throw Error('復元結果を確認できません。');
}
export function notTrashed<T>(items:T[],ids:string[],key:(x:T)=>string):T[]{
 const hidden=new Set(ids);return items.filter(x=>!hidden.has(key(x)));
}
