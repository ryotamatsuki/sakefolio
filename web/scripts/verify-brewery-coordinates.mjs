import fs from 'node:fs/promises';
const root='.';
const [old,osm,official,targets]=await Promise.all([
 fs.readFile(root+'/public/brewery-coordinates.json','utf8').then(JSON.parse),
 fs.readFile(root+'/data/brewery-osm-location-audit.json','utf8').then(JSON.parse),
 fs.readFile(root+'/data/brewery-official-site-audit.json','utf8').then(JSON.parse),
 fs.readFile(root+'/data/brewery-official-site-targets.json','utf8').then(JSON.parse)
]);
if(!osm.queries?.some(q=>q.error===null)||osm.counts?.osmObjects===0)throw Error('OSM dataset unavailable: refuse coordinate updates');
const key=x=>x.breweryName+'|'+x.prefecture;
const prev=new Map(old.map(x=>[key(x),x]));
const officialMap=new Map(official.results.map(x=>[key(x),x]));
const audit=new Map(osm.results.map(x=>[key(x),x]));
const rad=Math.PI/180;
const km=(a,b,c,d)=>{const x=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(x)));};
const evidence=[],updated=[];
for(const t of targets){
 const id=key(t),existing=prev.get(id),o=audit.get(id),page=officialMap.get(id);
 const choices=o?.osmCandidates||[];
 const verifiedAddress=!!page?.addressMentions?.some(p=>p.exact&&p.address===t.address);
 const qualified=choices.filter(c=>{
  if(!c.exactNameMatch||!(c.craft==='brewery'||c.industrial==='brewery'))return false;
  if(!c.websiteMatch&&!c.addressMatch)return false;
  if(!verifiedAddress&&!c.addressMatch)return false;
  if(existing?.precision==='lot_or_address'&&!(c.websiteMatch&&c.addressMatch))return false;
  if(existing&&km(existing.lat,existing.lon,c.lat,c.lon)>3)return false;
  if(!existing&&!c.addressMatch)return false;
  return true;
 });
 const selected=qualified.length===1?qualified[0]:null;
 let reason='no_high_confidence_match';
 if(qualified.length>1)reason='ambiguous_osm_features';
 else if(selected){
  if(existing&&km(existing.lat,existing.lon,selected.lat,selected.lon)<0.025)reason='already_within_25m';
  else{
   const point={...existing,breweryName:t.breweryName,prefecture:t.prefecture,address:t.address||existing?.address||'',
    lat:selected.lat,lon:selected.lon,pointLevel:9,precision:'facility_osm_verified',source:'OpenStreetMap contributors (ODbL), independent official address/site cross-check',
    osmElement:selected.id,verification:{websiteMatch:selected.websiteMatch,addressMatch:selected.addressMatch,officialAddressMatch:verifiedAddress,sourceUrl:'https://www.openstreetmap.org/'+selected.id,checkedAt:new Date().toISOString()}};
   prev.set(id,point);
   updated.push({breweryName:t.breweryName,prefecture:t.prefecture,old:existing?{lat:existing.lat,lon:existing.lon,precision:existing.precision}:null,new:{lat:point.lat,lon:point.lon,precision:point.precision},distanceMovedMeters:existing?Math.round(km(existing.lat,existing.lon,point.lat,point.lon)*1000):null,osmElement:selected.id});
   reason='promoted';
  }
 }
 if(choices.length||page?.coordinateCandidates?.length)evidence.push({breweryName:t.breweryName,prefecture:t.prefecture,previousPrecision:existing?.precision||'unresolved',osmCandidates:choices.length,officialCandidates:page?.coordinateCandidates?.length||0,officialAddressConfirmed:verifiedAddress,decision:reason,selectedOSM:selected?.id||null});
}
const out=[...prev.values()].sort((a,b)=>a.prefecture.localeCompare(b.prefecture,'ja')||a.breweryName.localeCompare(b.breweryName,'ja'));
if(out.length<old.length)throw Error('Unexpected coordinate loss');
const report={generatedAt:new Date().toISOString(),baseline:old.length,final:out.length,updates:updated.length,added:updated.filter(x=>!x.old).length,precisionPolicy:'Only exact brewery OSM name, craft/industrial brewery, independent website/address match, matching official published address or OSM address, unique candidate, within 3km of previous location. No Google Maps coordinates copied. Lot-level points require both OSM website and address match.',license:'OpenStreetMap contributors, ODbL 1.0; https://www.openstreetmap.org/copyright',changes:updated,candidates:evidence};
await fs.writeFile('data/brewery-coordinate-verification.json',JSON.stringify(report,null,2)+'\n');
if(updated.length)await fs.writeFile('public/brewery-coordinates.json',JSON.stringify(out,null,2)+'\n');
console.log('VERIFICATION '+JSON.stringify({baseline:old.length,final:out.length,updates:updated.length,added:report.added}));
