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
  .replace("from './security.ts'", `from '${securityUrl}'`);
const previewCompiled = ts.transpileModule(previewSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {createPhotoPreview,sanitizePhotoForStorage} = await import('data:text/javascript;base64,'+Buffer.from(previewCompiled).toString('base64'));
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
  await assert.rejects(google.ensureStorage('fake-token'),/通信エラー/);
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
test('Google permission revocation reports both success and failure',async()=>{
  globalThis.window={google:{accounts:{oauth2:{revoke(_token,callback){callback({successful:true});}}}}};
  assert.deepEqual(await google.revokeAccess('fake-token'),{successful:true});
  globalThis.window={google:{accounts:{oauth2:{revoke(_token,callback){callback({successful:false,error:'access_denied'});}}}}};
  assert.deepEqual(await google.revokeAccess('fake-token'),{successful:false,error:'access_denied'});
  delete globalThis.window;
  assert.equal((await google.revokeAccess('fake-token')).successful,false);
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

// Stateful HTTP mock: persistent Sheets rows and private Drive files survive new tokens.
const headerSource = source.slice(source.indexOf('const TABLE_HEADERS'),source.indexOf('function extractError'));
const headers = Function(headerSource.replace(': Record<string, string[]>','')+';return TABLE_HEADERS;')();
const storage = {spreadsheetId:'test-sheet',folderId:'test-root',photoFolderId:'test-photos'};
const record = Object.fromEntries(headers.Reviews.map(k=>[k,'']));
Object.assign(record,{brandId:'sw-1',brandName:'石鎚',breweryName:'石鎚酒造',drinkingDate:'2026-10-16',rating:'4',notes:'=1+2',sakeType:'純米酒',aromaTagIds:'aroma_apple,aroma_koji',tasteTagIds:'taste_smooth,taste_rice_umami',sweetDry:'4',lightRich:'3',acidity:'2',umami:'5'});
const imageBytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const image = new File([imageBytes],'label.png',{type:'image/png'});
function mockGoogle({failTable='',afterWrite=false,dropWrite='',failUpload=false}={}) {
  const tables = Object.fromEntries(Object.entries(headers).map(([k,v])=>[k,[[...v]]]));
  const files = new Map();
  const writes = [];
  let failed=false;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input);
    assert.match(init.headers.Authorization,/^Bearer /);
    if(url.hostname==='sheets.googleapis.com'){
      const range=decodeURIComponent(url.pathname.split('/values/')[1]||'');
      const table=range.match(/^'([^']+)'/)?.[1];
      assert.ok(tables[table], 'unexpected table');
      if(init.method==='POST'){
        assert.equal(url.searchParams.get('valueInputOption'),'RAW');
        const values=JSON.parse(init.body).values;
        writes.push(table);
        if(table===failTable && !failed && !afterWrite){failed=true;throw new TypeError('Network lost');}
        if(table!==dropWrite)tables[table].push(...values);
        if(table===failTable && !failed && afterWrite){failed=true;throw new TypeError('Response lost after commit');}
        return json({updates:{updatedRows:1}});
      }
      return json({values:range.endsWith('AZ1')?[tables[table][0]]:tables[table]});
    }
    if(url.pathname.endsWith('/generateIds'))return json({ids:['reserved-photo']});
    if(url.hostname==='www.googleapis.com' && url.pathname==='/upload/drive/v3/files'){
      const multipart=await init.body.text();
      const meta=JSON.parse(multipart.split('\r\n\r\n')[1].split('\r\n--')[0]);
      assert.deepEqual(meta.parents,['test-photos']);
      assert.equal(meta.appProperties.sakefolioKind,'photo');
      assert.equal(files.has(meta.id),false,'must never duplicate an upload');
      files.set(meta.id,{...meta,mimeType:'image/png',trashed:false});writes.push('Drive');
      if(failUpload&&!failed){failed=true;throw new TypeError('Upload response lost');}
      return json({id:meta.id});
    }
    if(url.pathname==='/drive/v3/files')return json({files:[...files.keys()].map(id=>({id}))});
    const id=decodeURIComponent(url.pathname.split('/').at(-1));
    if(!files.has(id))return json({},404);
    return url.searchParams.get('alt')==='media'?new Response(imageBytes,{headers:{'Content-Type':'image/png'}}):json(files.get(id));
  };
  return {tables,files,writes};
}
test('empty collection and save without photo roundtrip using a new token',async()=>{
  const state=mockGoogle();
  assert.deepEqual(await google.loadRecords('first',storage),[]);
  await google.saveRecord('first',storage,record,[],null,{reviewId:'no-photo'});
  assert.equal(state.tables.Reviews.length,2);
  assert.equal(state.tables.Bottles.length,2);
  assert.equal(state.tables.Photos.length,1);
  const saved=await google.loadRecords('relogin',storage);
  assert.equal(saved[0].notes,'=1+2');
  assert.equal(saved[0].aromaTagIds,'aroma_apple,aroma_koji');
  assert.equal(saved[0].tasteTagIds,'taste_smooth,taste_rice_umami');
  assert.equal(saved[0].sweetDry,'4');
  assert.equal(saved[0].lightRich,'3');
  assert.equal(saved[0].acidity,'2');
  assert.equal(saved[0].umami,'5');
  assert.equal(saved[0].photoId,'');
});
test('photo save links Reviews, Photos and private Drive; new login can retrieve bytes',async()=>{
  const state=mockGoogle();
  await google.saveRecord('first',storage,record,[],image,{reviewId:'with-photo'});
  const saved=await google.loadRecords('new-login',storage);
  assert.equal(saved[0].photoId,'reserved-photo');
  assert.equal(state.tables.Photos[1][1],saved[0].reviewId);
  assert.equal(state.tables.Photos[1][2],saved[0].photoId);
  assert.deepEqual(new Uint8Array(await (await google.getPhotoBlob('new-login',saved[0].photoId)).arrayBuffer()),imageBytes);
  assert.match(await google.inspectStorage('new-login',storage),/未紐付け画像 0件/);
});
for(const afterWrite of [false,true])test('partial Reviews failure reconciles '+(afterWrite?'lost response':'failed write')+' without duplicate rows/uploads',async()=>{
  const state=mockGoogle({failTable:'Reviews',afterWrite});
  const attempt={reviewId:'retry-review-'+afterWrite};
  await assert.rejects(google.saveRecord('first',storage,record,[],image,attempt),/飲酒記録保存.*通信エラー/);
  await google.saveRecord('renewed',storage,record,[],image,attempt);
  assert.equal(state.tables.Reviews.length,2);
  assert.equal(state.tables.Photos.length,2);
  assert.equal(state.tables.Bottles.length,2);
  assert.equal(state.writes.filter(w=>w==='Drive').length,1);
});
test('lost upload response reuses reserved Drive ID on retry',async()=>{
  const state=mockGoogle({failUpload:true});const attempt={reviewId:'retry-upload'};
  await assert.rejects(google.saveRecord('first',storage,record,[],image,attempt),/写真アップロード/);
  assert.match(await google.inspectStorage('first',storage),/未紐付け画像 1件/);
  await google.saveRecord('first',storage,record,[],image,attempt);
  assert.equal(state.writes.filter(w=>w==='Drive').length,1);
  assert.equal(state.tables.Reviews.length,2);
});
test('write success response without persisted row never reports success',async()=>{
  const state=mockGoogle({dropWrite:'Reviews'});
  await assert.rejects(google.saveRecord('first',storage,record,[],null,{reviewId:'lost'}),/書き込み結果を確認できません/);
  assert.equal(state.tables.Reviews.length,1);
});
test('repeated same brand creates independent drinking records',async()=>{
  const state=mockGoogle();
  await google.saveRecord('first',storage,record,[],null,{reviewId:'drink-1'});
  await google.saveRecord('first',storage,record,[],null,{reviewId:'drink-2'});
  assert.equal(state.tables.Reviews.length,3);
  assert.equal((await google.loadRecords('first',storage)).length,2);
});
test('rapid double save is blocked by the synchronous operation lock',async()=>{
  const state=mockGoogle();const attempt={reviewId:'double'};
  const saving=google.saveRecord('first',storage,record,[],null,attempt);
  await assert.rejects(google.saveRecord('first',storage,record,[],null,attempt),/保存処理中/);
  await saving;
  assert.equal(state.tables.Reviews.length,2);
});
test('photo errors distinguish 401, 403, 404, network and invalid bytes without exposing API bodies',async()=>{
  for(const [status,pattern] of [[401,/有効期限/],[403,/権限/],[404,/存在しない/],[500,/HTTP 500/]]){
    globalThis.fetch=async()=>json({error:{message:'PRIVATE-CONTENT'}},status);
    await assert.rejects(google.getPhotoBlob('secret','id'),error=>pattern.test(error.message)&&!error.message.includes('PRIVATE-CONTENT'));
  }
  globalThis.fetch=async()=>{throw new TypeError('secret');};
  await assert.rejects(google.getPhotoBlob('secret','id'),/通信エラー/);
  globalThis.fetch=async(input)=>{
    const url=new URL(input);
    if(url.searchParams.get('alt')==='media')return new Response('<html>invalid</html>');
    return json({id:'id',mimeType:'image/png',parents:['test-photos'],
      appProperties:{sakefolioApp:'sakefolio-react-v1',sakefolioKind:'photo'}});
  };
  await assert.rejects(google.getPhotoBlob('secret','id'),/未対応/);
});
test('invalid file is rejected before any network mutation',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not reach');};
  await assert.rejects(google.saveRecord('first',storage,record,[],new File(['bad'],'a.jpg'),{reviewId:'invalid'}),/形式/);
  assert.equal(calls,0);
});
test('read-only diagnostics identifies unlinked photo rows, missing files and incomplete bottles',async()=>{
  const state=mockGoogle();
  state.tables.Photos.push(['orphan-row','no-review','missing-file']);
  state.tables.Bottles.push(['orphan-bottle']);
  assert.match(await google.inspectStorage('first',storage),/写真ファイル不足 1件.*記録未完了の写真情報 1件.*未紐付け商品 1件/);
  assert.deepEqual(state.writes,[]);
});

