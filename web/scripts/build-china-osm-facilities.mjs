#!/usr/bin/env node
/** One-off/opt-in source-linked ODbL facility snapshot; never infer private locations. */
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeOverpass} from '../src/internationalOsm.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'public/china-osm-facilities.json');
const report=resolve(root,'data/china-osm-facility-report.json');
const sparql=`[out:json][timeout:75];
area["ISO3166-1"="CN"]["admin_level"="2"]->.cn;
(
 nwr(area.cn)["craft"~"^(brewery|winery|distillery)$"]["name"];
 nwr(area.cn)["industrial"~"^(brewery|winery|distillery)$"]["name"];
);
out center 1600;`;
let rows=0,failed='';
try{
 const response=await fetch('https://overpass-api.de/api/interpreter',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
     'User-Agent':'SakefolioChinaFacilityAudit/0.1 (ryotamatsuki/sakefolio)',
     Accept:'application/json'},
   body:new URLSearchParams({data:sparql}),signal:AbortSignal.timeout(105000)});
 if(!response.ok)throw new Error('Overpass HTTP '+response.status);
 const data=await response.json(),snapshot=normalizeOverpass(data);
 rows=snapshot.rows.length;
 if(!rows)throw new Error('No named facility locations returned; no data replaced.');
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(snapshot,null,2)+'\n');
 console.log('ODbL facilities:',rows,'types:',Object.fromEntries(['beer','wine','unclassified'].map(k=>[k,snapshot.rows.filter(x=>x.kind===k).length])));
}catch(e){failed=e instanceof Error?e.message:String(e);console.error(failed);process.exitCode=1;}
await mkdir(dirname(report),{recursive:true});
await writeFile(report,JSON.stringify({checkedAt:new Date().toISOString(),source:'https://overpass-api.de/api/interpreter',
 query:'craft or industrial=brewery/winery/distillery within area ISO3166-1=CN',
 license:'ODbL',rows,failed},null,2)+'\n');
