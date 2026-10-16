import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const coords=JSON.parse(readFileSync(new URL('../public/brewery-coordinates.json',import.meta.url),'utf8'));
const report=JSON.parse(readFileSync(new URL('../data/brewery-geocoding-report.json',import.meta.url),'utf8'));
test('each geocoded sake brewery has a plausible coordinate and a disclosed accuracy tier',()=>{
 const allowed=new Set(['lot_or_address','town_approximate']);
 const seen=new Set();
 for(const p of coords){
  assert.ok(p.breweryName && p.prefecture && p.address);
  assert.ok(allowed.has(p.precision));
  assert.ok(Number.isFinite(p.lat) && p.lat>=20 && p.lat<=47);
  assert.ok(Number.isFinite(p.lon) && p.lon>=122 && p.lon<=154);
  assert.equal(p.source,'SAKEOpenData + Geolonia addresses v2');
  const key=p.breweryName+'|'+p.prefecture;
  assert.ok(!seen.has(key),'duplicated brewery: '+key);
  seen.add(key);
  assert.equal(p.pointLevel,p.precision==='lot_or_address'?8:3);
 }
 assert.ok(coords.length>0);
});
test('QA totals reconcile with source inputs and rejects inaccurate region fallback',()=>{
 const {counts,inputs,entries}=report;
 assert.equal(coords.length,counts.lot_or_address+counts.town_approximate);
 assert.equal(inputs,entries.length);
 assert.equal(inputs,Object.values(counts).reduce((a,b)=>a+b,0));
 assert.ok(entries.filter(x=>x.status==='unresolved'||x.status==='error').every(x=>!('latitude' in x)));
});
