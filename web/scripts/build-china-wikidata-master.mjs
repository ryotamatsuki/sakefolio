#!/usr/bin/env node
/** Build a source-linked CC0 Wikidata master without inventing records or coordinates.
 * Run: node scripts/build-china-wikidata-master.mjs
 * WDQS has a 60s deadline and quotas; fail closed on unsuccessful retrieval.
 * No Open Food Facts content is added to this CC0 snapshot (ODbL separation).
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {normalizeChinaMaster,parseWktPoint} from '../src/internationalMaster.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const resultFile=resolve(root,'public/china-wikidata-master.json');
const reportFile=resolve(root,'data/china-wikidata-master-audit.json');
const types=[
  ['baijiu','Q629266'],['huangjiu','Q2724403'],['beer','Q44'],['wine','Q282']
];
const country='Q148';
const prefix=`PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
`;
function productQuery(type){
 return prefix+`SELECT DISTINCT ?item ?itemLabel ?itemDescription ?producer ?producerLabel ?coord WHERE {
  ?item (wdt:P31/wdt:P279*|wdt:P279+) wd:${type} .
  FILTER (?item != wd:${type})
  {
    ?item wdt:P495 wd:${country} .
  } UNION {
    ?item wdt:P17 wd:${country} .
  } UNION {
    ?item wdt:P176 ?chinaProducer .
    ?chinaProducer wdt:P17 wd:${country} .
  }
  OPTIONAL { ?item wdt:P176 ?producer . }
  OPTIONAL { ?producer wdt:P625 ?coord . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,ja,en". }
} LIMIT 800`;
}
function producerQuery(type){
 return prefix+`SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P17 wd:${country} .
  {
    ?item wdt:P1056 ?made .
    ?made (wdt:P31/wdt:P279*|wdt:P279*) wd:${type} .
  } UNION {
    ?item wdt:P31/wdt:P279* wd:Q131734 .
    FILTER(wd:${type} = wd:Q44)
  }
  OPTIONAL { ?item wdt:P625 ?coord . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,ja,en". }
} LIMIT 800`;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function qid(value){
 const match=typeof value==='string'?/^http:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(value):null;
 return match?.[1]||'';
}
function bindingValue(binding,name){return typeof binding?.[name]?.value==='string'?binding[name].value:'';}
async function queryWdqs(name,sparql){
 const params=new URLSearchParams({query:sparql,format:'json'});
 const response=await fetch('https://query.wikidata.org/sparql?'+params.toString(),{
  headers:{'User-Agent':'SakefolioChinaMaster/0.2 (GitHub: ryotamatsuki/sakefolio; academic open-data audit)',
    Accept:'application/sparql-results+json'},signal:AbortSignal.timeout(57000)});
 if(!response.ok)throw new Error(name+' HTTP '+response.status);
 const parsed=await response.json();
 if(!Array.isArray(parsed?.results?.bindings))throw new Error(name+' returned invalid JSON');
 return parsed.results.bindings;
}
const raw=[],failures=[],counts={};
for(const [kind,type] of types){
 for(const [role,make] of [['product',productQuery],['producer',producerQuery]]){
  const task=kind+'-'+role;
  try{
   const bindings=await queryWdqs(task,make(type));
   counts[task+'-bindings']=bindings.length;
   for(const b of bindings){
    const q=qid(bindingValue(b,'item'));if(!q)continue;
    const name=bindingValue(b,'itemLabel').trim();
    if(!name||/^Q\d+$/.test(name))continue;
    const parent=qid(bindingValue(b,'producer'));
    const point=role==='producer'?parseWktPoint(bindingValue(b,'coord')):null;
    raw.push({id:q,kind,class:role,name,description:bindingValue(b,'itemDescription'),
      producerName:bindingValue(b,'producerLabel'),producerId:parent,region:'',
      source:'https://www.wikidata.org/wiki/'+q,
      lat:point?.lat??null,lon:point?.lon??null,
      coordinateSource:point?'https://www.wikidata.org/wiki/'+q:''});
   }
   counts[task+'-accepted']=raw.length;
   console.log(task+' received '+bindings.length+' rows');
  }catch(e){failures.push(task+' '+(e instanceof Error?e.message:String(e)).slice(0,170));console.error('ERROR',task,failures.at(-1));}
  await sleep(1500);
 }
}
const report={source:'https://query.wikidata.org/sparql',queries:8,
 successfulQueries:8-failures.length,failures,counts};
const normalized=normalizeChinaMaster({
 format:'sakefolio-china-wikidata-v1',license:'CC0',
 generatedAt:new Date().toISOString(),report,rows:raw});
for(const kind of types.map(x=>x[0])){
 counts[kind+'-products']=normalized.rows.filter(r=>r.kind===kind&&r.class==='product').length;
 counts[kind+'-producers']=normalized.rows.filter(r=>r.kind===kind&&r.class==='producer').length;
 counts[kind+'-mapped']=normalized.rows.filter(r=>r.kind===kind&&r.class==='producer'&&r.lat!==null).length;
}
console.log(JSON.stringify({total:normalized.rows.length,counts,failures}));
await mkdir(dirname(reportFile),{recursive:true});
await writeFile(reportFile,JSON.stringify({generatedAt:normalized.generatedAt,...report,total:normalized.rows.length},null,2)+'\n');
if(normalized.rows.length===0||report.successfulQueries===0){
 console.error('No verified Wikidata entities retrieved. Existing master remains intact.');process.exitCode=1;
}else{
 await mkdir(dirname(resultFile),{recursive:true});
 await writeFile(resultFile,JSON.stringify(normalized,null,2)+'\n');
}
