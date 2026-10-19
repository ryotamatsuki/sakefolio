import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const securityUrl=new URL('./security.ts',import.meta.url).href;
const source=readFileSync(new URL('./google.ts',import.meta.url),'utf8');
const realFetch=globalThis.fetch;
test('sandbox local database cannot select the normal database',async()=>{
 const modeSource=readFileSync(new URL('./deploymentMode.ts',import.meta.url),'utf8');
 const names=[];
 for(const mode of [false,true]) {
  const js=ts.transpileModule(modeSource.replace("import.meta.env?.VITE_SAKEFOLIO_SECURITY_TEST === '20261019'",String(mode)),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
  }).outputText;
  const config=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  names.push(config.LOCAL_DATABASE_NAME);
 }
 assert.equal(names[0],'sakefolio-international-local-v1');
 assert.notEqual(names[0],names[1]);
 assert.match(names[1],/security-test-20261019/);
 const localSource=readFileSync(new URL('./internationalLocal.ts',import.meta.url),'utf8');
 assert.match(localSource,/const DB=LOCAL_DATABASE_NAME/);
});
test.afterEach(()=>{globalThis.fetch=realFetch;});
async function compiled(mode){
 const src=source
  .replace("from './security'", "from '"+securityUrl+"'")
  .replace('import.meta.env.VITE_GOOGLE_CLIENT_ID',"'test-client-id'")
  .replace("import.meta.env.VITE_SAKEFOLIO_SECURITY_TEST === '20261019'",mode?'true':'false');
 const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
for(const [mode,folder,marker] of [
 [false,'Sakefolio','sakefolio-react-v1'],
 [true,'SAKEFOLIO_SECURITY_TEST_20261019','sakefolio-security-test-20261019-v1']
]){
 test((mode?'audit':'normal')+' Drive namespace is isolated',async()=>{
  const google=await compiled(mode);
  const requests=[];
  globalThis.fetch=async(input,init={})=>{
   const url=new URL(input);
   assert.equal(url.hostname,'www.googleapis.com');
   if((init.method||'GET')==='GET') {
    const query=url.searchParams.get('q')||'';
    assert.match(query,new RegExp(marker));
    assert.doesNotMatch(query,new RegExp(mode?'sakefolio-react-v1':'sakefolio-security-test-20261019-v1'));
    requests.push({method:'GET'});
    return new Response(JSON.stringify({files:[]}),{status:200});
   }
   if(init.method==='POST'){
    const body=JSON.parse(init.body);
    assert.equal(body.name,folder);
    assert.equal(body.appProperties.sakefolioApp,marker);
    assert.equal(body.appProperties.sakefolioKind,'root');
    requests.push({method:'POST'});
    throw Error('stop-before-mutation');
   }
   throw Error('unexpected call');
  };
  await assert.rejects(google.ensureStorage('test-only'),/通信エラー/);
  assert.deepEqual(requests.map(r=>r.method),['GET','POST']);
 });
}
