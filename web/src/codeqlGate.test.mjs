import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSarif} from '../../.github/scripts/check-codeql-sarif.mjs';
const sarif=(rules,results)=>({runs:[{tool:{driver:{rules}},results}]});
test('CodeQL gate counts high/critical by ruleIndex or ruleId',()=>{
  const rules=[{id:'medium',properties:{'security-severity':'6.9'}},{id:'high',properties:{'security-severity':'7.0'}},{id:'critical',properties:{'security-severity':'9.8'}}];
  assert.deepEqual(summarizeSarif(sarif(rules,[{ruleIndex:0},{ruleIndex:1},{ruleId:'critical'}])),{results:3,criticalHigh:2});
});
test('CodeQL gate accepts an actually empty result set',()=>{
  assert.deepEqual(summarizeSarif(sarif([],[])),{results:0,criticalHigh:0});
});
test('CodeQL gate fails closed on absent runs, results, or rule metadata',()=>{
  for(const report of [{},{runs:[]},{runs:[{}]},sarif([],[{ruleId:'unknown'}])])assert.throws(()=>summarizeSarif(report));
});
