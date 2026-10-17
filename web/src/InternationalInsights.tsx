import {useMemo,useState,useEffect} from 'react';
import {ArrowRight,BarChart3,Camera,ChevronRight,Star,Wine} from 'lucide-react';
import type {InternationalRecord} from './internationalLocal';
import type {BeverageKind} from './internationalCatalog';
import {KIND_CONFIG,KIND_NAME} from './internationalCatalog';
import {analyzeInternational,filterInternationalRecords,KIND_FACETS} from './internationalAnalytics';
import type {InternationalFacet} from './internationalAnalytics';
import {sensoryAxisScore,sensoryAxesFor} from './internationalSensory';

interface Props {records:InternationalRecord[];onRecordSelect:(id:string)=>void}
const title:Record<InternationalFacet,string>={
 brand:'銘柄',producer:'メーカー',region:'地域',volume:'容量',abv:'アルコール度数',aromaStyle:'白酒の香型',
 sugarStyle:'黄酒の糖度区分',huangjiuStyle:'黄酒の商品区分',
 beerStyle:'ビアスタイル',bitterness:'苦味',body:'ボディ',
 wineStyle:'ワイン区分',grapes:'ブドウ品種',aroma:'香り',taste:'味わい',rating:'評価'
};
const facetLabel=(facet:InternationalFacet,value:string)=>
 facet==='volume'?value+'mL':facet==='abv'?value+'%':value;
