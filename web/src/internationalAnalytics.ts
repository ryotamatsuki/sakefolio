import type {InternationalRecord} from './internationalLocal.ts';
import type {BeverageKind} from './internationalCatalog.ts';
import {sensoryAxesFor,sensoryAxisScore,sensoryDescriptorValues} from './internationalSensory.ts';
import {canonicalSpec,specStats} from './internationalInput.ts';
export type InternationalFacet='brand'|'producer'|'region'|'volume'|'abv'|'aromaStyle'|'sugarStyle'|'huangjiuStyle'|'beerStyle'|'bitterness'|'body'|'wineStyle'|'grapes'|'aroma'|'taste'|'rating';
export interface FacetStat {label:string;count:number;ratedCount:number;mean:number|null}
export interface InternationalInsight {id:string;facet:InternationalFacet;value:string;text:string;detail:string}
export interface AxisStat {
 key:string;label:string;low:string;high:string;mean:number|null;count:number;
 distribution:number[];
}
export interface InternationalAnalyticsReport {
 total:number;tasted:number;rated:number;mean:number|null;photoCount:number;
 distribution:number[];axes:AxisStat[];
 specs:{
  volume:ReturnType<typeof specStats>;
  abv:ReturnType<typeof specStats>;
 };
 facets:Partial<Record<InternationalFacet,FacetStat[]>>;
 insights:InternationalInsight[];
}
const score=(r:InternationalRecord,includeTests=false):number|null=>
 (r.experience==='tasted'||(includeTests&&r.experience==='test'))&&/^[1-5]$/.test(r.rating)?Number(r.rating):null;
const average=(arr:number[])=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
const split=(v:string)=>[...new Set(v.split(/[,，、;；]/).map(t=>t.trim()).filter(Boolean))].slice(0,15);
export const KIND_FACETS:Record<BeverageKind,{facet:InternationalFacet;label:string}[]>={
 baijiu:[{facet:'aromaStyle',label:'香型'},{facet:'aroma',label:'香りのメモ'},{facet:'taste',label:'味わいのメモ'}],
 huangjiu:[{facet:'huangjiuStyle',label:'黄酒の区分'},{facet:'sugarStyle',label:'糖度区分'},{facet:'aroma',label:'香りのメモ'},{facet:'taste',label:'味わいのメモ'}],
 beer:[{facet:'beerStyle',label:'ビアスタイル'},{facet:'bitterness',label:'苦味の印象'},{facet:'body',label:'ボディ'},
  {facet:'aroma',label:'香りの特徴'},{facet:'taste',label:'味わいの特徴'}],
 wine:[{facet:'wineStyle',label:'ワインの種類'},{facet:'grapes',label:'ブドウ品種'},{facet:'body',label:'ボディ'},
  {facet:'aroma',label:'香りの特徴'},{facet:'taste',label:'味わいの特徴'}]
};
export function facetValues(r:InternationalRecord,facet:InternationalFacet,includeTests=false):string[]{
 if(facet==='aroma'||facet==='taste')return sensoryDescriptorValues(r.attributes,
   facet==='aroma'?r.aroma:r.taste,facet);
 const value=facet==='brand'?r.brandName:facet==='producer'?r.producer:
  facet==='region'?r.region:facet==='rating'?String(score(r,includeTests)??''):
  facet==='volume'||facet==='abv'?canonicalSpec(facet,r.attributes[facet])||'':
  r.attributes[facet]||'';
 return facet==='grapes'?split(value):value.trim()?[value.trim()]:[];
}
export function filterInternationalRecords(records:InternationalRecord[],facet:InternationalFacet,value:string,includeTests=false){
 return records.filter(r=>facetValues(r,facet,includeTests).includes(value));
}
export function analyzeInternational(records:InternationalRecord[],kind:BeverageKind,includeTests=false):InternationalAnalyticsReport{
 const subset=records.filter(r=>r.kind===kind&&(includeTests||r.experience!=='test'));
 const tasted=subset.filter(r=>r.experience==='tasted'||(includeTests&&r.experience==='test'));
 const allRated=tasted.map(r=>score(r,includeTests)).filter((v):v is number=>v!==null),mean=average(allRated);
 const dimensions:InternationalFacet[]=['brand','producer','region','volume','abv',...KIND_FACETS[kind].map(x=>x.facet)];
 const facets:InternationalAnalyticsReport['facets']={};
 for(const facet of dimensions){
   const groups=new Map<string,InternationalRecord[]>();
   for(const r of subset){
     for(const key of new Set(facetValues(r,facet,includeTests))){
       if(key.length>80)continue;
       if(!groups.has(key))groups.set(key,[]);
       groups.get(key)!.push(r);
     }
   }
   facets[facet]=[...groups.entries()].map(([label,items])=>{
     const ratings=items.map(r=>score(r,includeTests)).filter((v):v is number=>v!==null);
     return {label,count:items.length,ratedCount:ratings.length,mean:average(ratings)};
   }).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ja'));
 }
 const specs={volume:specStats(subset.map(r=>r.attributes),'volume'),
   abv:specStats(subset.map(r=>r.attributes),'abv')};
 const axes:AxisStat[]=sensoryAxesFor(kind).map(axis=>{
   const values=tasted.map(r=>sensoryAxisScore(r.attributes[axis.key])).filter((v):v is number=>v!==null);
   return {key:axis.key,label:axis.label,low:axis.low,high:axis.high,
     count:values.length,mean:average(values),
     distribution:[1,2,3,4,5].map(n=>values.filter(v=>v===n).length)};
 });
 const insights:InternationalInsight[]=[];
 for(const facet of dimensions){
   const relevant=tasted.filter(r=>facetValues(r,facet,includeTests).length>0);
   if(relevant.length<7)continue;
   for(const group of facets[facet]||[]){
     if(group.ratedCount<3||group.mean===null)continue;
     const others=tasted.filter(r=>!facetValues(r,facet,includeTests).includes(group.label))
       .map(r=>score(r,includeTests)).filter((v):v is number=>v!==null);
     if(others.length<3)continue;
     const base=average(others)!;
     const delta=group.mean-base;
     if(Math.abs(delta)<0.35)continue;
     insights.push({id:facet+':'+group.label,facet,value:group.label,
       text:'「'+group.label+'」の評価は'+(delta>0?'比較的高め':'比較的控えめ'),
       detail:'該当'+group.ratedCount+'件（平均'+group.mean.toFixed(2)+'点）／その他'+others.length+'件（平均'+base.toFixed(2)+'点）。差'+(delta>0?'+':'')+delta.toFixed(2)+'点。UXTESTを含めた場合は実際の嗜好ではありません。'});
   }
 }
 insights.sort((a,b)=>a.text.localeCompare(b.text,'ja'));
 return {total:subset.length,tasted:tasted.length,rated:allRated.length,mean,
  photoCount:subset.filter(r=>r.photo!==null||!!r.photoId).length,
  distribution:[1,2,3,4,5].map(v=>allRated.filter(x=>x===v).length),axes,specs,facets,insights};
}
