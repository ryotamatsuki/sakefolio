import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const securityUrl=new URL('./security.ts',import.meta.url).href;
const localUrl=new URL('./internationalLocal.ts',import.meta.url).href;
const compile=(source,replacements=[])=>{
  for(const [from,to] of replacements)source=source.replace(from,to);
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
};
const googleSource=readFileSync(new URL('./google.ts',import.meta.url),'utf8');
const photosSource=readFileSync(new URL('./photos.ts',import.meta.url),'utf8');
const photosUrl=compile(photosSource.replace("from './security.ts'",`from '${securityUrl}'`));
const cloudSource=readFileSync(new URL('./internationalCloud.ts',import.meta.url),'utf8');
async function cloudForMode(mode){
  const googleUrl=compile(googleSource.replace("from './security'",`from '${securityUrl}'`)
    .replace('import.meta.env.VITE_GOOGLE_CLIENT_ID',"'test-client-id'")
    .replace("import.meta.env.VITE_SAKEFOLIO_SECURITY_TEST === '20261019'",mode?'true':'false'));
  const cloudUrl=compile(cloudSource,[
    ["from './google.ts'",`from '${googleUrl}'`],
    ["from './photos.ts'",`from '${photosUrl}'`],
    ["from './internationalLocal.ts'",`from '${localUrl}'`]
  ]);
  return import(cloudUrl);
}
const normal=await cloudForMode(false);
const sandbox=await cloudForMode(true);
const {CHINA_HEADERS}=normal;
const real={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};
test.afterEach(()=>Object.assign(globalThis,real));

const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const storage={spreadsheetId:'test-sheet',folderId:'test-folder',photoFolderId:'test-photos'};
const makeRecord=()=>({
  id:'123e4567-e89b-12d3-a456-426614174000',kind:'baijiu',brandName:'茅台',productName:'商品A',
  producer:'',region:'貴州省',country:'中国',sourceUrl:'',attributes:{},experience:'catalogued',
  tastedAt:'',rating:'',aroma:'',taste:'',notes:'',createdAt:'2026-10-18T00:00:00.000Z',photo:null
});

test('a cancelled China save cannot start the next Sheets request',async()=>{
  const controller=new AbortController();const calls=[];
  globalThis.fetch=async(input)=>{
    calls.push(String(input));controller.abort();
    return new Response(JSON.stringify({sheets:[{properties:{sheetId:1,title:'ChinaDrinks'}}]}));
  };
  await assert.rejects(normal.saveChinaCloud('fake-token',storage,makeRecord(),null,controller.signal),{name:'AbortError'});
  assert.equal(calls.length,1,'must stop before the header read or any write');
});

for(const mode of [false,true])for(const writeBeforeLostResponse of [false,true])test('ChinaDrinks '+(mode?'sandbox':'normal')+' retry after '+(writeBeforeLostResponse?'committed response loss':'pre-write network failure')+' reuses one photo',async()=>{
  const rows=[[...CHINA_HEADERS]];const files=new Map();let uploads=0,appends=0,failed=false;
  globalThis.createImageBitmap=async()=>({width:800,height:600,close(){}});
  globalThis.document={createElement(){return {getContext(){return {drawImage(){}};},toBlob(cb,type){cb(new Blob([png],{type}));}};}};
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input);
    if(url.hostname==='sheets.googleapis.com'){
      if(url.pathname==='/v4/spreadsheets/test-sheet')return new Response(JSON.stringify({sheets:[{properties:{sheetId:1,title:'ChinaDrinks'}}]}));
      if(url.pathname.includes('/values/')){
        const range=decodeURIComponent(url.pathname.split('/values/')[1]);
        if(range.includes(':append')){
          appends++;
          const pendingRows=JSON.parse(init.body).values;
          if(!failed){
            failed=true;
            if(writeBeforeLostResponse)rows.push(...pendingRows);
            throw new TypeError('Network disconnected');
          }
          rows.push(...pendingRows);
          return new Response(JSON.stringify({updates:{updatedRows:1}}));
        }
        return new Response(JSON.stringify({values:range.endsWith('A1:Q1')?[rows[0]]:rows}));
      }
    }
    if(url.hostname==='www.googleapis.com'&&url.pathname==='/drive/v3/files/generateIds')
      return new Response(JSON.stringify({ids:['reserved-photo-id']}));
    if(url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'){
      const body=await init.body.text();
      assert.equal(body.includes('EXIF-SECRET-LOCATION'),false);
      const meta=JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0]);
      assert.equal(meta.id,'reserved-photo-id');
      assert.deepEqual(meta.parents,['test-photos']);
      assert.equal(meta.appProperties.sakefolioApp,mode?'sakefolio-security-test-20261019-v1':'sakefolio-react-v1');
      files.set(meta.id,{...meta,mimeType:'image/png',trashed:false});uploads++;
      return new Response(JSON.stringify({id:meta.id}));
    }
    if(url.hostname==='www.googleapis.com'&&url.pathname.startsWith('/drive/v3/files/')){
      const id=decodeURIComponent(url.pathname.split('/').at(-1));
      const metadata=files.get(id);
      if(!metadata)return new Response('{}',{status:404});
      if(url.searchParams.get('alt')==='media')return new Response(png,{headers:{'Content-Type':'image/png'}});
      return new Response(JSON.stringify(metadata));
    }
    throw new Error('Unexpected test request: '+url.hostname+url.pathname);
  };
  const photo=new File([new Uint8Array([0xff,0xd8,0xff,...Buffer.from('EXIF-SECRET-LOCATION')])],'photo.jpg',{type:'image/jpeg'});
  const record=makeRecord();
  const saveChinaCloud=mode?sandbox.saveChinaCloud:normal.saveChinaCloud;
  await assert.rejects(saveChinaCloud('fake-token',storage,record,photo),/Network disconnected/);
  assert.equal(record.photoId,'reserved-photo-id');
  await saveChinaCloud('fake-token',storage,record,photo);
  assert.equal(rows.length,2);
  assert.equal(rows[1][0],record.id);
  assert.equal(rows[1][16],'reserved-photo-id');
  assert.equal(uploads,1);
  assert.equal(appends,writeBeforeLostResponse?1:2);
});
