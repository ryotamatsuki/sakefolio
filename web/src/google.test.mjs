import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual API layer with deterministic HTTP responses, without Google credentials.
const securityUrl = new URL('./security.ts', import.meta.url).href;
const source = readFileSync(new URL('./google.ts', import.meta.url), 'utf8')
  .replace("from './security'", `from '${securityUrl}'`)
  .replace('import.meta.env.VITE_GOOGLE_CLIENT_ID', "'test-client-id'");
const compiled = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const google = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const realFetch = globalThis.fetch;
const json = (body, status=200) => new Response(JSON.stringify(body), {status});
test.afterEach(() => { globalThis.fetch = realFetch; delete globalThis.window; });

const previewSource = readFileSync(new URL('./photos.ts',import.meta.url),'utf8')
  .replace("from './security'", `from '${securityUrl}'`);
const previewCompiled = ts.transpileModule(previewSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {createPhotoPreview} = await import('data:text/javascript;base64,'+Buffer.from(previewCompiled).toString('base64'));
test('preview rejects HTML/SVG before invoking a browser decoder',async()=>{
  await assert.rejects(createPhotoPreview(new File(['<svg onload="alert(1)"></svg>'],'x.svg',{type:'image/svg+xml'})),/形式/);
  await assert.rejects(createPhotoPreview(new File(['<html>bad</html>'],'x.png',{type:'image/png'})),/形式/);
});

test('expired token and access denial stop API access', async () => {
  for (const status of [401,403]) {
    globalThis.fetch = async () => json({error:{}},status);
    await assert.rejects(google.getDriveAccount('fake-token'), status===401 ? /有効期限/ : /権限/);
  }
});
test('network failure propagates without retrying mutations', async () => {
  let calls=0;
  globalThis.fetch = async () => { calls++;throw new TypeError('Network disconnected'); };
  await assert.rejects(google.ensureStorage('fake-token'),/Network disconnected/);
  assert.equal(calls,1);
});
test('OAuth cancellation rejects and requests only drive.file without accumulated grants',async()=>{
  globalThis.window={google:{accounts:{oauth2:{initTokenClient(config){
    assert.equal(config.scope,google.GOOGLE_SCOPE);
    assert.equal(config.include_granted_scopes,false);
    return {requestAccessToken(options){
      assert.equal(options.prompt,'select_account');
      config.error_callback({type:'popup_closed'});
    }};
  }}}}};
  await assert.rejects(google.requestGoogleAccess(),/中断/);
});
test('duplicate app-owned storage stops before any write',async()=>{
  globalThis.fetch=async (url,init)=>{
    assert.equal(init.method,undefined);
    assert.match(new URL(url).searchParams.get('q'),/appProperties has/);
    return json({files:[{id:'root1'},{id:'root2'}]});
  };
  await assert.rejects(google.ensureStorage('fake-token'),/複数/);
});
test('schema changed after connection prevents all row writes and photo uploads',async()=>{
  let calls=0;
  globalThis.fetch=async (url,init)=>{
    calls++;
    assert.equal(init.method,undefined);
    return json({values:[['unexpected-header']]});
  };
  await assert.rejects(google.saveRecord('fake-token',{spreadsheetId:'test'},
    {brandName:'石鎚',breweryName:'石鎚酒造',drinkingDate:'2026-10-15',rating:'4'},[],null),/列構造/);
  assert.equal(calls,1);
});
