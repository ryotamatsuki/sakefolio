import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const securityUrl=new URL('./security.ts',import.meta.url).href;
const source=readFileSync(new URL('./japanBackup.ts',import.meta.url),'utf8')
 .replace("from './security'", "from '"+securityUrl+"'");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {buildJapanBackup,readJapanBackup}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const fields=['reviewId','brandId','brandName','breweryName','prefecture','municipality',
 'breweryAddress','productName','sakeType','sakeTypeOther','brewingMethod','heatTreatment',
 'processingStyles','riceVariety','polishingRatio','alcoholPercent','vintage','drinkingDate',
 'rating','aromaTagIds','tasteTagIds','sweetDry','lightRich','acidity','umami','notes','photoId','createdAt'];
const item=()=>Object.assign(Object.fromEntries(fields.map(k=>[k,''])),{
 reviewId:'123e4567-e89b-12d3-a456-426614174001',
 brandName:'石鎚',breweryName:'石鎚酒造',drinkingDate:'2026-10-18',rating:'5',
 createdAt:'2026-10-18T00:00:00Z',photoId:'photo-1',notes:'良い'
});
const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'});
test('Japanese backup includes portable photo and validates before restore',async()=>{
 const blob=await buildJapanBackup([item()],async()=>png);
 const archive=new File([blob],'backup.json',{type:'application/json'});
 const records=await readJapanBackup(archive);
 assert.equal(records.length,1);
 assert.equal(records[0].record.brandName,'石鎚');
 assert.deepEqual(new Uint8Array(await records[0].photo.arrayBuffer()),new Uint8Array(await png.arrayBuffer()));
 assert.equal(JSON.stringify(await blob.text()).includes('secret-access-token'),false);
});
test('Japanese backup rejects malformed records, unsafe images and duplicated IDs',async()=>{
 const x=item();
 const file=new File([JSON.stringify({format:'sakefolio-japan-v1',items:[{record:x,photoData:null},{record:x,photoData:null}]})],'test.json');
 await assert.rejects(readJapanBackup(file),/重複ID/);
 const evil=new File([JSON.stringify({format:'sakefolio-japan-v1',items:[{record:x,photoMime:'image/png',
  photoData:btoa('<svg onload="alert(1)"></svg>')}]})],'test.json');
 await assert.rejects(readJapanBackup(evil),/形式/);
});
