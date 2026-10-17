import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAND_STARTERS,KIND_CONFIG,brandMatches,normalizeOffProducts,normalizeWikidataResults} from './internationalCatalog.ts';
import {buildBackup,validateInternationalRecord} from './internationalLocal.ts';

const r=(extra={})=>({
  id:'123e4567-e89b-12d3-a456-426614174000',kind:'baijiu',brandName:'茅台',productName:'商品A',
  producer:'',region:'貴州省',country:'中国',sourceUrl:'',attributes:{aromaStyle:'酱香型'},
  experience:'catalogued',tastedAt:'',rating:'',aroma:'',taste:'',notes:'',
  createdAt:'2026-10-17T00:00:00.000Z',photo:null,...extra
});
test('catalog has real named Chinese brand candidates in all four categories',()=>{
  assert.equal(KIND_CONFIG.length,4);
  for(const config of KIND_CONFIG)assert.ok(BRAND_STARTERS.filter(x=>x.kind===config.id).length>=3);
  assert.ok(BRAND_STARTERS.some(b=>brandMatches(b,'baijiu','茅台')));
  assert.equal(brandMatches(BRAND_STARTERS[0],'beer','茅台'),false);
  assert.ok(BRAND_STARTERS.every(b=>b.id&&b.name&&b.region));
});
test('Open Food Facts parsing requires product and valid barcode, de-duplicates',()=>{
  const a=normalizeOffProducts({products:[
    {code:'6901234567890',product_name:'啤酒A',brands:'某品牌',quantity:'330 ml'},
    {code:'6901234567890',product_name:'duplicate'},
    {code:'bad',product_name:'malformed'},{code:'12345678',product_name:''}
  ]});
  assert.equal(a.length,1);assert.equal(a[0].productName,'啤酒A');
  assert.equal(a[0].source,'https://world.openfoodfacts.org/product/6901234567890');
  assert.deepEqual(normalizeOffProducts({}),[]);
});
test('catalogued item cannot masquerade as a tasted rating',()=>{
  assert.throws(()=>validateInternationalRecord(r({rating:'5'})),/飲酒していない/);
  assert.throws(()=>validateInternationalRecord(r({tastedAt:'2026-10-17'})),/飲酒していない/);
  assert.doesNotThrow(()=>validateInternationalRecord(r()));
});
test('tasted record must have actual valid date; rating optional',()=>{
  assert.throws(()=>validateInternationalRecord(r({experience:'tasted',tastedAt:''})),/飲酒日/);
  assert.throws(()=>validateInternationalRecord(r({experience:'tasted',tastedAt:'2026-02-30'})),/飲酒日/);
  assert.doesNotThrow(()=>validateInternationalRecord(r({experience:'tasted',tastedAt:'2026-10-17',rating:''})));
  assert.throws(()=>validateInternationalRecord(r({experience:'tasted',tastedAt:'2026-10-17',rating:'9'})),/評価/);
});
test('backups carry versioned plain text records without OAuth tokens',async()=>{
  const blob=await buildBackup([r()]);
  const parsed=JSON.parse(await blob.text());
  assert.equal(parsed.format,'Sakefolio-international-v1');
  assert.equal(parsed.records[0].brandName,'茅台');
  assert.equal(parsed.records[0].photoData,null);
  assert.ok(!blob.toString().includes('oauth'));
});
test('unsafe URLs, embedded control chars, oversized fields rejected',()=>{
  assert.throws(()=>validateInternationalRecord(r({sourceUrl:'javascript:alert(1)'})),/HTTPS/);
  assert.throws(()=>validateInternationalRecord(r({sourceUrl:'https://u:p@example.com/x'})),/HTTPS/);
  assert.throws(()=>validateInternationalRecord(r({productName:'a\nB'})),/確認/);
  assert.throws(()=>validateInternationalRecord(r({notes:'A'.repeat(4001)})),/確認/);
  assert.throws(()=>validateInternationalRecord(r({attributes:{'__proto__': 'x',wrong$:'y'}})),/詳細項目/);
});

test('Wikidata candidate search rejects invalid Q-IDs and exposes explicit CC0 source',()=>{
 const rows=normalizeWikidataResults({search:[
   {id:'Q12345',label:'茅台',description:'中国企業'},
   {id:'Q12345',label:'重複'},
   {id:'P31',label:'プロパティ'},
   {id:'Q98765',label:'酒類メーカー',description:'manufacturer'}
 ]});
 assert.equal(rows.length,2);
 assert.equal(rows[0].source,'https://www.wikidata.org/wiki/Q12345');
 assert.equal(rows[1].label,'酒類メーカー');
 assert.deepEqual(normalizeWikidataResults({search:null}),[]);
});
