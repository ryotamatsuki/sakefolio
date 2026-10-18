import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root='http://127.0.0.1:4173/sakefolio/';
const dir='artifacts/pr3-qa';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const evidence={runtime:'headless Chromium in ephemeral GitHub Actions job',
  realGoogleOAuth:'NOT TESTED',realAtoB:'NOT TESTED',safari:'NOT TESTED',
  cases:[],errors:[]};
const step=async(name,fn)=>{try{await fn();evidence.cases.push({name,result:'PASS'});console.log('PASS '+name);}
  catch(e){evidence.cases.push({name,result:'FAIL',error:String(e)});console.error('FAIL '+name+': '+e);throw e;}};
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',
  serviceWorkers:'block'});
 const page=await ctx.newPage();
 page.on('pageerror',e=>{evidence.errors.push(String(e));});
 await step('compiled app loads from isolated localhost URL',async()=>{
   const resp=await page.goto(root,{waitUntil:'domcontentloaded'});
   assert.equal(resp?.status(),200);
   await page.waitForTimeout(2500);
   console.log('PAGE_BODY', (await page.locator('body').innerText()).slice(0,1500));
   console.log('PAGE_ERRORS',JSON.stringify(evidence.errors));
   await page.screenshot({path:dir+'/initial.png',fullPage:true});
   await page.locator('.mobile-nav button').filter({hasText:'中国のお酒'}).click();
   await page.getByRole('heading',{name:/中国のお酒を記録する/}).waitFor();
 });
 await step('Chinese spirits save locally without Google credentials',async()=>{
   await page.locator('input[placeholder="商品に記載された銘柄名"]').fill('PR3-QA-TEST-BRAND');
   await page.locator('input[placeholder="正式な商品名"]').fill('PR3-QA-TEST-PRODUCT');
   await page.getByRole('button',{name:/この端末に保存する/}).click();
   await page.getByText('端末内に保存しました',{exact:false}).waitFor({timeout:15000});
   await page.getByText('PR3-QA-TEST-PRODUCT',{exact:false}).first().waitFor();
 });
 await page.screenshot({path:dir+'/local-collection.png',fullPage:true});
 await step('record survives reload in same browser profile',async()=>{
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.mobile-nav button').filter({hasText:'中国のお酒'}).click();
   await page.getByRole('button',{name:/マイコレクション/}).click();
   await page.getByText('PR3-QA-TEST-PRODUCT',{exact:false}).first().waitFor();
 });
 await step('different isolated browser profile cannot see local data',async()=>{
   const second=await browser.newContext({viewport:{width:390,height:844},
     serviceWorkers:'block'});
   const other=await second.newPage();
   await other.goto(root,{waitUntil:'domcontentloaded'});
   await other.locator('.mobile-nav button').filter({hasText:'中国のお酒'}).click();
   await other.getByRole('button',{name:/マイコレクション/}).click();
   await other.getByText('この酒類の記録はまだありません',{exact:false}).waitFor();
   assert.equal(await other.getByText('PR3-QA-TEST-PRODUCT',{exact:false}).count(),0);
   await second.close();
 });
 await step('no uncaught browser exceptions',async()=>assert.deepEqual(evidence.errors,[]));
 await ctx.close();
}finally{
 await browser.close();
 writeFileSync(dir+'/result.json',JSON.stringify(evidence,null,2));
}
if(evidence.cases.some(c=>c.result!=='PASS'))process.exitCode=1;
