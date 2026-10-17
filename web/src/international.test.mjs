import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAND_STARTERS,KIND_CONFIG,brandMatches,normalizeOffProducts,normalizeWikidataResults} from './internationalCatalog.ts';
import {buildBackup,validateInternationalRecord} from './internationalLocal.ts';
import {analyzeInternational,filterInternationalRecords} from './internationalAnalytics.ts';
import {chinaMasterSearch,normalizeChinaMaster,parseWktPoint,mapProducers,wikidataMatchedLocations} from './internationalMaster.ts';
import {normalizeOverpass,normalizeOsmSnapshot} from './internationalOsm.ts';
import {ABV_PRESETS,VOLUME_PRESETS,normalizeVolume,normalizeAbv,volumeFromQuantity,
 canonicalizeTechnicalSpecs,validateTechnicalSpecs,specStats} from './internationalInput.ts';
import {INTERNATIONAL_SENSORY,splitDescriptorTags,toggleDescriptorTag,sensoryAxisScore,
 sensoryDescriptorValues} from './internationalSensory.ts';

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

test('Wikidata master accepts sourced entity-level coordinates but rejects guessed locations',()=>{
 const master=normalizeChinaMaster({
   format:'sakefolio-china-wikidata-v1',generatedAt:'2026-10-17',license:'CC0',
   rows:[
    {id:'Q1518607',kind:'baijiu',class:'producer',name:'贵州茅台酒股份有限公司',lat:27.845,lon:106.362,
      coordinateSource:'https://www.wikidata.org/wiki/Q1518607'},
    {id:'Q313542',kind:'beer',class:'producer',name:'青島啤酒',lat:36.07,lon:120.4,
      coordinateSource:'https://www.wikidata.org/wiki/Q123456'},
    {id:'Q5072156',kind:'wine',class:'producer',name:'张裕',lat:99,lon:99,
      coordinateSource:'https://www.wikidata.org/wiki/Q5072156'},
    {id:'Q1234',kind:'wine',class:'product',name:'商品A',producerId:'Q5072156'},
    {id:'Q1234',kind:'wine',class:'product',name:'重複'}
   ],report:{queries:4,successfulQueries:4,failures:[],counts:{wine:1}}
 });
 assert.equal(master.rows.length,4);
 assert.equal(mapProducers(master.rows).length,1);
 assert.equal(wikidataMatchedLocations(master.rows,'Q1518607').length,1);
 assert.equal(wikidataMatchedLocations(master.rows,'Q313542').length,0);
 assert.equal(chinaMasterSearch(master.rows,'beer','青島').length,1);
 assert.equal(parseWktPoint('Point(106.362 27.845)')?.lat,27.845);
 assert.equal(parseWktPoint('Point(0 0)'),null);
 assert.equal(normalizeChinaMaster({rows:[]}).rows.length,0);
});
test('multi-beverage reports never combine scores and catalog-only records are unrated',()=>{
 const entries=[
  r({kind:'baijiu',experience:'tasted',rating:'5',tastedAt:'2026-10-10',
     attributes:{aromaStyle:'酱香型'},brandName:'茅台'}),
  r({id:'a1234567-89ab-1234-5678-123456789012',kind:'baijiu',experience:'tasted',
    rating:'2',tastedAt:'2026-10-11',brandName:'五粮液',attributes:{aromaStyle:'浓香型'}}),
  r({id:'b1234567-89ab-1234-5678-123456789012',kind:'wine',experience:'tasted',
    rating:'5',tastedAt:'2026-10-11',brandName:'張裕',attributes:{wineStyle:'赤'}}),
  r({id:'c1234567-89ab-1234-5678-123456789012',kind:'baijiu',
    experience:'catalogued',rating:'',brandName:'白酒メモ',attributes:{aromaStyle:'酱香型'}})
 ];
 const a=analyzeInternational(entries,'baijiu'),b=analyzeInternational(entries,'wine');
 assert.equal(a.total,3);assert.equal(a.tasted,2);assert.equal(a.rated,2);
 assert.equal(a.mean,3.5);assert.equal(a.distribution[4],1);
 assert.equal(b.total,1);assert.equal(b.mean,5);
 assert.equal(a.facets.aromaStyle.find(x=>x.label==='酱香型').count,2);
 assert.equal(a.insights.length,0);
 assert.equal(filterInternationalRecords(entries.filter(r=>r.kind==='baijiu'),'aromaStyle','酱香型').length,2);
 assert.equal(filterInternationalRecords(entries.filter(r=>r.kind==='baijiu'),'rating','5').length,1);
});
test('no high-preference claim without 3 rated cases on both sides',()=>{
 const entries=Array.from({length:6},(_,i)=>r({
   id:'abcde123-'+String(i).padStart(4,'0')+'-4000-8000-123456789012',
   experience:'tasted',tastedAt:'2026-10-10',rating:i<2?'5':'1',
   attributes:{aromaStyle:i<2?'酱香型':'浓香型'},brandName:'白酒'+i
 }));
 assert.equal(analyzeInternational(entries,'baijiu').insights.length,0);
});

