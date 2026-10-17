import type {BeverageKind} from './internationalCatalog.ts';

export type MasterClass='product'|'producer';
export interface ChinaMasterRow {
 id:string;kind:BeverageKind;class:MasterClass;name:string;description:string;
 producerName:string;producerId:string;region:string;source:string;
 lat:number|null;lon:number|null;coordinateSource:string;
}
export interface ChinaMaster {
 format:'sakefolio-china-wikidata-v1';generatedAt:string;license:'CC0';
 rows:ChinaMasterRow[];
 report:{source:string;queries:number;successfulQueries:number;failures:string[];counts:Record<string,number>};
}
export const EMPTY_CHINA_MASTER:ChinaMaster={
 format:'sakefolio-china-wikidata-v1',generatedAt:'',license:'CC0',
 rows:[],report:{source:'https://query.wikidata.org/sparql',queries:0,successfulQueries:0,failures:[],counts:{}}
};
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=(v:unknown)=>{const s=string(v);return /^Q[1-9]\d{0,11}$/.test(s)?s:'';};
const coords=(v:unknown):{lat:number;lon:number}|null=>{
 if(!isObj(v)||typeof v.lat!=='number'||typeof v.lon!=='number'||!Number.isFinite(v.lat)||!Number.isFinite(v.lon))return null;
 if(v.lat<18||v.lat>54||v.lon<73||v.lon>136)return null;
 return {lat:v.lat,lon:v.lon};
};
export function parseWktPoint(raw:unknown):{lat:number;lon:number}|null{
 if(typeof raw!=='string')return null;
 const match=/^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(raw);
 if(!match)return null;
 return coords({lon:Number(match[1]),lat:Number(match[2])});
}
export function normalizeChinaMaster(input:unknown):ChinaMaster{
 if(!isObj(input)||input.format!=='sakefolio-china-wikidata-v1'||!Array.isArray(input.rows)||input.rows.length>30000)
   return EMPTY_CHINA_MASTER;
 const seen=new Set<string>(),rows:ChinaMasterRow[]=[];
 for(const x of input.rows){
   if(!isObj(x))continue;
   const q=id(x.id),kind=x.kind,className=x.class;
   if(!q||!['baijiu','huangjiu','beer','wine'].includes(String(kind))||
       !['product','producer'].includes(String(className))||seen.has(className+':'+q))continue;
   const name=string(x.name);
   if(!name||/^Q\d+$/.test(name))continue;
   const point=coords(x),origin=string(x.coordinateSource,200);
   // Require explicit item-level coordinate provenance; do not copy province/city centroids.
   const located=point&&origin==='https://www.wikidata.org/wiki/'+q;
   rows.push({id:q,kind:kind as BeverageKind,class:className as MasterClass,name,
     description:string(x.description,350),producerName:string(x.producerName),
     producerId:id(x.producerId),region:string(x.region),
     source:'https://www.wikidata.org/wiki/'+q,lat:located?point.lat:null,
     lon:located?point.lon:null,coordinateSource:located?origin:''});
   seen.add(className+':'+q);
 }
 const report=isObj(input.report)?input.report:{};
 return {
   format:'sakefolio-china-wikidata-v1',license:'CC0',
   generatedAt:string(input.generatedAt,35),rows,
   report:{
    source:'https://query.wikidata.org/sparql',
    queries:typeof report.queries==='number'?report.queries:0,
    successfulQueries:typeof report.successfulQueries==='number'?report.successfulQueries:0,
    failures:Array.isArray(report.failures)?report.failures.filter((v):v is string=>typeof v==='string').slice(0,30):[],
    counts:isObj(report.counts)?Object.fromEntries(Object.entries(report.counts).filter(([,v])=>typeof v==='number')):{}
   }
 };
}
export function chinaMasterSearch(rows:ChinaMasterRow[],kind:BeverageKind,term:string,limit=30){
 const q=term.trim().normalize('NFKC').toLocaleLowerCase();
 if(!q)return rows.filter(r=>r.kind===kind).slice(0,limit);
 return rows.filter(r=>r.kind===kind&&[r.name,r.description,r.producerName,r.region].some(t=>t.normalize('NFKC').toLocaleLowerCase().includes(q)))
  .slice(0,limit);
}
export const mapProducers=(rows:ChinaMasterRow[])=>rows.filter(row=>row.class==='producer'&&row.lat!==null&&row.lon!==null);
export function wikidataMatchedLocations(rows:ChinaMasterRow[],producerQid:string){
 return rows.filter(r=>r.class==='producer'&&r.id===producerQid&&r.lat!==null&&r.lon!==null);
}
