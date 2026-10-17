#!/usr/bin/env node
/** Sparse open-source facility snapshot. Bounded queries avoid full-country Overpass timeouts. */
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeOverpass,normalizeOsmSnapshot} from '../src/internationalOsm.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'public/china-osm-facilities.json');
const report=resolve(root,'data/china-osm-facility-report.json');
// Search windows, not facility coordinates. Nationwide completeness is NOT claimed.
const regions=[
 ['青島',35.8,120.1,36.3,120.8],
 ['紹興',29.7,120.2,30.4,121.1],
 ['煙台',37.1,121.0,37.7,122.0],
 ['寧夏',37.5,105.5,39.1,107.0],
 ['貴州・仁懐',27.55,106.0,28.2,106.75],
 ['瀘州・宜賓',28.6,104.2,29.35,106.1],
 ['北京',39.5,115.8,40.3,117.0],
 ['上海',30.8,120.8,31.7,121.95]
];
const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
const all=[],errors=[],counts={};
for(const [name,south,west,north,east] of regions){
 const bbox=[south,west,north,east].join(',');
 const query='[out:json][timeout:24];('+
  'nwr["craft"~"^(brewery|winery|distillery)$"]["name"]('+bbox+');'+
  'nwr["industrial"~"^(brewery|winery|distillery)$"]["name"]('+bbox+');'+
  ');out center 350;';
 let done=false;
 for(const endpoint of endpoints){
  try{
   const response=await fetch(endpoint,{method:'POST',
     headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
       'User-Agent':'SakefolioChinaFacilityAudit/0.2 (ryotamatsuki/sakefolio)',Accept:'application/json'},
     body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const json=await response.json();
   if(!Array.isArray(json?.elements))throw Error('Bad Overpass JSON');
   const parsed=normalizeOverpass(json);
   all.push(...parsed.rows);counts[name]=parsed.rows.length;done=true;
   console.log(name,parsed.rows.length,'OSM facilities');
   break;
  }catch(e){errors.push(name+' '+endpoint+' '+(e instanceof Error?e.message:String(e)).slice(0,100));}
 }
 if(!done)console.warn('No returned data for',name);
 await new Promise(r=>setTimeout(r,900));
}
const unique=new Map(all.map(x=>[x.id,x]));
const snapshot=normalizeOsmSnapshot({format:'sakefolio-china-osm-facilities-v1',
 generatedAt:new Date().toISOString(),license:'ODbL',rows:[...unique.values()]});
const rows=snapshot.rows.length,failed=rows?'':'No actual OSM facilities obtained in surveyed areas';
if(rows){
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(snapshot,null,2)+'\n');
}else process.exitCode=1;
await mkdir(dirname(report),{recursive:true});
await writeFile(report,JSON.stringify({checkedAt:new Date().toISOString(),
 source:endpoints,scope:'Selected China beverage producing hubs only; not national coverage',
 license:'ODbL',areas:regions.map(x=>x[0]),counts,rows,errors,failed},null,2)+'\n');
if(!rows)console.error(failed);