test('China OSM facilities accept only named manufacturing sites and never pubs',()=>{
 const rows=normalizeOverpass({elements:[
  {type:'node',id:100,lat:36.06,lon:120.38,tags:{name:'青岛工厂',craft:'brewery'}},
  {type:'way',id:101,center:{lat:38,lon:106},tags:{'name:zh':'宁夏葡萄酒庄',craft:'winery'}},
  {type:'node',id:102,lat:30,lon:115,tags:{name:'蒸馏厂',craft:'distillery'}},
  {type:'node',id:103,lat:31,lon:115,tags:{name:'仅售酒吧',amenity:'pub'}},
  {type:'node',id:104,lat:31,lon:115,tags:{craft:'brewery'}},
  {type:'node',id:105,lat:55,lon:115,tags:{name:'中国外',craft:'brewery'}}
 ]}).rows;
 assert.equal(rows.length,3);
 assert.equal(rows[0].kind,'beer');
 assert.equal(rows[1].precision,'geometry_center');
 assert.equal(rows[2].kind,'unclassified');
 assert.equal(rows[0].source,'https://www.openstreetmap.org/node/100');
});
test('OSM normalizer rejects unverified location, duplicate and mislabeled drink type',()=>{
 const snapshot=normalizeOsmSnapshot({
  format:'sakefolio-china-osm-facilities-v1',generatedAt:'2026',rows:[
   {id:'way/123',name:'A',craft:'winery',kind:'wine',lat:29,lon:106},
   {id:'way/123',name:'B',craft:'winery',kind:'wine',lat:29,lon:106},
   {id:'node/124',name:'Wrong type',craft:'distillery',kind:'beer',lat:29,lon:106},
   {id:'way/125',name:'Out of region',craft:'winery',kind:'wine',lat:100,lon:106}
  ]});
 assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].precision,'geometry_center');
 assert.equal(normalizeOsmSnapshot({}).rows.length,0);
});

test('UXTEST rows allow explicitly labelled mock rating but never count as real tastings',()=>{
 const demo=r({id:'uxcn-20261017-001',experience:'test',rating:'5',
   notes:'【UXTEST・本人未試飲】グラフ検証用の仮評価'});
 validateInternationalRecord(demo);
 assert.throws(()=>validateInternationalRecord({...demo,notes:'商品メモのみ'}),/UXTEST/);
 assert.throws(()=>validateInternationalRecord({...demo,tastedAt:'2026-10-17'}),/飲酒していない/);
 const actual=analyzeInternational([demo],'baijiu');
 const withTests=analyzeInternational([demo],'baijiu',true);
 assert.equal(actual.total,0);assert.equal(actual.mean,null);
 assert.equal(withTests.total,1);assert.equal(withTests.mean,5);
 assert.equal(withTests.distribution[4],1);
 assert.equal(filterInternationalRecords([demo],'rating','5').length,0);
 assert.equal(filterInternationalRecords([demo],'rating','5',true).length,1);
});