test('preview normalizes HEIC using Safari image fallback and closes object URL',async()=>{
  const old={createImageBitmap:globalThis.createImageBitmap,Image:globalThis.Image,document:globalThis.document};
  let drawn=false;
  globalThis.createImageBitmap=async()=>{throw new Error('unsupported HEIC bitmap');};
  globalThis.Image=class {naturalWidth=3200;naturalHeight=2400;async decode(){}};
  globalThis.document={createElement(){return {getContext(){return {drawImage(){drawn=true;}};},toBlob(cb,type){assert.equal(type,'image/png');cb(new Blob([imageBytes],{type}));}};}};
  try{
    const heic=new File([Buffer.from('0000ftypheic0000')],'a.heic',{type:'image/heic'});
    const portable=await createPhotoPreview(heic);
    assert.equal(portable.type,'image/png');assert.equal(drawn,true);
  } finally {Object.assign(globalThis,old);}
});
test('photo persistence re-encodes the image and drops embedded metadata',async()=>{
  const old={createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};
  globalThis.createImageBitmap=async()=>({width:800,height:600,close(){}});
  globalThis.document={createElement(){return {getContext(){return {drawImage(){}};},toBlob(cb,type){
    assert.equal(type,'image/png');cb(new Blob([imageBytes],{type}));
  }};}};
  const source=new File([new Uint8Array([0xff,0xd8,0xff,...Buffer.from('EXIF-SECRET-LOCATION')])],'photo.jpg',{type:'image/jpeg'});
  try{
    const sanitized=await sanitizePhotoForStorage(source);
    assert.equal(sanitized.type,'image/png');
    assert.equal(sanitized.name,'sakefolio-label.png');
    assert.equal((await sanitized.text()).includes('EXIF-SECRET-LOCATION'),false);
    assert.deepEqual(new Uint8Array(await sanitized.arrayBuffer()),imageBytes);
  }finally{Object.assign(globalThis,old);}
});
test('corrupted raster and unsupported HEIC stop before a preview can be saved',async()=>{
  const old={createImageBitmap:globalThis.createImageBitmap,Image:globalThis.Image};
  globalThis.createImageBitmap=async()=>{throw new Error('bad pixels');};
  globalThis.Image=class {async decode(){throw new Error('bad pixels');}};
  try {await assert.rejects(createPhotoPreview(image),/JPEGまたはPNG/);}
  finally {Object.assign(globalThis,old);}
});
test('conflicting persisted ID is never overwritten',async()=>{
  const state=mockGoogle();const attempt={reviewId:'immutable'};
  await google.saveRecord('first',storage,record,[],null,attempt);
  const count=state.writes.length;
  await assert.rejects(google.saveRecord('first',storage,{...record,notes:'changed'},[],null,attempt),/一致しません/);
  assert.equal(state.writes.length,count);
});
test('manual brand retry reconciles a committed row after losing its response',async()=>{
  const state=mockGoogle({failTable:'Brands',afterWrite:true});const attempt={reviewId:'manual'};
  const manual={...record,brandId:''};
  await assert.rejects(google.saveRecord('first',storage,manual,[],null,attempt),/銘柄保存/);
  await google.saveRecord('first',storage,manual,[],null,attempt);
  assert.equal(state.tables.Brands.length,2);assert.equal(state.tables.Reviews.length,2);
});
test('retry after successful persistence and failed UI refresh keeps exactly one review',async()=>{
  const state=mockGoogle();const attempt={reviewId:'refresh-retry'};
  await google.saveRecord('first',storage,record,[],null,attempt);
  // UI refresh can fail after all mutations. Repeating the same attempt must be read-only.
  const writes=state.writes.length;
  await google.saveRecord('renewed',storage,record,[],null,attempt);
  assert.equal(state.tables.Reviews.length,2);
  assert.equal(state.writes.length,writes);
});

