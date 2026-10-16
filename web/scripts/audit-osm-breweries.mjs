import fs from 'node:fs/promises';
const targets=JSON.parse(await fs.readFile('data/brewery-official-site-targets.json','utf8'));
const previous=JSON.parse(await fs.readFile('public/brewery-coordinates.json','utf8'));
const original=new Map(previous.map(x=>[x.breweryName+'|'+x.prefecture,x]));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const regions=[
 ['hokkaido',41.2,139.0,46.3,146.2],
 ['tohoku',36.8,138.3,41.6,142.4],
 ['kanto',34.7,138.0,37.2,141.1],
 ['chubu',34.2,135.5,38.7,139.2],
 ['kinki',33.4,134.0,36.1,137.1],
 ['chugoku',33.8,130.7,35.7,135.0],
 ['shikoku',32.7,132.0,34.7,134.9],
 ['kyushu',30.8,128.8,34.0,132.1],
 ['okinawa',24.0,122.7,28.0,130.5]
];
const clean=s=>String(s||'').normalize('NFKC').replace(/株式会社|有限会社|合資会社|合名会社|酒造場|酒造店|酒造|醸造|商店|本店|酒蔵|[\s（）()・ー]/g,'').toLowerCase();
const latlon=x=>x.center?{lat:x.center.lat,lon:x.center.lon}:{lat:x.lat,lon:x.lon};
const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=47&&lon>=122&&lon<=154;
const hav=(a,b,c,d)=>{const r=Math.PI/180,z=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(z)));};
const osm=[];
const queries=[];
for(const [region,s,w,n,e] of regions){
 const q='[out:json][timeout:150][maxsize:70000000];(nwr["craft"="brewery"]('+s+','+w+','+n+','+e+');nwr["industrial"="brewery"]('+s+','+w+','+n+','+e+');nwr["name"~"酒造|酒蔵|醸造|清酒"]('+s+','+w+','+n+','+e+'););out center tags;';
 let elements=[],error=null;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'SakefolioBreweryResearch/1.0 (https://github.com/ryotamatsuki/sakefolio)'},body:new URLSearchParams({data:q}),signal:AbortSignal.timeout(200000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();elements=data.elements||[];break;
  }catch(e){error=String(e.message||e);await delay(20000);}
 }
 queries.push({region,found:elements.length,error:elements.length?null:error});
 for(const x of elements){
  const point=latlon(x),t=x.tags||{};
  if(!valid(point.lat,point.lon))continue;
  osm.push({id:x.type+'/'+x.id,lat:point.lat,lon:point.lon,name:t.name||'',altName:t['name:ja']||t.alt_name||t.official_name||'',website:t.website||t['contact:website']||'',address:[t['addr:prefecture'],t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(''),craft:t.craft||'',industrial:t.industrial||'',region});
 }
 console.log('OSM_REGION '+region+' '+elements.length+' '+(error||'ok'));
 await delay(18000);
}
const dedup=[...new Map(osm.map(x=>[x.id,x])).values()];
const out=[];
for(const t of targets){
 const base=original.get(t.breweryName+'|'+t.prefecture);
 const targetName=clean(t.breweryName);
 const candidates=[];
 for(const o of dedup){
  const n=clean(o.name),alt=clean(o.altName);
  const exact=!!targetName&&(targetName===n||targetName===alt);
  const loose=!!targetName&&targetName.length>=4&&((n&&n.includes(targetName))||(targetName.includes(n)&&n.length>=4));
  if(!exact&&!loose)continue;
  const distance=base?hav(base.lat,base.lon,o.lat,o.lon):null;
  if(distance!==null&&distance>20)continue;
  const websiteMatch=!!t.website&&!!o.website&&(()=>{try{return new URL(t.website).hostname.replace(/^www\./,'')===new URL(o.website).hostname.replace(/^www\./,'');}catch{return false;}})();
  const addressMatch=!!t.address&&!!o.address&&t.address.replace(/\s/g,'').includes(o.address.replace(/\s/g,''));
  const isBrewery=o.craft==='brewery'||o.industrial==='brewery';
  const score=(exact?4:1)+(websiteMatch?4:0)+(addressMatch?3:0)+(isBrewery?2:0)+(distance!==null&&distance<=1?2:0);
  candidates.push({...o,exactNameMatch:exact,websiteMatch,addressMatch,distanceToPriorKm:distance===null?null:+distance.toFixed(3),score});
 }
 candidates.sort((a,b)=>b.score-a.score||(a.distanceToPriorKm??1000)-(b.distanceToPriorKm??1000));
 const best=candidates[0];
 // Candidate only: OSM can describe a shop, head office or closed brewery. No silent overwrite.
 out.push({breweryName:t.breweryName,prefecture:t.prefecture,previousPrecision:base?.precision||'unresolved',website:t.website,referenceAddress:t.address,osmCandidates:candidates.slice(0,5),reviewPriority:base?.precision==='town_approximate'||!base?'high':'standard',promoted:false});
}
const counts={targets:targets.length,priorLot:previous.filter(x=>x.precision==='lot_or_address').length,priorTown:previous.filter(x=>x.precision==='town_approximate').length,osmObjects:dedup.length,matched:out.filter(x=>x.osmCandidates.length).length,highPriorityMatched:out.filter(x=>x.reviewPriority==='high'&&x.osmCandidates.length).length,highConfidenceCandidates:out.filter(x=>{const c=x.osmCandidates[0];return c&&c.exactNameMatch&&(c.websiteMatch||c.addressMatch)&&c.score>=8;}).length};
await fs.writeFile('data/brewery-osm-location-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),queries,counts,license:'OpenStreetMap contributors, ODbL 1.0. See https://www.openstreetmap.org/copyright',methodology:'Overpass regional queries, exact/normalized name, website, address, and distance scoring. All OSM coordinates are candidates; no automatic promotion.',results:out},null,2)+'\n');
console.log('OSM_AUDIT '+JSON.stringify(counts));
