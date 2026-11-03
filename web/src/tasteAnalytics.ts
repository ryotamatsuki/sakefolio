import type {RecordEntry} from './types';
import {AROMA_GROUPS,TASTE_GROUPS,SENSORY_AXES,selectedIds} from './sensory.ts';

export type InsightCategory='味わい'|'香り'|'スタイル'|'産地'|'飲み方の傾向'|'記録の軌跡';
export interface Insight {id:string;category:InsightCategory;headline:string;detail:string;evidence:string;strength:'傾向あり'|'観察';order:number}
export interface StatRow {label:string;count:number;ratedCount:number;mean:number|null;highCount:number}
export interface AxisStat {key:string;title:string;mean:number|null;count:number}
export interface MonthStat {month:string;count:number;ratedCount:number;mean:number|null}
export interface TasteAnalytics {
  total:number;rated:number;average:number|null;highCount:number;
  photoCount:number;brandCount:number;breweryCount:number;prefectureCount:number;
  ratingDistribution:number[];axes:AxisStat[];months:MonthStat[];
  prefectures:StatRow[];breweries:StatRow[];brands:StatRow[];
  styles:StatRow[];types:StatRow[];methods:StatRow[];heat:StatRow[];
  rice:StatRow[];aromas:StatRow[];tastes:StatRow[];
  insights:Insight[];
}
const skipped=new Set(['','不明','不明・記載なし','特定名称の表示なし・不明','その他（自由記入）','その他']);
const normal=(value?:string):string=>{const s=(value||'').trim();return skipped.has(s)?'':s;};
const avg=(xs:number[]):number|null=>xs.length?xs.reduce((sum,n)=>sum+n,0)/xs.length:null;
const f=(x:number|null)=>x===null?'—':x.toFixed(2);
export const isDemoRecord=(r:RecordEntry)=>r.reviewId.startsWith('sakefolio-demo-') ||
  r.productName?.startsWith('DEBUG-') || (r.notes||'').includes('実際の飲酒記録ではありません') ||
  (r.notes||'').startsWith('React版の保存テスト') || (r.notes||'').startsWith('React版JPEG保存テスト');
export const validRating=(r:RecordEntry):number|null=>/^[1-5]$/.test((r.rating||'').trim())?Number(r.rating.trim()):null;
const axisValue=(r:RecordEntry,key:string):number|null=>{
  const v=String(r[key as keyof RecordEntry]||'').trim();
  return /^[1-5]$/.test(v)?Number(v):null;
};
const grades=(rows:RecordEntry[]):number[]=>rows.map(validRating).filter((n):n is number=>n!==null);
const labels=(rows:RecordEntry[],get:(r:RecordEntry)=>string[]):StatRow[]=>{
  const entries=new Map<string,RecordEntry[]>();
  for(const r of rows)for(const label of new Set(get(r).map(normal).filter(Boolean)))
    entries.set(label,[...(entries.get(label)||[]),r]);
  return [...entries].map(([label,subset])=>{
    const ratings=grades(subset);
    return {label,count:subset.length,ratedCount:ratings.length,mean:avg(ratings),
      highCount:ratings.filter(n=>n>=4).length};
  }).sort((a,b)=>b.count-a.count||(b.mean||0)-(a.mean||0)||a.label.localeCompare(b.label,'ja'));
};
const labelField=(rows:RecordEntry[],field:keyof RecordEntry)=>labels(rows,r=>[r[field] as string]);
const terms=(groups:typeof AROMA_GROUPS)=>new Map(groups.flatMap(g=>g.terms.map(term=>[term.id,term.label])));
const aromaNames=terms(AROMA_GROUPS),tasteNames=terms(TASTE_GROUPS);
const selected=(r:RecordEntry,field:'aromaTagIds'|'tasteTagIds',dictionary:Map<string,string>)=>
  selectedIds(r[field]).map(id=>dictionary.get(id)||'').filter(Boolean);
