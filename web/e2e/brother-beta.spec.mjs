// Synthetic Google protocol fixtures only. These tests do NOT certify live Google OAuth or a real iPhone.
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const HEAD={
 Brands:['brandId','brandName','breweryName','prefecture','breweryId','areaId','source','sakenowaBrandId','createdAt','updatedAt','municipality','breweryAddress'],
 Bottles:['bottleId','brandId','productName','sakeType','processingStyle','riceVariety','polishingRatio','alcoholPercent','vintage','notes','createdAt','updatedAt','sakeTypeOther','brewingMethod','heatTreatment'],
 Reviews:['reviewId','brandId','bottleId','drinkingDate','rating','aromaTagIds','tasteTagIds','sweetDry','lightRich','acidity','umami','comment','drinkingPlace','priceJPY','createdAt','updatedAt','brandName','breweryName','prefecture','municipality','breweryAddress','productName','sakeType','sakeTypeOther','brewingMethod','heatTreatment','processingStyles','riceVariety','polishingRatio','alcoholPercent','vintage','photoId'],
 Photos:['photoId','reviewId','imageFile','photoType','caption','capturedAt','aiStatus'],
 Tags:['tagId','category','tagGroup','tagLabel','displayOrder','isActive'],
 Wishlist:['wishlistId','brandId','bottleId','wishNote','priority','status','addedAt','updatedAt'],
 SakefolioTrash:['kind','recordId','deletedAt']
};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDAAAAABJRU5ErkJggg==','base64');
async function fixture(page,{loseReviewResponse=false}={}){
 const states=Object.fromEntries(['A','B'].map(account=>[account,{tables:structuredClone(Object.fromEntries(Object.entries(HEAD).map(([k,h])=>[k,[h]]))),photos:new Map(),reserved:0}]));
 let lost=false;
 await page.addInitScript(()=>{window.__testAccount='A';});
 await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:(config)=>({requestAccessToken:()=>config.callback({access_token:'synthetic-'+window.__testAccount})}),revoke:(_token,callback)=>callback({successful:true})}}};`}));
 await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|tile\.openstreetmap\.org)\/.*$/,route=>route.fulfill({status:200,contentType:'text/css',body:''}));
 const routeApi=async route=>{
  const req=route.request(),u=new URL(req.url()),account=req.headers().authorization?.replace('Bearer synthetic-',''),state=states[account];
  if(!state)return route.fulfill({status:401,json:{}});
  const reply=(json,status=200)=>route.fulfill({status,json});
  if(u.hostname==='sheets.googleapis.com'){
   expect(u.pathname).toContain('sheet-'+account);
   if(!u.pathname.includes('/values/'))return reply({sheets:Object.keys(HEAD).map((title,sheetId)=>({properties:{title,sheetId}}))});
   const range=decodeURIComponent(u.pathname.split('/values/')[1]),table=range.match(/^'([^']+)'/)?.[1];
   if(!state.tables[table])throw Error('Unexpected synthetic table '+table);
   if(req.method()==='POST'&&range.endsWith(':append')){
    state.tables[table].push(...req.postDataJSON().values);
    if(table==='Reviews'&&loseReviewResponse&&!lost){lost=true;return route.abort('failed');}
    return reply({updates:{updatedRows:1}});
   }
   if(req.method()==='POST'&&range.endsWith(':clear')){
    state.tables[table][Number(range.match(/!A(\d+)/)?.[1])-1]=[];return reply({});
   }
   if(req.method()==='PUT'){
    const index=Number(range.match(/!A(\d+)/)?.[1])-1;
    state.tables[table][index]=req.postDataJSON().values[0];return reply({updatedCells:32});
   }
   if(req.method()!=='GET')throw Error('Unexpected synthetic write');
   return reply({values:/!A1:[A-Z]+1$/.test(range)?[state.tables[table][0]]:state.tables[table]});
  }
  if(u.pathname==='/drive/v3/about')return reply({user:{emailAddress:account+'@example.invalid',displayName:account}});
  if(u.pathname==='/drive/v3/files/generateIds')return reply({ids:['photo-'+account+'-'+(++state.reserved)]});
  if(u.pathname==='/upload/drive/v3/files'){
   const bytes=req.postDataBuffer(),boundary=req.headers()['content-type'].split('boundary=')[1];
   expect(boundary).toBeTruthy();
   if(!bytes){
    // Playwright WebKit cannot expose Blob request bodies to route handlers.
    // Supply a protocol fixture, not a claim about live uploaded Safari bytes.
    const id='photo-'+account+'-'+state.reserved;
    const reviewId=state.tables.Bottles.at(-1)[0].replace(/-bottle$/,'');
    state.photos.set(id,{id,parents:['photos-'+account],mimeType:'image/png',ownedByMe:true,shared:false,bytes:PNG,
      appProperties:{sakefolioApp:'sakefolio-react-v1',sakefolioKind:'photo',reviewId}});
    return reply({id});
   }
   const first=bytes.indexOf('\r\n\r\n'),second=bytes.indexOf('\r\n--'+boundary,first+4);
   const meta=JSON.parse(bytes.subarray(first+4,second).toString());
   const mediaStart=bytes.indexOf('\r\n\r\n',second+4)+4;
   const mediaEnd=bytes.lastIndexOf('\r\n--'+boundary);
   state.photos.set(meta.id,{...meta,bytes:bytes.subarray(mediaStart,mediaEnd),mimeType:'image/png',ownedByMe:true,shared:false});
   return reply({id:meta.id});
  }
  if(u.pathname==='/drive/v3/files'){
   const q=u.searchParams.get('q')||'';
   expect(q).toContain("'me' in owners");
   const kind=q.match(/key='sakefolioKind' and value='([^']+)'/)?.[1];
   const id={root:'root-', 'photos-folder':'photos-',spreadsheet:'sheet-'}[kind]+account;
   return reply({files:[{id,name:'Sakefolio',mimeType:kind==='spreadsheet'?'application/vnd.google-apps.spreadsheet':'application/vnd.google-apps.folder'}]});
  }
  const id=u.pathname.split('/').at(-1),photo=state.photos.get(id);
  if(!photo)return reply({},404);
  if(u.searchParams.get('alt')==='media')return route.fulfill({contentType:'image/png',body:photo.bytes});
  return reply({...photo,bytes:undefined});
 };
 await page.route('https://www.googleapis.com/**',routeApi);
 await page.route('https://sheets.googleapis.com/**',routeApi);
 await page.goto('/');
 return states;
}
async function connect(page){await page.getByRole('button',{name:'Googleで始める',exact:true}).click();await expect(page.locator('.account-button')).toBeVisible();}
async function disconnect(page){await page.locator('.account-button').click();await page.getByRole('button',{name:'接続を解除',exact:true}).click();await expect(page.getByRole('button',{name:'Googleで始める',exact:true})).toBeVisible();}
async function fill(page,name){
 await page.getByRole('button',{name:'日本酒を記録する',exact:false}).first().click();
 await page.getByPlaceholder('酒蔵名を入力して候補を選択').fill('UXTEST-合成蔵');
 await page.getByPlaceholder('例：石鎚').fill(name);
 await page.getByRole('button',{name:'4点',exact:true}).click();
 await page.getByLabel('日本酒ラベル写真を選ぶ').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:PNG});
 await expect(page.locator('.photo-error')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/この一杯を記録する/})).toBeEnabled();
}

test('photo save, editing, trash/restore, portable backup and deliberate restore',async({page},testInfo)=>{
 const states=await fixture(page);await connect(page);await fill(page,'UXTEST-A-only');
 await page.getByRole('button',{name:/この一杯を記録する/}).click();
 await expect(page.getByText('記録を保存しました。Google SheetsとDriveで確認できます。',{exact:true})).toBeVisible();
 expect(states.A.tables.Reviews).toHaveLength(2);expect(states.A.photos.size).toBe(1);
 await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.getByPlaceholder('例：石鎚').fill('UXTEST-A-edited');
 await page.getByRole('button',{name:/編集を保存する/}).click();
 await expect(page.getByText('既存の記録を更新しました。',{exact:true})).toBeVisible();
 expect(states.A.tables.Reviews).toHaveLength(2);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'写真付き日本酒バックアップ',exact:true}).click();
 const archive=readFileSync(await (await download).path());expect(JSON.parse(archive).items).toHaveLength(1);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:archive});
 await expect(page.getByText(/復元完了：1件追加/)).toBeVisible();expect(states.A.photos.size).toBe(2);
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:archive});
 await expect(page.getByText(/復元完了：0件追加、1件スキップ/)).toBeVisible();expect(states.A.photos.size).toBe(2);
 await page.getByRole('button',{name:'ゴミ箱へ',exact:true}).first().click();await expect(page.getByRole('region',{name:'日本酒のゴミ箱'})).toBeVisible();
 await page.getByRole('button',{name:'復元',exact:true}).click();await expect(page.getByText('記録を復元しました。',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('synthetic-collection.png'),fullPage:true});
});

test('lost save response and reload reuse the same journal ID, then A/B/A stay separate',async({page})=>{
 const states=await fixture(page,{loseReviewResponse:true});await connect(page);await fill(page,'UXTEST-A-only');
 await page.getByRole('button',{name:/この一杯を記録する/}).click();
 await expect(page.getByText(/入力内容を保持しています/)).toBeVisible();
 expect(states.A.tables.Reviews).toHaveLength(2);expect(states.A.photos.size).toBe(1);
 await page.reload();await connect(page);await fill(page,'UXTEST-A-only');
 await page.getByRole('button',{name:/この一杯を記録する/}).click();
 await expect(page.getByText('記録を保存しました。Google SheetsとDriveで確認できます。',{exact:true})).toBeVisible();
 expect(states.A.tables.Reviews).toHaveLength(2);expect(states.A.photos.size).toBe(1);
 await page.reload();await connect(page);await expect(page.getByRole('heading',{name:'UXTEST-A-only',exact:true})).toBeVisible();
 await disconnect(page);await page.evaluate(()=>{window.__testAccount='B';});await connect(page);
 await expect(page.getByRole('heading',{name:'UXTEST-A-only',exact:true})).toHaveCount(0);expect(states.B.tables.Reviews).toHaveLength(1);
 await disconnect(page);await page.evaluate(()=>{window.__testAccount='A';});await connect(page);
 await expect(page.getByRole('heading',{name:'UXTEST-A-only',exact:true})).toBeVisible();
});

test('anonymous catalogue search selects a Japanese sake without Google access',async({page})=>{
 const states=await fixture(page);
 await page.getByRole('button',{name:'銘柄を探す',exact:true}).first().click();
 await page.getByLabel('銘柄・酒蔵を検索').fill('石鎚');
 const brand=page.locator('.brand-tile').filter({hasText:'石鎚'}).first();
 await expect(brand).toBeVisible();const selected=await brand.locator('h3').innerText();
 expect(selected).toContain('石鎚');await brand.click();
 await expect(page.getByPlaceholder('例：石鎚')).toHaveValue(selected);
 expect(states.A.tables.Reviews).toHaveLength(1);expect(states.B.tables.Reviews).toHaveLength(1);
});
