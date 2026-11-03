import test from 'node:test';
import assert from 'node:assert/strict';
import {breweryMapsUrl,breweryMapsQuery,breweryDirectionsUrl,listBreweries,mergeBreweryAddresses} from './catalog.ts';
test('automatic Google Maps search uses brewery name and prefecture',()=>{
 const url=new URL(breweryMapsUrl('石鎚酒造','愛媛県','',''));
 assert.equal(url.hostname,'www.google.com');assert.equal(url.searchParams.get('api'),'1');
 assert.equal(url.searchParams.get('query'),'石鎚酒造 愛媛県');
});
test('address is not duplicated and directions use it',()=>{
 const q='石鎚酒造 愛媛県西条市氷見丙402-3';
 assert.equal(breweryMapsQuery('石鎚酒造','愛媛県','西条市','愛媛県西条市氷見丙402-3'),q);
 assert.equal(new URL(breweryDirectionsUrl('石鎚酒造','愛媛県','西条市','愛媛県西条市氷見丙402-3')).searchParams.get('destination'),q);
});
test('brewery candidate options deduplicate brands and reuse prior address',()=>{
 const opt=listBreweries([
  {brandId:'1',brandName:'石鎚',breweryName:'石鎚酒造',prefecture:'愛媛県'},
  {brandId:'2',brandName:'別銘柄',breweryName:'石鎚酒造',prefecture:'愛媛県'},
  {brandId:'3',brandName:'同名',breweryName:'石鎚酒造',prefecture:'香川県'}
 ],[{breweryName:'石鎚酒造',prefecture:'愛媛県',municipality:'西条市',breweryAddress:'氷見丙402-3'}]);
 assert.equal(opt.length,2);assert.equal(opt.find(b=>b.prefecture==='愛媛県').count,2);
 assert.equal(opt.find(b=>b.prefecture==='愛媛県').address,'氷見丙402-3');
});

test('SAKEOpenData address join enhances matching breweries without modifying brand identity',()=>{
 const merged=mergeBreweryAddresses([
  {brandId:'sw-914',brandName:'石鎚',breweryName:'石鎚酒造',prefecture:'愛媛県'},
  {brandId:'x',brandName:'同名',breweryName:'石鎚酒造',prefecture:'香川県'}
 ],[{breweryName:'石鎚酒造',prefecture:'愛媛県',address:'愛媛県西条市氷見丙402-3'}]);
 assert.equal(merged[0].breweryAddress,'愛媛県西条市氷見丙402-3');
 assert.equal(merged[0].brandId,'sw-914');
 assert.equal(merged[0].addressSource,'SAKEOpenData');
 assert.equal(merged[1].breweryAddress,undefined);
});
test('join will not overwrite user address or take ambiguous duplicate matches',()=>{
 const merged=mergeBreweryAddresses([
  {brandId:'m',brandName:'自家銘柄',breweryName:'例示酒造',prefecture:'愛媛県',breweryAddress:'愛媛県西条市ユーザー入力'}
 ],[
  {breweryName:'例示酒造',prefecture:'愛媛県',address:'愛媛県西条市A'},
  {breweryName:'例示酒造',prefecture:'愛媛県',address:'愛媛県西条市B'}]);
 assert.equal(merged[0].breweryAddress,'愛媛県西条市ユーザー入力');
});