test('getPhotoBlob refuses non-Sakefolio IDs without downloading file bytes',async()=>{
 let accessedMedia=false;
 globalThis.fetch=async(input)=>{
   const u=new URL(input);
   if(u.searchParams.get('alt')==='media'){accessedMedia=true;return new Response(imageBytes);}
   return json({id:u.pathname.split('/').at(-1),mimeType:'image/png',parents:['test-photos'],
     appProperties:{sakefolioApp:'other-app',sakefolioKind:'photo'}});
 };
 await assert.rejects(google.getPhotoBlob('fake-token','wrong-photo-id','test-photos'),/管理する写真ではありません/);
 assert.equal(accessedMedia,false);
});
test('getPhotoBlob enforces the expected app-owned photo folder and safe MIME',async()=>{
 let contentRead=false;
 const meta={id:'private-photo-id',mimeType:'image/png',parents:['other-folder'],
   appProperties:{sakefolioApp:'sakefolio-react-v1',sakefolioKind:'photo'}};
 globalThis.fetch=async(input)=>{
   const u=new URL(input);
   if(u.searchParams.get('alt')==='media'){contentRead=true;return new Response(imageBytes);}
   return json(meta);
 };
 await assert.rejects(google.getPhotoBlob('fake-token',meta.id,'test-photos'),/管理する写真ではありません/);
 assert.equal(contentRead,false);
 meta.parents=['test-photos'];meta.mimeType='image/svg+xml';
 await assert.rejects(google.getPhotoBlob('fake-token',meta.id,'test-photos'),/MIMEタイプ/);
 assert.equal(contentRead,false);
 meta.mimeType='image/png';
 assert.deepEqual(new Uint8Array(await (await google.getPhotoBlob('fake-token',meta.id,'test-photos')).arrayBuffer()),imageBytes);
 assert.equal(contentRead,true);
});

test('OAuth revoke never reports success if GIS callback does not arrive',async()=>{
 const old=globalThis.setTimeout;
 globalThis.window={google:{accounts:{oauth2:{revoke(){ /* no callback */ }}}}};
 globalThis.setTimeout=(cb)=>{queueMicrotask(cb);return 1;};
 try{
  const result=await google.revokeAccess('fake-token');
  assert.equal(result.successful,false);
  assert.equal(result.error,'timeout');
 }finally{globalThis.setTimeout=old;}
});
