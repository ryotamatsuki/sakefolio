import type {SaveAttempt} from './google';
import type {RecordEntry} from './types';

const DATABASE='sakefolio-security-test-retry-v1';
const STORE='attempts';
const JOURNAL_KEY='active';

export interface PendingSaveJournal {
  version:1;
  key:'active';
  spreadsheetId:string;
  accountHash:string;
  fingerprint:string;
  attempt:SaveAttempt;
  updatedAt:string;
}

function openDatabase():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('再試行情報を保存できません。このブラウザではIndexedDBが利用できません。'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('再試行情報を開けません。ブラウザのストレージ設定を確認してください。'));
    request.onblocked=()=>reject(new Error('別タブが再試行情報を使用中です。少し待って再試行してください。'));
  });
}

function isJournal(value:unknown):value is PendingSaveJournal{
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<PendingSaveJournal>;
  const a=v.attempt;
  return v.version===1&&v.key==='active'&&typeof v.spreadsheetId==='string'&&
    /^[A-Za-z0-9_-]{1,200}$/.test(v.spreadsheetId)&&typeof v.accountHash==='string'&&
    /^[a-f0-9]{64}$/.test(v.accountHash)&&typeof v.fingerprint==='string'&&
    /^[a-f0-9]{64}$/.test(v.fingerprint)&&typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt))&&
    !!a&&typeof a.reviewId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(a.reviewId)&&
    (a.brandId===undefined||typeof a.brandId==='string'&&a.brandId.length<=300)&&
    (a.photoFileId===undefined||typeof a.photoFileId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(a.photoFileId))&&
    (a.startedAt===undefined||typeof a.startedAt==='string'&&Number.isFinite(Date.parse(a.startedAt)));
}

function storeRequest<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  return openDatabase().then(db=>new Promise<T>((resolve,reject)=>{
    let result:T;
    let settled=false;
    const fail=()=>{if(!settled){settled=true;db.close();reject(new Error('再試行情報を保存・読み込みできません。'));}};
    let transaction:IDBTransaction;
    try{
      transaction=db.transaction(STORE,mode);
      const request=action(transaction.objectStore(STORE));
      request.onsuccess=()=>{result=request.result;};
      request.onerror=()=>{try{transaction.abort();}catch{fail();}};
    }catch{db.close();reject(new Error('再試行情報の操作を開始できません。'));return;}
    transaction.oncomplete=()=>{if(!settled){settled=true;db.close();resolve(result);}};
    transaction.onerror=fail;
    transaction.onabort=fail;
  }));
}

export async function loadPendingSaveJournal():Promise<PendingSaveJournal|null>{
  const value=await storeRequest<unknown>('readonly',store=>store.get(JOURNAL_KEY));
  if(value===undefined)return null;
  if(!isJournal(value))throw new Error('再試行情報の形式を検証できません。保護のため保存を停止しました。');
  return value;
}

export async function savePendingSaveJournal(
  spreadsheetId:string,accountHash:string,fingerprint:string,attempt:SaveAttempt
):Promise<PendingSaveJournal>{
  const journal:PendingSaveJournal={
    version:1,key:JOURNAL_KEY,spreadsheetId,accountHash,fingerprint,
    attempt:{reviewId:attempt.reviewId,...(attempt.brandId?{brandId:attempt.brandId}:{}),
      ...(attempt.photoFileId?{photoFileId:attempt.photoFileId}:{}),...(attempt.startedAt?{startedAt:attempt.startedAt}:{})},
    updatedAt:new Date().toISOString()
  };
  if(!isJournal(journal))throw new Error('再試行情報の形式が不正です。保存を中止しました。');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    let result=journal;
    let failure:Error|undefined;
    let settled=false;
    const transaction=db.transaction(STORE,'readwrite');
    const store=transaction.objectStore(STORE);
    const request=store.get(JOURNAL_KEY);
    request.onsuccess=()=>{
      const existing=request.result;
      if(existing!==undefined&&!isJournal(existing)){
        failure=new Error('既存の再試行情報を検証できません。保護のため保存を停止しました。');
        transaction.abort();return;
      }
      if(existing!==undefined){
        if(existing.spreadsheetId!==journal.spreadsheetId||existing.accountHash!==journal.accountHash||existing.fingerprint!==journal.fingerprint){
          failure=new Error('別の未確定保存があります。前回の保存先を確認してから再試行してください。');
          transaction.abort();return;
        }
        if(existing.attempt.reviewId!==journal.attempt.reviewId){
          // A second tab created the same payload concurrently. Reuse its stable ID.
          result=existing;
          return;
        }
      }
      store.put(journal);
    };
    const fail=()=>{
      if(!settled){settled=true;db.close();reject(failure||new Error('再試行情報を保存できません。'));}
    };
    request.onerror=fail;
    transaction.oncomplete=()=>{if(!settled){settled=true;db.close();resolve(result);}};
    transaction.onerror=fail;
    transaction.onabort=fail;
  });
}

export async function clearPendingSaveJournal():Promise<void>{
  await storeRequest('readwrite',store=>store.delete(JOURNAL_KEY));
}

async function sha256(value:BufferSource):Promise<string>{
  if(!globalThis.crypto?.subtle)throw new Error('このブラウザでは安全な再試行照合を利用できません。');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',value);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** A one-way digest only: neither the record text nor photo bytes enter IndexedDB. */
export async function fingerprintSaveInput(entry:RecordEntry,photo:File|null):Promise<string>{
  const sortedEntry=Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key as keyof RecordEntry]]));
  const photoDigest=photo?await sha256(await photo.arrayBuffer()):'';
  return sha256(new TextEncoder().encode(JSON.stringify({entry:sortedEntry,photoDigest})));
}

/** The account address is never persisted; only its one-way digest is used to bind a retry. */
export async function fingerprintAccount(email:string):Promise<string>{
  return sha256(new TextEncoder().encode(email.trim().toLocaleLowerCase('en-US')));
}

export async function withSaveAttemptLock<T>(name:string,operation:()=>Promise<T>,manager:LockManager|undefined=globalThis.navigator?.locks):Promise<T>{
  if(!manager)throw new Error('このブラウザでは安全な複数タブ保存ロックを利用できません。サンドボックス保存を停止しました。');
  return manager.request(name,{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock)throw new Error('同じ記録を別タブで保存中です。完了を確認してから再試行してください。');
    return operation();
  });
}
