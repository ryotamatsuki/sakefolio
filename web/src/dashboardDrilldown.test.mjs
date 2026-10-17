import test from 'node:test';
import assert from 'node:assert/strict';
import {detailOfInsight,drilldownIndexRows,getDrilldownRecords,indexChild,matchesDrilldown,sortDrilldownRecords} from './dashboardDrilldown.ts';
import {isDemoRecord} from './tasteAnalytics.ts';
function r(id,brand,pref,score,more={}){return {
  reviewId:id,brandName:brand,breweryName:brand+'酒造',prefecture:pref,
  productName:'日本酒',sakeType:'純米吟醸酒',brewingMethod:'速醸',heatTreatment:'火入れ',
  riceVariety:'山田錦',processingStyles:'無濾過,原酒',drinkingDate:'2026-10-12',createdAt:'',
  rating:score,aromaTagIds:'aroma_apple,aroma_melon',tasteTagIds:'taste_juicy',
  sweetDry:'2',lightRich:'4',acidity:'',umami:'',notes:'',photoId:'',...more}};
const rows=[
  r('sakefolio-demo-20261017-01','石鎚','愛媛県','5',{photoId:'private_photo'}),
  r('sakefolio-demo-20261017-02','梅錦','愛媛県','3',{aromaTagIds:'aroma_steamed_rice'}),
  r('sakefolio-demo-20261017-03','獺祭','山口県','5',{drinkingDate:'2026-09-22',tasteTagIds:''}),
  r('real-01','石鎚','愛媛県','4',{drinkingDate:'2026-08-01',aromaTagIds:''}),
  r('real-02','黒龍','福井県','')
];
test('prefecture chart opens exactly the matching records including duplicate brand tastings',()=>{
  const got=getDrilldownRecords(rows,[{kind:'prefecture',value:'愛媛県',label:'愛媛県'}]);
  assert.deepEqual(got.map(x=>x.reviewId),[rows[0].reviewId,rows[1].reviewId,rows[3].reviewId]);
});
test('rating distribution opens exact stars, never unrated entries',()=>{
  assert.deepEqual(getDrilldownRecords(rows,[{kind:'rating',value:'5',label:'★5'}])
    .map(x=>x.brandName),['石鎚','獺祭']);
  assert.equal(getDrilldownRecords(rows,[{kind:'rated',label:'評価あり'}]).length,4);
  assert.equal(getDrilldownRecords(rows,[{kind:'high',label:'高評価'}]).length,3);
});
test('taste and aroma drilldowns match tagged records by LABEL without guessing',()=>{
  assert.equal(getDrilldownRecords(rows,[{kind:'aroma',value:'メロン',label:'メロン'}]).length,3);
  assert.equal(getDrilldownRecords(rows,[{kind:'aroma',value:'蒸米',label:'蒸米'}]).length,1);
  assert.equal(getDrilldownRecords(rows,[{kind:'taste',value:'ジューシー',label:'味わい'}]).length,4);
});
test('processing style, heat, rice, brewery, type and month match fields',()=>{
  for(const [kind,value] of [['style','無濾過'],['heat','火入れ'],['rice','山田錦'],['brewery','石鎚酒造'],
    ['type','純米吟醸酒'],['month','2026-09']]){
    const chosen=getDrilldownRecords(rows,[{kind,value,label:value}]);
    assert.ok(chosen.length>0,kind);
  }
  assert.equal(getDrilldownRecords(rows,[{kind:'month',value:'2026-09',label:'2026-09'}]).length,1);
});
test('record detail adds a second level and breadcrumb filtering preserves its parent',()=>{
  const path=[{kind:'index',index:'prefectures',label:'産地一覧'},{kind:'prefecture',value:'愛媛県',label:'愛媛県'},
    {kind:'record',value:'sakefolio-demo-20261017-02',label:'梅錦'}];
  assert.deepEqual(getDrilldownRecords(rows,path).map(r=>r.brandName),['梅錦']);
});
test('brand index is deduplicated while drilldown includes every repeated tasting',()=>{
  const brands=drilldownIndexRows(rows,'brands');
  assert.equal(brands.find(x=>x.label==='石鎚')?.count,2);
  assert.equal(brands.length,4);
  const child=indexChild('brands','石鎚','石鎚');
  assert.equal(getDrilldownRecords(rows,[child]).length,2);
});
test('radar axis filter ignores unfilled inputs, index counts do not invent missing scores',()=>{
  const a=getDrilldownRecords(rows,[{kind:'axis',value:'sweetDry',label:'甘辛'}]);
  assert.equal(a.length,5);
  assert.equal(drilldownIndexRows(rows,'axes').some(x=>x.value==='acidity'),false);
});
test('photo KPI reveals only actual photo IDs',()=>{
  assert.deepEqual(getDrilldownRecords(rows,[{kind:'photo',label:'写真のある酒'}]).map(x=>x.brandName),['石鎚']);
});
test('individual insight routes to matching evidence and general insights to relevant pages',()=>{
  const x=detailOfInsight('positive-pref-愛媛県');
  assert.equal(x.kind,'prefecture');assert.equal(x.value,'愛媛県');
  assert.equal(detailOfInsight('high-share-aroma-メロン').kind,'aroma');
  assert.equal(detailOfInsight('axis-favorite-sweetDry').value,'sweetDry');
  assert.equal(detailOfInsight('overall').kind,'rated');
  assert.equal(detailOfInsight('regions').index,'prefectures');
});
test('rating sort ranks high first, puts missing rating at bottom, preserves input immutability',()=>{
  const sorted=sortDrilldownRecords(rows,'rating-desc');
  assert.equal(sorted[sorted.length-1].brandName,'黒龍');
  assert.equal(sorted[0].rating,'5');
  assert.equal(rows[0].reviewId,'sakefolio-demo-20261017-01');
  assert.equal(matchesDrilldown(rows[0],{kind:'record',value:'real-01',label:''}),false);
});
test('demo and actual logs separate before any drilldown',()=>{
  const actual=rows.filter(r=>!isDemoRecord(r));
  assert.equal(getDrilldownRecords(actual,[{kind:'prefecture',value:'愛媛県',label:''}]).length,1);
  assert.equal(getDrilldownRecords(actual,[{kind:'rating',value:'5',label:''}]).length,0);
});
