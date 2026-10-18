import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestGate} from './requestGate.ts';

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