test('beer and wine offer several conventional flavour families and four rating axes',()=>{
 for(const kind of ['beer','wine']){
   const groups=INTERNATIONAL_SENSORY[kind];
   assert.ok(groups);
   assert.ok(groups.aroma.length>=3);
   assert.ok(groups.taste.length>=2);
   assert.equal(groups.axes.length,4);
   assert.ok(groups.aroma.flatMap(g=>g.values).length>=15);
   assert.ok(groups.taste.flatMap(g=>g.values).length>=10);
   assert.equal(new Set(groups.axes.map(a=>a.key)).size,4);
 }
 assert.ok(INTERNATIONAL_SENSORY.beer.aroma.flatMap(g=>g.values).includes('麦芽'));
 assert.ok(INTERNATIONAL_SENSORY.wine.aroma.flatMap(g=>g.values).includes('カシス'));
 assert.equal(INTERNATIONAL_SENSORY.baijiu,undefined);
});
test('multi-select aroma chips toggle without affecting free text',()=>{
 const first=toggleDescriptorTag('', '柑橘');
 const second=toggleDescriptorTag(first,'麦芽');
 assert.deepEqual(splitDescriptorTags(second),['柑橘','麦芽']);
 assert.deepEqual(splitDescriptorTags(toggleDescriptorTag(second,'柑橘')),['麦芽']);
 assert.deepEqual(sensoryDescriptorValues({aromaTags:'柑橘、麦芽'},'麦芽、パン','aroma'),
  ['柑橘','麦芽','パン']);
 assert.equal(sensoryAxisScore('5'),5);
 for(const bad of ['0','6','', '2.5','NaN'])assert.equal(sensoryAxisScore(bad),null);
});
test('beer/wine tag choices and axis averages drive category-specific breakdowns',()=>{
 const beer=[
   r({id:'beer-test-a1',kind:'beer',experience:'tasted',rating:'5',tastedAt:'2026-10-16',
      attributes:{aromaTags:'柑橘、麦芽',tasteTags:'すっきり、キレがよい',
       axisBitterness:'4',axisMalt:'2',axisBody:'1',axisCarbonation:'5'}}),
   r({id:'beer-test-a2',kind:'beer',experience:'tasted',rating:'3',tastedAt:'2026-10-15',
      attributes:{aromaTags:'柑橘',tasteTags:'ドライ',
       axisBitterness:'2',axisMalt:'3',axisBody:'2',axisCarbonation:'3'}}),
   r({id:'wine-test-a3',kind:'wine',experience:'tasted',rating:'5',tastedAt:'2026-10-14',
      attributes:{aromaTags:'カシス、バニラ',tasteTags:'しっかりした渋み',
       axisSweetness:'1',axisAcidity:'3',axisTannin:'5',axisBody:'5'}})
 ];
 const a=analyzeInternational(beer,'beer');
 assert.equal(a.total,2);
 assert.equal(a.axes.find(x=>x.key==='axisBitterness').mean,3);
 assert.equal(a.axes.find(x=>x.key==='axisBitterness').count,2);
 assert.equal(a.facets.aroma.find(x=>x.label==='柑橘').count,2);
 assert.equal(a.facets.taste.find(x=>x.label==='ドライ').count,1);
 assert.equal(filterInternationalRecords(beer,'aroma','柑橘').length,2);
 assert.equal(filterInternationalRecords(beer,'taste','しっかりした渋み').length,1);
 const w=analyzeInternational(beer,'wine');
 assert.equal(w.total,1);
 assert.equal(w.axes.find(x=>x.key==='axisTannin').mean,5);
 assert.equal(w.facets.aroma.find(x=>x.label==='カシス').count,1);
});
test('legacy aroma text and UXTEST data are isolated from genuine tasting analysis',()=>{
 const r1=r({id:'legacy-beer-a1',kind:'beer',experience:'test',rating:'5',
   aroma:'橘香,麦芽香',notes:'【UXTEST・本人未試飲】',
   attributes:{beerStyle:'ラガー'}});
 const a=analyzeInternational([r1],'beer');
 assert.equal(a.total,0);assert.equal(a.mean,null);
 const withTests=analyzeInternational([r1],'beer',true);
 assert.equal(withTests.total,1);
 assert.equal(withTests.facets.aroma.find(x=>x.label==='橘香').count,1);
 assert.equal(withTests.axes[0].mean,null);
});

