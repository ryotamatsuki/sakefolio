import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTaste,isDemoRecord,validRating} from './tasteAnalytics.ts';
function record(id, score='', extras={}) {
  return {reviewId:id,brandName:'試験',breweryName:'試験酒造',prefecture:'愛媛県',
    productName:'商品',drinkingDate:'2026-10-01',rating:score,aromaTagIds:'',
    tasteTagIds:'',processingStyles:'',sakeType:'純米酒',heatTreatment:'火入れ',
    brewingMethod:'速醸',riceVariety:'',photoId:'',notes:'',sweetDry:'',
    lightRich:'',acidity:'',umami:'',...extras};
}
test('unrated and invalid ratings are excluded rather than treated as zero',()=>{
  const a=analyzeTaste([record('a',''),record('b','5'),record('c','0'),record('d','4.5')]);
  assert.equal(a.total,4);
  assert.equal(a.rated,1);
  assert.equal(a.average,5);
  assert.equal(a.ratingDistribution.join(','),'0,0,0,0,1');
  assert.equal(validRating(record('x','3')),3);
  assert.equal(validRating(record('x','3.5')),null);
});
test('single positive record does not produce a claimed preference',()=>{
  const a=analyzeTaste([record('1','5',{prefecture:'山口県'}),record('2','2')]);
  assert.ok(!a.insights.some(i=>i.headline.includes('評価が高いですね')));
});
test('categorical evidence requires enough rated samples in each group',()=>{
  const rows=[
    ...[5,5,4,5].map((s,i)=>record('a'+i,String(s),{prefecture:'愛媛県'})),
    ...[2,3,2,3].map((s,i)=>record('b'+i,String(s),{prefecture:'山口県'}))
  ];
  const a=analyzeTaste(rows);
  const pref=a.insights.find(i=>i.id==='positive-pref-愛媛県');
  assert.ok(pref);
  assert.match(pref.evidence,/4件 対 その他4件/);
  assert.ok(a.insights.some(i=>i.id==='negative-pref-山口県'));
});
test('the calculation never infers unentered aroma or sensory properties',()=>{
  const r=[record('a','4'),record('b','5')];
  const a=analyzeTaste(r);
  assert.equal(a.aromas.length,0);
  assert.equal(a.axes[0].mean,null);
  assert.ok(!a.insights.some(x=>x.category==='香り'));
});
test('demo recognition is explicit and never labels ordinary reviews demo',()=>{
  assert.equal(isDemoRecord(record('sakefolio-demo-20261017-01','5')),true);
  assert.equal(isDemoRecord(record('live-1','5')),false);
  assert.equal(isDemoRecord(record('debug','4',{productName:'DEBUG-20261016-写真なし'})),true);
});
test('tag counts do not double count repeated same tags in one record',()=>{
  const a=analyzeTaste([record('a','4',{aromaTagIds:'aroma_apple,aroma_apple,aroma_melon'})]);
  assert.equal(a.aromas.find(x=>x.label==='りんご')?.count,1);
});
