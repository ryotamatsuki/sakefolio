import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestGate} from './requestGate.ts';
import {readFileSync} from 'node:fs';

test('a completed request for the previous account cannot commit after account switch',()=>{
  const gate=createRequestGate();
  const accountA=gate.begin();
  const accountB=gate.begin();
  assert.equal(accountA(),false);
  assert.equal(accountB(),true);
});

test('unmount invalidates pending account data loads',()=>{
  const gate=createRequestGate();
  const pending=gate.begin();
  gate.invalidate();
  assert.equal(pending(),false);
});

test('deferred save/reload callbacks cannot publish old-account results',async()=>{
 const gate=createRequestGate();let resolveFirst;
 const deferred=new Promise(resolve=>{resolveFirst=resolve;});
 const seen=[];
 const first=gate.begin();
 const job=deferred.then(data=>{if(first())seen.push(data);});
 const second=gate.begin();
 if(second())seen.push('user-B');
 resolveFirst('user-A');
 await job;
 assert.deepEqual(seen,['user-B']);
});


test('a slow China backup cannot start downloading after an account switch',async()=>{
 const gate=createRequestGate();
 let completePhoto;
 const slowPhoto=new Promise(resolve=>{completePhoto=resolve;});
 const downloads=[];
 const forA=gate.begin();
 const exporting=(async()=>{
   await slowPhoto;
   if(!forA())return;
   downloads.push('old-account-backup');
 })();
 gate.invalidate();
 const forB=gate.begin();
 assert.equal(forB(),true);
 completePhoto();
 await exporting;
 assert.deepEqual(downloads,[]);
});

test('China backup handler guards actual download after async work and invalidates on unmount',()=>{
 const source=readFileSync(new URL('./InternationalDrinks.tsx',import.meta.url),'utf8');
 const handler=source.split('const backup=async()=>{')[1]?.split('const restore=async')[0];
 assert.ok(handler,'backup handler must exist');
 assert.match(handler,/const isCurrent=backupGate\.current\.begin\(\)/);
 const beforeDownload=handler.slice(0,handler.indexOf('a.click()'));
 assert.ok(handler.includes('a.click()'),'export must have a download point');
 assert.ok((beforeDownload.match(/if\(!isCurrent\(\)\)return;/g)||[]).length>=2,
   'check account generation after photo fetch and backup creation before download');
 assert.match(source,/backupGate\.current\.invalidate\(\)/,
   'account change or component unmount must invalidate active backups');
});
