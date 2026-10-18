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
