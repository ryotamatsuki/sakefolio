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
 return prefix+`SELECT DISTINCT ?item ?itemLabel ?itemDescription ?producer ?producerLabel WHERE {
  ?item (wdt:P31|wdt:P279) wd:${type} .
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
/* WDQS property-path searches for individual bottles can time out. Augment them
 * using Wikidata's search+entity APIs and STRICT classification from actual claims.
 * Search relevance alone never makes an item a beverage record. */
const queriesByType={
 baijiu:['白酒','茅台','五粮液','泸州老窖','汾酒','剑南春','洋河','郎酒','古井贡酒','西凤酒','酒鬼酒'],
 huangjiu:['黄酒','绍兴酒','花雕酒','加饭酒','古越龙山','会稽山','女儿红','塔牌'],
 beer:['啤酒','青岛啤酒','雪花啤酒','燕京啤酒','哈尔滨啤酒','珠江啤酒','精酿啤酒','Tsingtao'],
 wine:['葡萄酒','中国葡萄酒','宁夏葡萄酒','张裕葡萄酒','长城葡萄酒','王朝葡萄酒','贺兰山东麓','新疆葡萄酒']
};
const qualifiedParent={baijiu:['Q629266'],huangjiu:['Q2724403','Q175245'],
 beer:['Q44','Q15075508','Q25866325'],wine:['Q282']};
const entities=new Map(),searched=new Map();
let searchRuns=0,searchSuccess=0;
async function api(params){
 const url='https://www.wikidata.org/w/api.php?'+new URLSearchParams({...params,format:'json'});
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,{headers:{'User-Agent':'SakefolioChinaMaster/0.2 (ryotamatsuki/sakefolio)',
    Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  if(response.status===429 && attempt<2){
    const seconds=Number(response.headers.get('retry-after'))||0;
    await sleep(Math.min(30000,Math.max(4000*(attempt+1),seconds*1000)));continue;
  }
  if(!response.ok)throw Error('Wikidata API HTTP '+response.status);
  const body=await response.json();
  if(body?.error)throw Error(String(body.error.code));
  return body;
 }
 throw Error('Wikidata API throttled');
}
// Rotate categories to give every beverage a fair chance before upstream throttling.
const searchQueue=[];
for(let i=0;i<Math.max(...Object.values(queriesByType).map(t=>t.length));i++)
 for(const [kind,terms] of Object.entries(queriesByType))
  if(terms[i])searchQueue.push({kind,term:terms[i]});
for(const {kind,term} of searchQueue){
 searchRuns++;
 try{
  const data=await api({action:'wbsearchentities',search:term,language:'zh',uselang:'en',type:'item',limit:'35'});
  for(const item of data.search||[])if(/^Q[1-9]\d*$/.test(item.id||'')){
   if(!searched.has(item.id))searched.set(item.id,new Set());
   searched.get(item.id).add(kind);
  }
  searchSuccess++;
 }catch(error){failures.push('search-'+term+' '+String(error).slice(0,120));}
 await sleep(1250);
}
const qids=[...new Set([...searched.keys(),...raw.map(r=>r.id),
 'Q1518607','Q313542','Q5072156'])];
for(let i=0;i<qids.length;i+=45){
 try{
   const results=await api({action:'wbgetentities',ids:qids.slice(i,i+45).join('|'),
      props:'claims|labels|descriptions',languages:'zh|ja|en',languagefallback:'1'});
   for(const [qid,entity] of Object.entries(results.entities||{}))
     if(entity&&entity.type==='item')entities.set(qid,entity);
 }catch(error){failures.push('entity-batch-'+i+' '+String(error).slice(0,130));}
 await sleep(1400);
}
function claims(q,prop){
 return (entities.get(q)?.claims?.[prop]||[]).map(s=>s?.mainsnak?.datavalue?.value).filter(Boolean);
}
const linked=(q,prop)=>claims(q,prop).map(v=>v?.id||'').filter(Boolean);
const p17China=q=>linked(q,'P17').includes('Q148');
for(const row of raw){
 const point=claims(row.id,'P625').find(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude));
 if(row.class==='producer'&&point){
   row.lat=point.latitude;row.lon=point.longitude;
   row.coordinateSource='https://www.wikidata.org/wiki/'+row.id;
 }
}
for(const [qid,kinds] of searched){
 const entity=entities.get(qid);if(!entity)continue;
 const label=entity.labels?.zh?.value||entity.labels?.ja?.value||entity.labels?.en?.value||'';
 const desc=entity.descriptions?.zh?.value||entity.descriptions?.en?.value||'';
 if(!label||label.length>200)continue;
 const types=[...linked(qid,'P31'),...linked(qid,'P279')];
 const makers=linked(qid,'P176');
 const country=linked(qid,'P495').includes('Q148')||p17China(qid)||
   makers.some(m=>p17China(m)||raw.some(r=>r.class==='producer'&&r.id===m));
 if(!country)continue;
 for(const kind of kinds){
   if(!types.some(q=>qualifiedParent[kind].includes(q)))continue;
   const parent=makers[0]||'';
   raw.push({id:qid,kind,class:'product',name:label,description:desc,
    producerName:entities.get(parent)?.labels?.zh?.value||'',producerId:parent,
    region:'',source:'https://www.wikidata.org/wiki/'+qid,
    lat:null,lon:null,coordinateSource:''});
   for(const maker of makers){
     const m=entities.get(maker);
     if(!m||!p17China(maker))continue;
     const label2=m.labels?.zh?.value||m.labels?.en?.value||'';
     const point=claims(maker,'P625').find(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude));
     if(label2)raw.push({id:maker,kind,class:'producer',name:label2,
       description:m.descriptions?.en?.value||'',producerName:'',producerId:'',
       region:'',source:'https://www.wikidata.org/wiki/'+maker,
       lat:point?.latitude??null,lon:point?.longitude??null,
       coordinateSource:point?'https://www.wikidata.org/wiki/'+maker:''});
   }
 }
}
counts['mediawiki-candidate-ids']=searched.size;
counts['mediawiki-entity-ids']=entities.size;
counts['mediawiki-search-success']=searchSuccess;
const report={source:'https://query.wikidata.org/sparql',queries:8+searchRuns,
 successfulQueries:8-failures.filter(x=>/^(baijiu|huangjiu|beer|wine)-(product|producer)/.test(x)).length+searchSuccess,
 failures,counts};
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
