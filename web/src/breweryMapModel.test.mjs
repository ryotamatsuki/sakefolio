import test from 'node:test';
import assert from 'node:assert/strict';
import {collectBreweryHistory,fitBreweryLocations,precisionText,project,unproject} from './breweryMapModel.ts';
const rec = (name, pref='愛媛県',date='2026-10-01') => ({
  breweryName:name,prefecture:pref,drinkingDate:date,createdAt:'',
  brandName:'試験銘柄',photoId:'',rating:'4',breweryAddress:''
});
const point = (name,prec='lot_or_address') => ({
  breweryName:name,prefecture:'愛媛県',lat:33.9,lon:132.7,precision:prec
});
test('only existing personal records become pins, one pin groups repeated tastings',()=>{
  const data=collectBreweryHistory([rec('石鎚'),rec('石鎚','愛媛県','2026-10-15'),rec('梅錦')],
    [point('石鎚'),point('未飲の酒蔵')]);
  assert.equal(data.mapped.length,1);
  assert.equal(data.mapped[0].records.length,2);
  assert.equal(data.mapped[0].records[0].drinkingDate,'2026-10-15');
  assert.equal(data.unmapped.length,1);
  assert.equal(data.mappedRecords,2);
});
test('different prefectures or duplicated coordinate rows never create untrusted matches',()=>{
  assert.equal(collectBreweryHistory([rec('石鎚','香川県')],[point('石鎚')]).mapped.length,0);
  assert.equal(collectBreweryHistory([rec('石鎚')],[point('石鎚'),point('石鎚')]).mapped.length,0);
  assert.equal(collectBreweryHistory([rec('石鎚')],[{...point('石鎚'),lat:999}]).mapped.length,0);
});
test('approximate locations remain explicitly approximate',()=>{
  assert.match(precisionText('town_approximate'),/酒蔵の位置ではありません/);
  assert.match(precisionText('lot_or_address'),/建物未確認/);
  assert.match(precisionText('facility_osm_verified'),/資料照合/);
});
test('projection round-trip and fitting stay within usable zoom levels',()=>{
  const p=project(33.9,132.7,8),r=unproject(p.x,p.y,8);
  assert.ok(Math.abs(r.lat-33.9)<1e-7);
  assert.ok(Math.abs(r.lon-132.7)<1e-7);
  assert.equal(fitBreweryLocations([point('石鎚')],700,400).zoom,11);
  const fit=fitBreweryLocations([point('石鎚'),{...point('別'),lat:43,lon:141}],700,400);
  assert.ok(fit.zoom>=3 && fit.zoom<=12);
});
