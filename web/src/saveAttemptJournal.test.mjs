import test from 'node:test';
import assert from 'node:assert/strict';
import {clearPendingSaveJournal,fingerprintAccount,fingerprintSaveInput,loadPendingSaveJournal,savePendingSaveJournal,withSaveAttemptLock} from './saveAttemptJournal.ts';

const entry={
  reviewId:'',brandId:'b1',brandName:'テスト銘柄',breweryName:'検証蔵',prefecture:'新潟県',
  municipality:'',breweryAddress:'',productName:'サンドボックス用',sakeType:'純米酒',sakeTypeOther:'',
  brewingMethod:'不明・記載なし',heatTreatment:'不明・記載なし',processingStyles:'',riceVariety:'',
  polishingRatio:'',alcoholPercent:'',vintage:'',drinkingDate:'2026-10-20',rating:'4',aromaTagIds:'',
  tasteTagIds:'',sweetDry:'',lightRich:'',acidity:'',umami:'',notes:'SANDBOX',photoId:'',createdAt:''
};

test('retry fingerprint is deterministic and changes with record or photo bytes',async()=>{
  const photo=new File([new Uint8Array([1,2,3])],'test.png',{type:'image/png'});
  const first=await fingerprintSaveInput(entry,photo);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.equal(await fingerprintSaveInput({...entry},photo),first);
  assert.notEqual(await fingerprintSaveInput({...entry,notes:'changed'},photo),first);
  assert.notEqual(await fingerprintSaveInput(entry,new File([new Uint8Array([1,2,4])],'test.png',{type:'image/png'})),first);
  assert.notEqual(await fingerprintSaveInput(entry,null),first);
});

test('account binding persists only a one-way digest',async()=>{
  const hash=await fingerprintAccount('Owner@example.com');
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(await fingerprintAccount(' owner@EXAMPLE.com '),hash);
  assert.doesNotMatch(hash,/owner|example/i);
});

test('test-mode save lock rejects concurrent tabs and passes no credential data',async()=>{
  const captured=[];
  const manager={request:async(name,options,callback)=>{
    captured.push({name,options:Object.keys(options).sort()});
    return callback({name});
  }};
  assert.equal(await withSaveAttemptLock('sakefolio-save:test:review',async()=>17,manager),17);
  assert.deepEqual(captured,[{name:'sakefolio-save:test:review',options:['ifAvailable','mode']}]);
  const occupied={request:async(_name,_options,callback)=>callback(null)};
  await assert.rejects(withSaveAttemptLock('sakefolio-save:test:review',async()=>17,occupied),/別タブ/);
  // Pass null to model a browser without Web Locks. Passing undefined activates
  // the production default, which is available in some Node 24 runtimes.
  await assert.rejects(withSaveAttemptLock('sakefolio-save:test:review',async()=>17,null),/安全な複数タブ/);
});

class MemoryIndexedDB {
  databases=new Map();
  open(name){
    const request={};
    queueMicrotask(()=>{
      let db=this.databases.get(name);
      if(!db){db=new MemoryDatabase();this.databases.set(name,db);request.result=db;request.onupgradeneeded?.();}
      request.result=db;request.onsuccess?.();
    });
    return request;
  }
}
class MemoryDatabase {
  stores=new Map();
  get objectStoreNames(){return {contains:name=>this.stores.has(name)};}
  createObjectStore(name){this.stores.set(name,new Map());}
  transaction(name){return new MemoryTransaction(this.stores.get(name));}
  close(){}
}
class MemoryTransaction {
  constructor(values){this.values=values;this.pending=0;}
  objectStore(){
    const request=(action)=>{
      const result={};this.pending++;
      queueMicrotask(()=>{
        try{result.result=action();result.onsuccess?.();}
        catch{result.onerror?.();this.onabort?.();}
        this.pending--;queueMicrotask(()=>{if(this.pending===0)this.oncomplete?.();});
      });
      return result;
    };
    return {
      get:key=>request(()=>this.values.get(key)),
      put:value=>request(()=>{this.values.set(value.key,structuredClone(value));return value.key;}),
      delete:key=>request(()=>this.values.delete(key))
    };
  }
  abort(){queueMicrotask(()=>this.onabort?.());}
}

test('retry journal stores only opaque retry metadata and refuses a different pending save',async()=>{
  const previous=globalThis.indexedDB;const fake=new MemoryIndexedDB();globalThis.indexedDB=fake;
  try{
    const accountHash=await fingerprintAccount('owner@example.com');
    const digest=await fingerprintSaveInput(entry,null);
    const first=await savePendingSaveJournal('sheet-id',accountHash,digest,{reviewId:'review-1',startedAt:'2026-10-20T00:00:00.000Z'});
    assert.equal(first.attempt.reviewId,'review-1');
    const recovered=await loadPendingSaveJournal();
    assert.deepEqual(recovered,first);
    const stored=[...fake.databases.values()][0].stores.get('attempts').get('active');
    const raw=JSON.stringify(stored);
    assert.doesNotMatch(raw,/owner@example.com|テスト銘柄|SANDBOX|access_token|photo bytes/i);
    await assert.rejects(savePendingSaveJournal('sheet-id',accountHash,'a'.repeat(64),{reviewId:'review-2'}),/別の未確定保存/);
    const concurrent=await savePendingSaveJournal('sheet-id',accountHash,digest,{reviewId:'review-2'});
    assert.equal(concurrent.attempt.reviewId,'review-1');
    await clearPendingSaveJournal();
    assert.equal(await loadPendingSaveJournal(),null);
  }finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
});
