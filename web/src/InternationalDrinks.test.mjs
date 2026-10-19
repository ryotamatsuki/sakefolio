import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const emptyComponent=moduleUrl('export default function Component(){return null;}');
let saved=[],failSave=true,finishSave;
const services={
  listInternationalRecords:async()=>[],buildBackup:async()=>new Blob(),restoreBackup:async()=>({added:0,duplicates:0}),saveInternationalRecord:async()=>{},
  loadChinaCloud:async()=>[],getPhotoBlob:async()=>new Blob(),
  saveChinaCloud:async(_token,_storage,record,photo,signal)=>{
    saved.push({record,photo,signal});record.photoId||='reserved-photo-id';
    if(finishSave)await new Promise(resolve=>{finishSave.resolve=resolve;});
    if(failSave)throw Error('HTTP 401');
  }
};
// Transpile the real component; replace only external I/O, not its state handlers.
const serviceKey='__sakefolioChinaComponentTestServices';
globalThis[serviceKey]=services;
const servicesUrl=moduleUrl(`const s=globalThis.${serviceKey}; export const {listInternationalRecords,buildBackup,restoreBackup,saveInternationalRecord,loadChinaCloud,getPhotoBlob,saveChinaCloud}=s;`);
const icons=moduleUrl('export const ArrowRight=()=>null,BookOpen=()=>null,Camera=()=>null,Download=()=>null,ExternalLink=()=>null,Info=()=>null,MapPin=()=>null,Search=()=>null,ShieldCheck=()=>null,Upload=()=>null,Wine=()=>null,X=()=>null;');
let source=readFileSync(new URL('./InternationalDrinks.tsx',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'");
for(const [name,url] of Object.entries({
  react:pathToFileURL(require.resolve('react')).href,
  'lucide-react':icons,'./internationalLocal':servicesUrl,'./google':servicesUrl,'./internationalCloud':servicesUrl,
  './InternationalProducerMap':emptyComponent,'./InternationalInsights':emptyComponent,
  ...Object.fromEntries(['internationalCatalog','internationalMaster','internationalOsm','internationalSensory','requestGate'].map(n=>['./'+n,new URL('./'+n+'.ts',import.meta.url).href]))
}))source=source.replaceAll("from '"+name+"'","from '"+url+"'");
let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
js=js.replace('from "react/jsx-runtime"',`from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`);
const {default:InternationalDrinks}=await import(moduleUrl(js));
const realFetch=globalThis.fetch;
test.beforeEach(()=>{saved=[];failSave=true;finishSave=null;globalThis.fetch=async()=>new Response('{}');});
test.afterEach(()=>{globalThis.fetch=realFetch;});
const storage={spreadsheetId:'test-sheet',folderId:'test-root',photoFolderId:'test-photos'};
const props=draft=>({token:'fake-token',storage,accountEmail:'qa@example.invalid',pendingCloudSave:draft,onConnect(){}});
async function mount(draft,overrides={}){let tree;await act(async()=>{tree=create(React.createElement(InternationalDrinks,{...props(draft),...overrides}));});return tree;}
async function fill(tree){await act(async()=>{
  tree.root.findByProps({placeholder:'商品に記載された銘柄名'}).props.onChange({target:{value:'UXTEST-retry'}});
  tree.root.findByProps({placeholder:'正式な商品名'}).props.onChange({target:{value:'same product'}});
});}
async function submit(tree){await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});}

test('China retry preserves the same draft, record ID and photo ID across reauthentication/remount',async()=>{
  const draft={current:null};let tree=await mount(draft);
  try{
    await fill(tree);await submit(tree);
    const original=saved[0].record;
    await act(async()=>tree.unmount());tree=await mount(draft);
    assert.equal(tree.root.findByProps({placeholder:'正式な商品名'}).props.value,'same product');
    failSave=false;await submit(tree);
    assert.equal(saved[1].record.id,original.id);
    assert.equal(saved[1].record.photoId,'reserved-photo-id');
    assert.equal(draft.current,null);
  }finally{await act(async()=>tree.unmount());}
});

test('leaving the China page aborts the active save and retains its uncertain attempt',async()=>{
  const draft={current:null},tree=await mount(draft);let pending;
  await fill(tree);finishSave={};
  await act(async()=>{pending=tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  await act(async()=>tree.unmount());
  try{
    assert.equal(saved[0].signal?.aborted,true);
    assert.equal(draft.current?.record.id,saved[0].record.id);
  }finally{finishSave.resolve();await pending;}
});

test('an unconnected or different account view cannot resume another account draft',async()=>{
  const draft={current:null};let tree=await mount(draft);
  await fill(tree);await submit(tree);await act(async()=>tree.unmount());
  const pending=draft.current;
  for(const overrides of [{token:'',storage:null,accountEmail:''},{accountEmail:'other@example.invalid'}]){
    tree=await mount(draft,overrides);
    try{
      assert.equal(tree.root.findByProps({placeholder:'正式な商品名'}).props.value,'');
      assert.equal(draft.current,pending);
    }finally{await act(async()=>tree.unmount());}
  }
});
