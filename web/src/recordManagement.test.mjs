import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRecords,sameProductHistory} from './recordArchive.ts';
import {listTrash,moveToTrash,restoreFromTrash} from './trash.ts';

test('CSV export neutralises spreadsheet formulas and preserves Japanese Unicode',()=>{
 const csv=csvRecords([{name:'=HYPERLINK("evil")',notes:'純米酒,\n美味しい',rating:'5'},
   {name:'-1+2',notes:'"quoted"',rating:'4'}]);
 assert.ok(csv.startsWith('\ufeff'));
 assert.match(csv,/"'=HYPERLINK/);
 assert.match(csv,/"'\-1\+2"/);
 assert.match(csv,/純米酒/);
 assert.match(csv,/"quoted"/);
});
test('repeat-drink history excludes current record and unrelated products',()=>{
 const x=[
 {id:'1',brandName:'A',productName:'B',rating:'5',createdAt:'2026-01-01'},
 {id:'2',brandName:'A',productName:'B',rating:'3',createdAt:'2026-06-01'},
 {id:'3',brandName:'X',productName:'B',rating:'5',createdAt:'2026-07-01'}];
 assert.deepEqual(sameProductHistory(x,x[0]).map(v=>v.id),['2']);
});
test('cloud Trash hides and restores without touching original drink rows or photos',async()=>{
 const original=globalThis.fetch;
 const rows=[];let exists=false;const calls=[];
 const response=(body)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(input,init={})=>{
   const u=new URL(input);calls.push({path:u.pathname,method:init.method||'GET'});
   if(u.pathname.endsWith('/test-sheet')&&init.method!=='POST')
     return response({sheets:exists?[{properties:{title:'SakefolioTrash'}}]:[]});
   if(u.pathname.endsWith(':batchUpdate')){exists=true;return response({replies:[{}]});}
   if(u.pathname.includes('/values/')){
     const range=decodeURIComponent(u.pathname.split('/values/')[1]);
     if(init.method==='PUT'){rows[0]=JSON.parse(init.body).values[0];return response({updatedCells:3});}
     if(init.method==='POST'&&range.includes(':append')){
       rows.push(JSON.parse(init.body).values[0]);return response({updates:{updatedRows:1}});
     }
     if(init.method==='POST'&&range.includes(':clear')){
       const index=Number(range.match(/A(\d+)/)?.[1])-1;
       rows[index]=[];return response({clearedRange:range});
     }
     if(range.endsWith('A1:C1'))return response({values:rows.length?[rows[0]]:[]});
     return response({values:rows});
   }
   throw Error('Unexpected request: '+u.href);
 };
 const storage={spreadsheetId:'test-sheet',photoFolderId:'photos',folderId:'root'};
 try{
   assert.deepEqual(await listTrash('test',storage),[]);
   await moveToTrash('test',storage,'japan','review-a');
   await moveToTrash('test',storage,'japan','review-a');
   assert.equal((await listTrash('test',storage)).length,1);
   await restoreFromTrash('test',storage,'japan','review-a');
   assert.deepEqual(await listTrash('test',storage),[]);
   assert.equal(calls.filter(c=>c.method==='POST'&&c.path.includes('append')).length,1);
   assert.equal(calls.some(c=>c.path.includes('Reviews')||c.path.includes('Photos')),false);
 }finally{globalThis.fetch=original;}
});
