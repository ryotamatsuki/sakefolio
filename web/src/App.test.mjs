import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';

const require=createRequire(import.meta.url),moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=source=>moduleUrl(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const storage={folderId:'fake-root',photoFolderId:'fake-photos',spreadsheetId:'fake-sheet'};
let fault='',first=true,release,entered,calls=[],rows=new Map(),files=new Map();
const services={GOOGLE_CLIENT_ID:'fake-client',SECURITY_TEST_MODE:false,
  requestGoogleAccess:async()=>'fake-only',getDriveAccount:async()=>({emailAddress:'qa@example.invalid'}),ensureStorage:async()=>storage,
  loadManualBrands:async()=>[],loadRecords:async()=>[...rows.values()],getPhotoBlob:async()=>new Blob(),inspectStorage:async()=>'',
  revokeAccess:async()=>({successful:true}),
  saveRecord:async(_token,_storage,entry,_brands,photo,attempt,signal)=>{
    calls.push({attempt,signal});attempt.photoFileId||='fake-photo';
    if(first&&fault==='before'){first=false;throw Error('Controlled network failure');}
    rows.set(attempt.reviewId,{...entry,reviewId:attempt.reviewId,photoId:photo?attempt.photoFileId:''});
    if(photo)files.set(attempt.photoFileId,attempt.reviewId);
    if(first&&fault==='after'){first=false;throw Error('Controlled lost response');}
    if(first&&fault==='logout'){first=false;entered();await new Promise(resolve=>{release=resolve;});}
    return attempt.reviewId;
  }};
globalThis.__sakefolioP0AppServices=services;
const googleUrl=moduleUrl('export const {GOOGLE_CLIENT_ID,SECURITY_TEST_MODE,requestGoogleAccess,getDriveAccount,ensureStorage,loadManualBrands,loadRecords,getPhotoBlob,inspectStorage,revokeAccess,saveRecord}=globalThis.__sakefolioP0AppServices;');
let source=readFileSync(new URL('./App.tsx',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'");
const iconNames=source.match(/import\s*\{([^}]+)\}\s*from 'lucide-react'/s)[1].split(',').map(x=>x.trim()).filter(Boolean);
const icons=moduleUrl(iconNames.map(n=>'export const '+n+'=()=>null;').join('\n'));
const empty=moduleUrl('export default function Component(){return null;}');
const auth=moduleUrl('export const broadcastAuthSessionSignal=()=>{},recordAuthAuditEvent=()=>{},listenForAuthSessionSignals=()=>()=>{};');
const photos=moduleUrl('export const createPhotoPreview=async()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:"image/png"});');
const catalog=compile(readFileSync(new URL('./catalog.ts',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'"));
for(const [name,url] of Object.entries({react:pathToFileURL(require.resolve('react')).href,'lucide-react':icons,
  './google':googleUrl,'./authSession':auth,'./photos':photos,'./catalog':catalog,
  './BreweryMap':empty,'./TasteDashboard':empty,'./InternationalDrinks':empty,
  './deploymentMode':new URL('./deploymentMode.ts',import.meta.url).href,
  './security':new URL('./security.ts',import.meta.url).href,'./sensory':new URL('./sensory.ts',import.meta.url).href,
  './saveAttemptJournal':new URL('./saveAttemptJournal.ts',import.meta.url).href
}))source=source.replaceAll("from '"+name+"'","from '"+url+"'");
let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
js=js.replace('from "react/jsx-runtime"',`from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`);
const {default:App}=await import(moduleUrl(js));
const realFetch=globalThis.fetch,realWindow=globalThis.window;
test.beforeEach(()=>{fault='';first=true;calls=[];rows=new Map();files=new Map();globalThis.window={scrollTo(){}};globalThis.fetch=async()=>new Response('[]');});
test.afterEach(()=>{globalThis.fetch=realFetch;if(realWindow===undefined)delete globalThis.window;else globalThis.window=realWindow;});
const text=tree=>JSON.stringify(tree.toJSON());
const button=(tree,label)=>tree.root.findAllByType('button').find(n=>n.children.some(c=>typeof c==='string'&&c.includes(label)));
async function connect(tree){await act(async()=>{await button(tree,'Googleで始める').props.onClick();});}
async function fill(tree){await act(async()=>{button(tree,'日本酒を記録する').props.onClick();});await act(async()=>{
  tree.root.findByProps({placeholder:'酒蔵名を入力して候補を選択'}).props.onChange({target:{value:'UXTEST-fake'}});
  tree.root.findByProps({placeholder:'例：石鎚'}).props.onChange({target:{value:'UXTEST-fake'}});
  tree.root.findByProps({'aria-label':'4点'}).props.onClick();
  tree.root.findByProps({'aria-label':'日本酒ラベル写真を選ぶ'}).props.onChange({target:{files:[new File(['synthetic'],'fake.png',{type:'image/png'})]}});
});}
for(const position of ['before','after'])test('P0 Japanese UI '+position+' failure never claims success and retry uses the same attempt/photo',async()=>{
  fault=position;let tree;await act(async()=>{tree=create(React.createElement(App));});
  try{await connect(tree);await fill(tree);
    await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
    assert.match(text(tree),/入力内容を保持/);assert.doesNotMatch(text(tree),/記録を保存しました/);
    assert.equal(rows.size,position==='after'?1:0);assert.equal(files.size,position==='after'?1:0);
    await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
    assert.match(text(tree),/記録を保存しました/);assert.equal(rows.size,1);assert.equal(files.size,1);
    assert.equal(calls[0].attempt.reviewId,calls[1].attempt.reviewId);
  }finally{await act(async()=>tree.unmount());}
});
test('P0-B3 Japanese UI logout/reconnect ignores a late committed save completion',async()=>{
  fault='logout';let tree,pending;const reached=new Promise(resolve=>{entered=resolve;});
  await act(async()=>{tree=create(React.createElement(App));});
  try{await connect(tree);await fill(tree);
    await act(async()=>{pending=tree.root.findByType('form').props.onSubmit({preventDefault(){}});});await reached;
    await act(async()=>tree.root.findByProps({className:'account-button'}).props.onClick());
    await act(async()=>button(tree,'接続を解除').props.onClick());
    assert.equal(calls[0].signal.aborted,true);assert.match(text(tree),/未完了/);
    await connect(tree);const before=text(tree);
    await act(async()=>{release();await pending;});
    assert.equal(text(tree),before,'old completion must not overwrite the reconnected UI');
    assert.equal(rows.size,1);assert.equal(files.size,1);
  }finally{await act(async()=>tree.unmount());}
});