const add=(list:Insight[],it:Insight)=>{if(!list.some(x=>x.id===it.id))list.push(it);};

export function analyzeTaste(records:RecordEntry[]):TasteAnalytics {
  const rated=grades(records),average=avg(rated),insights:Insight[]=[];
  const mean=average;
  const byMonths=new Map<string,RecordEntry[]>();
  for(const r of records){
    const month=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(r.drinkingDate||'')?
      r.drinkingDate.slice(0,7):'';
    if(month)byMonths.set(month,[...(byMonths.get(month)||[]),r]);
  }
  const months=[...byMonths].sort(([a],[b])=>a.localeCompare(b)).map(([month,rows])=>({
    month,count:rows.length,ratedCount:grades(rows).length,mean:avg(grades(rows))
  }));
  const axes=SENSORY_AXES.map(a=>({key:a.key,title:a.title,values:records.map(r=>axisValue(r,a.key)).filter((n):n is number=>n!==null)}))
    .map(a=>({key:a.key,title:a.title,count:a.values.length,mean:avg(a.values)}));
  const groups={
    prefectures:labelField(records,'prefecture'),
    breweries:labelField(records,'breweryName'),
    brands:labelField(records,'brandName'),
    styles:labels(records,r=>(r.processingStyles||'').split(',').map(x=>x.trim())),
    types:labelField(records,'sakeType'),
    methods:labelField(records,'brewingMethod'),
    heat:labelField(records,'heatTreatment'),
    rice:labelField(records,'riceVariety'),
    aromas:labels(records,r=>selected(r,'aromaTagIds',aromaNames)),
    tastes:labels(records,r=>selected(r,'tasteTagIds',tasteNames))
  };
  const total=records.length,highCount=rated.filter(n=>n>=4).length;
  if(total===0)return {total:0,rated:0,average:null,highCount:0,photoCount:0,
    brandCount:0,breweryCount:0,prefectureCount:0,ratingDistribution:[0,0,0,0,0],
    axes,months,...groups,insights};
  const p=(count:number,den:number)=>Math.round(count/Math.max(1,den)*100);
  if(rated.length>=3){
    add(insights,{id:'overall',category:'飲み方の傾向',headline:mean!>=4.1?'高評価の一杯が多いですね':mean!<=2.7?'評価がかなり厳しめですね':'評価は幅広く付けていますね',
      detail:'記録した日本酒の平均評価は'+f(mean)+'点です。星4以上が'+highCount+'件あります。',
      evidence:'評価あり'+rated.length+'件／5点満点',strength:'観察',order:60});
  }
  const dimensions=[
    {id:'aroma',label:'香り',category:'香り' as const,rows:groups.aromas,extract:(r:RecordEntry)=>selected(r,'aromaTagIds',aromaNames)},
    {id:'taste',label:'味わい',category:'味わい' as const,rows:groups.tastes,extract:(r:RecordEntry)=>selected(r,'tasteTagIds',tasteNames)},
    {id:'type',label:'種類',category:'スタイル' as const,rows:groups.types,extract:(r:RecordEntry)=>[normal(r.sakeType)]},
    {id:'heat',label:'火入れ区分',category:'スタイル' as const,rows:groups.heat,extract:(r:RecordEntry)=>[normal(r.heatTreatment)]},
    {id:'method',label:'醸造法',category:'スタイル' as const,rows:groups.methods,extract:(r:RecordEntry)=>[normal(r.brewingMethod)]},
    {id:'style',label:'製法の特徴',category:'スタイル' as const,rows:groups.styles,extract:(r:RecordEntry)=>(r.processingStyles||'').split(',').map(normal)},
    {id:'rice',label:'原料米',category:'スタイル' as const,rows:groups.rice,extract:(r:RecordEntry)=>[normal(r.riceVariety)]},
    {id:'pref',label:'産地',category:'産地' as const,rows:groups.prefectures,extract:(r:RecordEntry)=>[normal(r.prefecture)]},
    {id:'brewery',label:'酒蔵',category:'産地' as const,rows:groups.breweries,extract:(r:RecordEntry)=>[normal(r.breweryName)]},
    {id:'brand',label:'銘柄',category:'産地' as const,rows:groups.brands,extract:(r:RecordEntry)=>[normal(r.brandName)]}
  ];
  for(const d of dimensions){
    const known=records.filter(r=>d.extract(r).some(Boolean)).length;
    for(const row of d.rows){
      if(row.count>=2&&row.count/known>=.28&&known>=4)
        add(insights,{id:'often-'+d.id+'-'+row.label,category:d.category,
          headline:d.label+'では「'+row.label+'」がよく登場しますね',
          detail:'記録の'+p(row.count,known)+'%に現れています。飲む機会の多い特徴です（好みと断定はできません）。',
          evidence:row.count+'件／該当項目記入'+known+'件',strength:'観察',order:35+row.count});
      if(row.ratedCount>=3&&rated.length>=7&&row.mean!==null){
        const others=grades(records.filter(r=>!d.extract(r).includes(row.label)));
        if(others.length>=3){
          const baseline=avg(others)!;
          const delta=row.mean-baseline;
          if(delta>=.35)
            add(insights,{id:'positive-'+d.id+'-'+row.label,category:d.category,
              headline:'あなたは「'+row.label+'」の評価が高いですね',
              detail:d.label+'「'+row.label+'」の平均は'+f(row.mean)+'点。ほかの記録より'+delta.toFixed(2)+'点高くなっています。',
              evidence:row.ratedCount+'件 対 その他'+others.length+'件',strength:'傾向あり',order:95+delta*12});
          if(delta<=-.35)
            add(insights,{id:'negative-'+d.id+'-'+row.label,category:d.category,
              headline:'「'+row.label+'」は評価が控えめなようです',
              detail:d.label+'「'+row.label+'」の平均は'+f(row.mean)+'点。ほかの記録より'+Math.abs(delta).toFixed(2)+'点低めです。',
              evidence:row.ratedCount+'件 対 その他'+others.length+'件',strength:'傾向あり',order:80+Math.abs(delta)*8});
        }
      }
      if(row.ratedCount>=3&&row.highCount/row.ratedCount>=.75){
        add(insights,{id:'high-share-'+d.id+'-'+row.label,category:d.category,
          headline:'「'+row.label+'」は高評価が多いですね',
          detail:'評価を付けた'+row.ratedCount+'件のうち星4以上が'+row.highCount+'件あります。',
          evidence:'星4以上 '+p(row.highCount,row.ratedCount)+'%／'+row.ratedCount+'件',strength:'観察',order:45+row.ratedCount});
      }
    }
  }
  // Explicit taste ratings vs perception axes: frequency alone never establishes a favorite.
  for(const axis of SENSORY_AXES){
    const observed=records.map(r=>({r,v:axisValue(r,axis.key)})).filter(x=>x.v!==null);
    if(observed.length>=4){
      const meanAxis=avg(observed.map(x=>x.v!))!;
      if(meanAxis<=2||meanAxis>=4)add(insights,{id:'axis-level-'+axis.key,category:'味わい',
        headline:axis.title+'の印象が'+(meanAxis<=2?'前半':'後半')+'寄りですね',
        detail:'記録した味の印象の平均は5段階中'+f(meanAxis)+'です。これは飲んだお酒の特徴であり、好みの強さではありません。',
        evidence:'印象の記入'+observed.length+'件',strength:'観察',order:44});
      const low=grades(observed.filter(x=>x.v!<=2).map(x=>x.r));
      const high=grades(observed.filter(x=>x.v!>=4).map(x=>x.r));
      if(low.length>=3&&high.length>=3){
        const delta=avg(high)!-avg(low)!;
        if(Math.abs(delta)>=.4)add(insights,{id:'axis-favorite-'+axis.key,category:'味わい',
          headline:axis.title+'は'+(delta>0?'後半':'前半')+'寄りを高く評価していますね',
          detail:'5段階の'+(delta>0?'4〜5':'1〜2')+'を付けたお酒の評価が、反対側より'+Math.abs(delta).toFixed(2)+'点高くなっています。',
          evidence:'両群'+low.length+'件・'+high.length+'件の比較',strength:'傾向あり',order:94+Math.abs(delta)*10});
      }
    }
  }
  const photoCount=records.filter(r=>!!r.photoId).length;
  if(total>=3&&photoCount>=2){
    add(insights,{id:'photos',category:'記録の軌跡',
      headline:'ラベル写真を丁寧に残していますね',
      detail:'記録のうち'+p(photoCount,total)+'%に写真が付いています。記憶を写真で振り返れるコレクションです。',
      evidence:photoCount+'枚／'+total+'件',strength:'観察',order:41});
  }
  const unique=(f:keyof RecordEntry)=>new Set(records.map(r=>normal(r[f] as string)).filter(Boolean)).size;
  const prefectureCount=unique('prefecture'),breweryCount=unique('breweryName'),brandCount=unique('brandName');
  if(prefectureCount>=4)add(insights,{id:'regions',category:'産地',headline:'さまざまな産地を探索していますね',
    detail:prefectureCount+'都道府県の日本酒を記録しています。産地を跨いで飲み比べています。',
    evidence:prefectureCount+'都道府県／'+total+'件',strength:'観察',order:48});
  if(brandCount>=5)add(insights,{id:'brands',category:'記録の軌跡',headline:'銘柄の探索が進んでいますね',
    detail:brandCount+'銘柄を記録し、酒蔵では'+breweryCount+'蔵に出会っています。',
    evidence:brandCount+'銘柄・'+breweryCount+'蔵',strength:'観察',order:37});
  if(months.length>=3){
    add(insights,{id:'months-active',category:'記録の軌跡',headline:'記録が'+months.length+'か月にわたっていますね',
      detail:'最初の記録は'+months[0].month+'、直近は'+months[months.length-1].month+'です。',
      evidence:'記録のある月 '+months.length+'か月',strength:'観察',order:34});
    const first=months.slice(0,Math.floor(months.length/2)).flatMap(m=>
      records.filter(r=>r.drinkingDate.startsWith(m.month)));
    const second=records.filter(r=>!first.includes(r));
    const firstRated=grades(first),lastRated=grades(second);
    if(firstRated.length>=3&&lastRated.length>=3){
      const diff=avg(lastRated)!-avg(firstRated)!;
      if(Math.abs(diff)>=.4)add(insights,{id:'rating-change',category:'記録の軌跡',
        headline:'最近の評価は'+(diff>0?'高く':'低く')+'なっていますね',
        detail:'期間の前半と後半で平均評価に'+Math.abs(diff).toFixed(2)+'点の差があります。',
        evidence:'前半'+firstRated.length+'件・後半'+lastRated.length+'件',strength:'傾向あり',order:61});
    }
  }
  for(const [id,rows,cat,title] of [
    ['aromas',groups.aromas,'香り','香り'],['tastes',groups.tastes,'味わい','味わい'],
    ['types',groups.types,'スタイル','種類'],['prefectures',groups.prefectures,'産地','産地']
  ] as const){
    if(rows.length>=4)add(insights,{id:'breadth-'+id,category:cat as InsightCategory,
      headline:title+'のバリエーションが豊富ですね',
      detail:rows.length+'種類の'+title+'を記録しています。特定の特徴に限らず、幅広い日本酒に触れています。',
      evidence:rows.length+'種類／'+total+'件',strength:'観察',order:30});
  }
  const distributions=[1,2,3,4,5].map(n=>rated.filter(x=>x===n).length);
  return {total,rated:rated.length,average,highCount,photoCount,brandCount,breweryCount,prefectureCount,
    ratingDistribution:distributions,axes,months,...groups,
    insights:insights.sort((a,b)=>b.order-a.order||a.id.localeCompare(b.id))};
}