export default function InternationalInsights({records,onRecordSelect}:Props){
 const [kind,setKind]=useState<BeverageKind>('baijiu');
 const [drill,setDrill]=useState<{facet:InternationalFacet|'axis';value:string}|null>(null);
 const [sort,setSort]=useState<'date'|'high'>('date');
 const [includeTests,setIncludeTests]=useState(false);
 const testCount=records.filter(r=>r.experience==='test').length;
 useEffect(()=>{if(testCount&&!records.some(r=>r.experience!=='test'))setIncludeTests(true);},[testCount,records]);
 const report=useMemo(()=>analyzeInternational(records,kind,includeTests),[records,kind,includeTests]);
 const matching=useMemo(()=>{
   if(!drill)return [];
   const candidates=records.filter(r=>r.kind===kind&&(includeTests||r.experience!=='test'));
   if(drill.facet==='axis')return candidates.filter(r=>
     (r.experience==='tasted'||(includeTests&&r.experience==='test'))&&
     sensoryAxisScore(r.attributes[drill.value])!==null);
   return filterInternationalRecords(candidates,drill.facet,drill.value,includeTests);
 },[drill,records,kind,includeTests]);
 const listing=useMemo(()=>[...matching].sort((a,b)=>sort==='high'?
   (Number(b.rating)||0)-(Number(a.rating)||0)||(b.createdAt.localeCompare(a.createdAt)):
   b.createdAt.localeCompare(a.createdAt)),[matching,sort]);
 const dimensions=[{facet:'brand' as const,label:'よく記録する銘柄'},
   {facet:'producer' as const,label:'メーカー別'},
   {facet:'region' as const,label:'中国の産地'},
   {facet:'volume' as const,label:'容量別（mL）'},
   {facet:'abv' as const,label:'度数別（%）'},
   ...KIND_FACETS[kind].map(x=>({facet:x.facet,label:x.label}))];
 return <section className="international-insights">
   <div className="international-feature-head">
    <div><span className="taste-eyebrow">PERSONAL DRINKS ANALYTICS · BY TYPE</span>
      <h2>酒類別の嗜好分析</h2>
      <p>日本酒とは混ぜず、同じ酒類の実際に飲んだ記録の評価から集計します。本人の飲酒記録とUXTESTを分けて集計します。テスト記録の仮評価は切替で確認できます。</p>
    </div><BarChart3 size={34}/></div>
   {!!testCount&&<label className="international-test-toggle"><input type="checkbox" checked={includeTests}
     onChange={e=>{setIncludeTests(e.target.checked);setDrill(null);}}/> UXTEST {testCount}件を分析に含める（仮評価は本人の好みではありません）</label>}
   <div className="international-collection-filter" role="group" aria-label="嗜好分析する酒類">
    {KIND_CONFIG.map(c=><button type="button" key={c.id} aria-pressed={kind===c.id}
      onClick={()=>{setKind(c.id);setDrill(null);}}>{c.name}</button>)}
   </div>
   {drill?<section className="international-drill">
     <button type="button" className="international-drill-back" onClick={()=>setDrill(null)}>← {KIND_NAME(kind)}の分析に戻る</button>
     <h3>{drill.facet==='axis'?
       (sensoryAxesFor(kind).find(a=>a.key===drill.value)?.label||'味わいの軸')+'の記録':
       title[drill.facet]+'「'+facetLabel(drill.facet,drill.value)+'」の内訳'}</h3>
     <p>日本酒とは別に記録した、{KIND_NAME(kind)}の登録 {matching.length}件</p>
     <label>並び順 <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
       <option value="date">登録日の新しい順</option><option value="high">高評価順</option></select></label>
     <div className="international-drill-list">{listing.map(r=><button type="button" key={r.id} onClick={()=>onRecordSelect(r.id)}>
       <span><strong>{r.productName}</strong><small>{r.brandName} · {r.experience==='tasted'?'実飲':r.experience==='test'?'UXTEST（未試飲）':'商品情報のみ'} · {r.region}</small></span>
       <span>{drill.facet==='axis'&&<small>{r.attributes[drill.value]} / 5</small>}
         {r.rating?'★'+r.rating:'未評価'} <ChevronRight size={16}/></span></button>)}</div>
   </section>:<>
     <div className="international-insight-summary">
       <div><Wine size={16}/><span>登録商品</span><strong>{report.total}件</strong></div>
       <div><Star size={16}/><span>{includeTests?'実飲＋UXTEST':'飲んだ記録'}</span><strong>{report.tasted}件</strong></div>
       <div><BarChart3 size={16}/><span>平均評価</span><strong>{report.mean===null?'—':report.mean.toFixed(2)} / 5</strong></div>
       <div><Camera size={16}/><span>写真</span><strong>{report.photoCount}枚</strong></div>
     </div>
     {!report.tasted?<div className="international-empty">
       <Star size={26}/><p>この酒類は飲酒記録がまだありません。商品情報だけの登録から味の好みを推測しません。</p>
     </div>:null}
     <div className="international-insight-grid">
       <section className="international-insight-panel international-specs-panel">
         <h3>容量・アルコール度数</h3>
         <p>入力値をmL／%で統一して集計。値が未登録の記録は平均値から除きます。同一商品の複数記録はそれぞれ1件として計算します。</p>
         <div className="international-spec-cards">
           <div><small>平均アルコール度数</small>
             <strong>{report.specs.abv.mean===null?'—':report.specs.abv.mean.toFixed(1)+'%'}</strong>
             <span>{report.specs.abv.count}件の入力値から計算</span></div>
           <div><small>最頻容量</small>
             <strong>{report.specs.volume.frequencies.length?
               report.specs.volume.frequencies[0].value+'mL':'—'}</strong>
             <span>{report.specs.volume.count}件の入力値から計算</span></div>
         </div>
       </section>
       <section className="international-insight-panel">
         <h3>評価の分布</h3><p>評価あり {report.rated}件。各棒を選ぶと該当記録を表示します。</p>
         <div className="international-stars">{report.distribution.map((count,i)=><button type="button" key={i}
            disabled={!count} aria-label={'★'+(i+1)+'：'+count+'件'} onClick={()=>setDrill({facet:'rating',value:String(i+1)})}>
            <span>{count}</span><div><i style={{height:report.rated?(count/report.rated*100)+'%':'0%'}}/></div><small>★{i+1}</small></button>)}</div>
       </section>
       {!!report.axes.length&&<section className="international-insight-panel international-axes-panel">
         <h3>味わいのバランス（5段階）</h3>
         <p>各軸は同じ酒類の実飲記録の平均値です。選択すると評価した銘柄の内訳を確認できます。
           {includeTests?'UXTESTの仮データも含まれます。':''}</p>
         {report.axes.map(axis=><button type="button" key={axis.key} className="international-axis-summary"
           disabled={!axis.count} onClick={()=>setDrill({facet:'axis',value:axis.key})}>
           <span><strong>{axis.label}</strong><small>{axis.low} ～ {axis.high}</small></span>
           <i><b style={{width:axis.mean!==null?(axis.mean/5*100)+'%':'0%'}}/></i>
           <span><strong>{axis.mean===null?'—':axis.mean.toFixed(2)}</strong><small>{axis.count}件</small></span>
           <ChevronRight size={15}/>
         </button>)}
       </section>}
       {dimensions.map(({facet,label})=>{
         const rows=(report.facets[facet]||[]).slice(0,12),max=Math.max(1,...rows.map(r=>r.count));
         return <section className="international-insight-panel" key={facet}>
           <h3>{label}</h3>
           {rows.length?rows.map(row=><button type="button" key={row.label} className="international-facet-row"
             onClick={()=>setDrill({facet,value:row.label})}>
             <span><strong>{facetLabel(facet,row.label)}</strong><small>{row.count}件 · {row.mean===null?'評価なし':row.mean.toFixed(2)+'点／'+row.ratedCount+'件'}</small></span>
             <i><b style={{width:row.count/max*100+'%'}}/></i><ArrowRight size={15}/></button>):
             <p>まだこの項目の入力がありません。</p>}
         </section>;
       })}
     </div>
     <section className="international-insight-explanations">
       <h3>記録から見える傾向</h3>
       <p>同じ酒類の該当群・その他群がそれぞれ評価3件以上ある場合だけ比較します。自由入力メモは単語を推定せず、読点などで分割した語の完全一致のみを集計します。</p>
       {report.insights.length?<div>{report.insights.map(it=><button type="button" key={it.id}
         onClick={()=>setDrill({facet:it.facet,value:it.value})}>
         <strong>{it.text}</strong><span>{it.detail}</span><small>該当する中国酒を確認 →</small></button>)}</div>:
         <p>比較に十分な評価件数がありません。記録が増えると根拠付きで傾向を表示します。</p>}
     </section>
   </>}
 </section>;
}
