import type {RecordEntry} from './types';
import {AROMA_GROUPS,TASTE_GROUPS,selectedIds} from './sensory.ts';
import {validRating} from './tasteAnalytics.ts';

export type DashboardDimension='prefecture'|'brewery'|'brand'|'type'|'aroma'|'taste'|'style'|'method'|'heat'|'rice'|'month'|'rating'|'axis'|'all'|'rated'|'photo'|'high'|'record';
export type IndexDimension='prefectures'|'breweries'|'brands'|'types'|'aromas'|'tastes'|'months'|'axes';
export interface Drilldown {kind:DashboardDimension|'index';value?:string;index?:IndexDimension;label:string}
export type RecordSort='date'|'rating-desc'|'rating-asc'|'name';

const aromaLabel=new Map(AROMA_GROUPS.flatMap(g=>g.terms.map(t=>[t.id,t.label])));
const tasteLabel=new Map(TASTE_GROUPS.flatMap(g=>g.terms.map(t=>[t.id,t.label])));
function values(record:RecordEntry,dimension:DashboardDimension):string[]{
  switch(dimension){
    case 'prefecture':return [record.prefecture];
    case 'brewery':return [record.breweryName];
    case 'brand':return [record.brandName];
    case 'type':return [record.sakeType];
    case 'heat':return [record.heatTreatment];
    case 'method':return [record.brewingMethod];
    case 'rice':return [record.riceVariety];
    case 'style':return (record.processingStyles||'').split(',').map(x=>x.trim());
    case 'aroma':return selectedIds(record.aromaTagIds).map(id=>aromaLabel.get(id)||'');
    case 'taste':return selectedIds(record.tasteTagIds).map(id=>tasteLabel.get(id)||'');
    case 'month':return [record.drinkingDate?.slice(0,7)||''];
    case 'rating':return [String(validRating(record)??'')];
    default:return [];
  }
}
export function matchesDrilldown(record:RecordEntry,drill:Drilldown):boolean{
  if(drill.kind==='record')return record.reviewId===drill.value;
  if(drill.kind==='all'||drill.kind==='index')return true;
  if(drill.kind==='rated')return validRating(record)!==null;
  if(drill.kind==='photo')return Boolean(record.photoId);
  if(drill.kind==='high')return (validRating(record)??0)>=4;
  if(drill.kind==='axis')return /^[1-5]$/.test(String(record[drill.value as keyof RecordEntry]||''));
  return values(record,drill.kind).includes(drill.value||'');
}
export function getDrilldownRecords(records:RecordEntry[],path:Drilldown[]):RecordEntry[]{
  return records.filter(r=>path.every(spec=>matchesDrilldown(r,spec)));
}
export function sortDrilldownRecords(records:RecordEntry[],sort:RecordSort):RecordEntry[]{
  return [...records].sort((a,b)=>{
    if(sort==='rating-desc'||sort==='rating-asc'){
      const sa=validRating(a),sb=validRating(b);
      if(sa===null&&sb!==null)return 1;
      if(sb===null&&sa!==null)return -1;
      if(sa!==null&&sb!==null&&sa!==sb)return sort==='rating-desc'?sb-sa:sa-sb;
    }
    if(sort==='name'){
      const n=a.brandName.localeCompare(b.brandName,'ja');
      if(n)return n;
    }
    return (b.drinkingDate||'').localeCompare(a.drinkingDate||'')||
      (b.createdAt||'').localeCompare(a.createdAt||'')||
      a.reviewId.localeCompare(b.reviewId);
  });
}
export function drilldownIndexRows(records:RecordEntry[],index:IndexDimension){
  if(index==='axes')return [
    {label:'甘口・辛口',value:'sweetDry',count:records.filter(r=>matchesDrilldown(r,{kind:'axis',value:'sweetDry',label:''})).length},
    {label:'淡麗・濃醇',value:'lightRich',count:records.filter(r=>matchesDrilldown(r,{kind:'axis',value:'lightRich',label:''})).length},
    {label:'酸味',value:'acidity',count:records.filter(r=>matchesDrilldown(r,{kind:'axis',value:'acidity',label:''})).length},
    {label:'旨み',value:'umami',count:records.filter(r=>matchesDrilldown(r,{kind:'axis',value:'umami',label:''})).length}
  ].filter(x=>x.count>0);
  const kind:DashboardDimension=({
    prefectures:'prefecture',breweries:'brewery',brands:'brand',types:'type',
    aromas:'aroma',tastes:'taste',months:'month'
  } as const)[index];
  const counts=new Map<string,number>();
  for(const r of records)for(const v of new Set(values(r,kind).filter(Boolean)))counts.set(v,(counts.get(v)||0)+1);
  return [...counts].map(([label,count])=>({label,value:label,count}))
    .sort((a,b)=>index==='months'?b.label.localeCompare(a.label):
      b.count-a.count||a.label.localeCompare(b.label,'ja'));
}
export function detailOfInsight(id:string):Drilldown{
  const dims:{key:string;kind:DashboardDimension;prefix:string}[]=[
    {key:'aroma',kind:'aroma',prefix:'香り'},
    {key:'taste',kind:'taste',prefix:'味わい'},
    {key:'type',kind:'type',prefix:'種類'},
    {key:'heat',kind:'heat',prefix:'火入れ'},
    {key:'method',kind:'method',prefix:'醸造法'},
    {key:'style',kind:'style',prefix:'製法'},
    {key:'rice',kind:'rice',prefix:'米'},
    {key:'pref',kind:'prefecture',prefix:'産地'},
    {key:'brewery',kind:'brewery',prefix:'酒蔵'},
    {key:'brand',kind:'brand',prefix:'銘柄'}
  ];
  for(const part of ['positive-','negative-','often-','high-share-']){
    if(!id.startsWith(part))continue;
    for(const dim of dims)if(id.startsWith(part+dim.key+'-')){
      const value=id.slice((part+dim.key+'-').length);
      return {kind:dim.kind,value,label:dim.prefix+'：'+value};
    }
  }
  if(id.startsWith('axis-level-')||id.startsWith('axis-favorite-')){
    const key=id.slice(id.indexOf('axis-')+5).replace(/^level-|^favorite-/,'');
    return {kind:'axis',value:key,label:'味わいの印象'};
  }
  if(id==='photos')return {kind:'photo',label:'写真のある記録'};
  if(id==='brands')return {kind:'index',index:'brands',label:'銘柄別の内訳'};
  if(id==='regions'||id==='breadth-prefectures')return {kind:'index',index:'prefectures',label:'産地別の内訳'};
  if(id==='months-active'||id==='rating-change')return {kind:'index',index:'months',label:'月別の内訳'};
  if(id==='breadth-aromas')return {kind:'index',index:'aromas',label:'香りの内訳'};
  if(id==='breadth-tastes')return {kind:'index',index:'tastes',label:'味わいの内訳'};
  if(id==='breadth-types')return {kind:'index',index:'types',label:'種類別の内訳'};
  if(id==='overall')return {kind:'rated',label:'評価のある日本酒'};
  return {kind:'all',label:'記録した日本酒'};
}
export function indexChild(index:IndexDimension,value:string,label:string):Drilldown {
  const kind:DashboardDimension=({
    prefectures:'prefecture',breweries:'brewery',brands:'brand',types:'type',
    aromas:'aroma',tastes:'taste',months:'month',axes:'axis'
  } as const)[index];
  return {kind,value,label:index==='axes'?label:label};
}
