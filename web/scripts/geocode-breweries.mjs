import fs from 'node:fs/promises';
import { normalize } from '@geolonia/normalize-japanese-addresses';

// Reproducible, cautious bulk geocoding from SAKEOpenData reference addresses.
// Only store geographically plausible results which normalize into the expected prefecture.
// A point with level=8 is a postal/frontage or cadastral/lot *representative* point,
// not a verified sake brewery building. A town-level point must never be rendered as exact.
const inputPath=new URL('../public/brewery-addresses.json',import.meta.url);
const outputPath=new URL('../public/brewery-coordinates.json',import.meta.url);
const reportPath=new URL('../data/brewery-geocoding-report.json',import.meta.url);
const source=JSON.parse(await fs.readFile(inputPath,'utf8'));
const statuses=[];
const coordinates=[];
const batchSize=4;
const start=Date.now();
const clean = value => (value || '').normalize('NFKC').replace(/\s+/gu,'').replace(/[‐‑‒–—―−ー]/gu,'-');
const inJapan=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=47&&lon>=122&&lon<=154;
function classify(sourceRow,res){
 const point=res.point||{};
 const lat=Number(point.lat),lon=Number(point.lng);
 if(!inJapan(lat,lon))return {status:'unresolved',reason:'no_valid_japan_coordinate'};
 if(res.pref!==sourceRow.prefecture)return {status:'unresolved',reason:'prefecture_mismatch',normalizedPrefecture:res.pref||''};
 const sourceAddress=clean(sourceRow.address),outputAddress=clean([res.pref,res.city,res.town,res.addr].filter(Boolean).join(''));
 // Match the normalized municipal address stem, allowing official kanji / formatting normalization.
 const matchCity=!!res.city && (sourceAddress.includes(clean(res.city)) || res.level>=8);
 if(!matchCity)return {status:'unresolved',reason:'municipality_not_corresponding'};
 if(Number(point.level)===8 && Number(res.level)===8) {
   return {status:'lot_or_address',latitude:+lat.toFixed(8),longitude:+lon.toFixed(8),
    normalized:outputAddress,unparsed:res.other||'',pointLevel:8,normalizationLevel:Number(res.level)};
 }
 if(Number(point.level)===3 && Number(res.level)>=3) {
   return {status:'town_approximate',latitude:+lat.toFixed(8),longitude:+lon.toFixed(8),
    normalized:outputAddress,unparsed:res.other||'',pointLevel:3,normalizationLevel:Number(res.level)};
 }
 return {status:'unresolved',reason:'insufficient_precision',pointLevel:Number(point.level||0),normalizationLevel:Number(res.level||0)};
}
async function run(item,i){
 try{
  const res=await normalize(item.address);
  const classified=classify(item,res);
  const record={breweryName:item.breweryName,prefecture:item.prefecture,address:item.address,
    ...classified};
  statuses[i]=record;
  if(record.status==='lot_or_address'||record.status==='town_approximate'){
   coordinates.push({breweryName:record.breweryName,prefecture:record.prefecture,
    address:record.address,lat:record.latitude,lon:record.longitude,
    precision:record.status,source:'SAKEOpenData + Geolonia addresses v2',
    normalizationLevel:record.normalizationLevel,pointLevel:record.pointLevel});
  }
 }catch(error){
  statuses[i]={breweryName:item.breweryName,prefecture:item.prefecture,address:item.address,
    status:'error',reason:String(error?.message||error).slice(0,240)};
 }
 if((i+1)%100===0)console.log('Processed '+(i+1)+' / '+source.length+' entries');
}
for(let i=0;i<source.length;i+=batchSize){
 await Promise.all(source.slice(i,i+batchSize).map((item,j)=>run(item,i+j)));
}
coordinates.sort((a,b)=>a.prefecture.localeCompare(b.prefecture,'ja')||a.breweryName.localeCompare(b.breweryName,'ja'));
const counts=Object.fromEntries(['lot_or_address','town_approximate','unresolved','error'].map(s=>[s,statuses.filter(x=>x.status===s).length]));
const report={
 generatedAt:new Date().toISOString(),
 inputs:source.length,counts,elapsedSeconds:Math.round((Date.now()-start)/1000),
 normalizer:'@geolonia/normalize-japanese-addresses',
 addressData:'Geolonia japanese-addresses-v2 (Digital Agency Address Base Registry, CC BY 4.0)',
 originalAddressData:'SAKEOpenData (MIT)',
 caveats:[
  'lot_or_address indicates address frontage or cadastral parcel representative point; never a verified brewery building entrance.',
  'town_approximate indicates a town/neighborhood representative point, not the brewery location.',
  'Unresolved and error entries have no coordinate in the public dataset.',
  'Address changes, head office vs brewery distinction, and duplicate street addresses require subsequent spot checks.'
 ],
 entries:statuses
};
await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
await fs.writeFile(outputPath,JSON.stringify(coordinates,null,2)+'\n','utf8');
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log('Geocoding result '+JSON.stringify({inputs:source.length,...counts,seconds:report.elapsedSeconds}));
if(coordinates.length===0)process.exitCode=1;