test('ABV and mL presets cover the four drink categories',()=>{
 for(const kind of ['baijiu','huangjiu','beer','wine']){
   assert.ok(VOLUME_PRESETS[kind].length>=8);
   assert.ok(ABV_PRESETS[kind].length>=8);
   assert.equal(new Set(VOLUME_PRESETS[kind]).size,VOLUME_PRESETS[kind].length);
   assert.equal(new Set(ABV_PRESETS[kind]).size,ABV_PRESETS[kind].length);
 }
 assert.ok(VOLUME_PRESETS.beer.includes(330));
 assert.ok(VOLUME_PRESETS.wine.includes(750));
 assert.ok(ABV_PRESETS.baijiu.includes(53));
 assert.ok(ABV_PRESETS.beer.includes(5.5));
});
test('quantity normalization accepts single containers but refuses multi-packs',()=>{
 for(const [raw,expected] of [['330 ml','330'],['33cl','330'],['50CL','500'],
   ['0.75 L','750'],['500毫升','500'],['1升','1000'],['1.5 litre','1500']]){
   assert.equal(volumeFromQuantity(raw),expected,raw);
 }
 for(const raw of ['6 x 330 ml','6×500mL','12*500ml','330ml×6','1本500ml',
   '2 bottles of 500ml','500g','500cc','',null]){
   assert.equal(volumeFromQuantity(raw),null,String(raw));
 }
});
test('technical constraints canonicalize scalar numeric units and reject outliers',()=>{
 assert.equal(normalizeVolume('0750'),'750');
 assert.equal(normalizeVolume('750.5'),null);
 assert.equal(normalizeVolume('0'),null);
 assert.equal(normalizeVolume('20001'),null);
 assert.equal(normalizeAbv('5.0'),'5');
 assert.equal(normalizeAbv('0'), '0');
 assert.equal(normalizeAbv('100'),'100');
 for(const raw of ['5.55','-5','101','53%','1e2','NaN']){
   assert.equal(normalizeAbv(raw),null,raw);
 }
 const canon=canonicalizeTechnicalSpecs({volume:'0750',abv:'5.0',beerStyle:'ラガー'});
 assert.deepEqual(canon,{volume:'750',abv:'5',beerStyle:'ラガー'});
 assert.throws(()=>validateTechnicalSpecs({volume:'500mL'}),/容量/);
 assert.throws(()=>validateTechnicalSpecs({abv:'5.555'}),/アルコール度数/);
 assert.throws(()=>validateTechnicalSpecs({vintage:'3020'}),/ヴィンテージ/);
 assert.throws(()=>validateInternationalRecord(r({attributes:{abv:'5.55'}})),/アルコール度数/);
 assert.throws(()=>validateInternationalRecord(r({attributes:{volume:'330ml'}})),/容量/);
});
test('international alcohol and capacity aggregates use numbers, not text labels',()=>{
 const sample=[
  r({kind:'beer',attributes:{volume:'330',abv:'5'}}),
  r({kind:'beer',attributes:{volume:'0500',abv:'5.5'}}),
  r({kind:'beer',attributes:{volume:'330',abv:'5.0'}}),
  r({kind:'beer',attributes:{}}),
  r({kind:'wine',attributes:{volume:'750',abv:'13'}})
 ];
 const stats=specStats(sample.slice(0,4).map(x=>x.attributes),'volume');
 assert.equal(stats.count,3);assert.equal(stats.mean,1160/3);
 assert.equal(stats.frequencies[0].value,'330');assert.equal(stats.frequencies[0].count,2);
 const report=analyzeInternational(sample,'beer');
 assert.equal(report.specs.abv.count,3);
 assert.equal(report.specs.abv.mean,15.5/3);
 assert.equal(report.specs.volume.frequencies[0].value,'330');
 assert.equal(report.facets.volume.find(x=>x.label==='330').count,2);
 assert.equal(report.facets.abv.find(x=>x.label==='5').count,2);
 assert.equal(filterInternationalRecords(sample.filter(x=>x.kind==='beer'),'volume','330').length,2);
 assert.equal(analyzeInternational(sample,'wine').specs.abv.mean,13);
});
test('categorical style, body and bitterness use controlled options',()=>{
 for(const kind of ['beer','wine']){
   const config=KIND_CONFIG.find(c=>c.id===kind);
   assert.ok(config.fields.some(f=>f.key==='body'&&f.options?.includes('ミディアム')));
 }
 const beer=KIND_CONFIG.find(c=>c.id==='beer');
 assert.ok(beer.fields.some(f=>f.key==='beerStyle'&&f.options?.includes('IPA')));
 assert.ok(beer.fields.some(f=>f.key==='bitterness'&&f.options?.includes('強い')));
});
