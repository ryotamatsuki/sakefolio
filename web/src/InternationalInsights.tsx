import {useMemo,useState} from 'react';
import {ArrowRight,BarChart3,Camera,ChevronRight,Star,Wine} from 'lucide-react';
import type {InternationalRecord} from './internationalLocal';
import type {BeverageKind} from './internationalCatalog';
import {KIND_CONFIG,KIND_NAME} from './internationalCatalog';
import {analyzeInternational,filterInternationalRecords,KIND_FACETS} from './internationalAnalytics';
import type {InternationalFacet} from './internationalAnalytics';

interface Props {records:InternationalRecord[];onRecordSelect:(id:string)=>void}
const title:Record<InternationalFacet,string>={
 brand:'銘柄',producer:'メーカー',region:'地域',aromaStyle:'白酒の香型',
 sugarStyle:'黄酒の糖度区分',huangjiuStyle:'黄酒の商品区分',
 beerStyle:'ビアスタイル',bitterness:'苦味',body:'ボディ',
 wineStyle:'ワイン区分',grapes:'ブドウ品種',aroma:'香り',taste:'味わい',rating:'評価'
};
export default function InternationalInsights({records,onRecordSelect}:Props){
 const [kind,setKind]=useState<BeverageKind>('baijiu');
 const [drill,setDrill]=useState<{facet:InternationalFacet;value:string}|null>(null);
 const [sort,setSort]=useState<'date'|'high'>('date');
 const report=useMemo(()=>analyzeInternational(records,kind),[records,kind]);
 const matching=useMemo(()=>drill?filterInternationalRecords(records.filter(r=>r.kind===kind),drill.facet,drill.value):[],[drill,records,kind]);
 const listing=useMemo(()=>[...matching].sort((a,b)=>sort==='high'?
   (Number(b.rating)||0)-(Number(a.rating)||0)||(b.createdAt.localeCompare(a.createdAt)):
   b.createdAt.localeCompare(a.createdAt)),[matching,sort]);
 const dimensions=[{facet:'brand' as const,label:'よく記録する銘柄'},
   {facet:'producer' as const,label:'メーカー別'},
   {facet:'region' as const,label:'中国の産地'},
   ...KIND_FACETS[kind].map(x=>({facet:x.facet,label:x.label}))];
 return <section className="international-insights">
   <div className="international-feature-head">
    <div><span className="taste-eyebrow">PERSONAL DRINKS ANALYTICS · BY TYPE</span>
      <h2>酒類別の嗜好分析</h2>
      <p>日本酒とは混ぜず、同じ酒類の実際に飲んだ記録の評価から集計します。未飲酒の商品情報は件数に含め、平均評価には含めません。</p>
    </div><BarChart3 size={34}/></div>
   <div className="international-collection-filter" role="group" aria-label="嗜好分析する酒類">
    {KIND_CONFIG.map(c=><button type="button" key={c.id} aria-pressed={kind===c.id}
      onClick={()=>{setKind(c.id);setDrill(null);}}>{c.name}</button>)}
   </div>
   {drill?<section className="international-drill">
     <button type="button" className="international-drill-back" onClick={()=>setDrill(null)}>← {KIND_NAME(kind)}の分析に戻る</button>
     <h3>{title[drill.facet]}「{drill.value}」の内訳</h3>
     <p>該当する日本酒以外の記録も含む、{KIND_NAME(kind)}の登録 {matching.length}件</p>
     <label>並び順 <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
       <option value="date">登録日の新しい順</option><option value="high">高評価順</option></select></label>
     <div className="international-drill-list">{listing.map(r=><button type="button" key={r.id} onClick={()=>onRecordSelect(r.id)}>
       <span><strong>{r.productName}</strong><small>{r.brandName} · {r.experience==='tasted'?'実飲': '商品情報のみ'} · {r.region}</small></span>
       <span>{r.rating?'★'+r.rating:'未評価'} <ChevronRight size={16}/></span></button>)}</div>
   </section>:<>
     <div className="international-insight-summary">
       <div><Wine size={16}/><span>登録商品</span><strong>{report.total}件</strong></div>
       <div><Star size={16}/><span>飲んだ記録</span><strong>{report.tasted}件</strong></div>
       <div><BarChart3 size={16}/><span>平均評価</span><strong>{report.mean===null?'—':report.mean.toFixed(2)} / 5</strong></div>
       <div><Camera size={16}/><span>写真</span><strong>{report.photoCount}枚</strong></div>
     </div>
     {!report.tasted?<div className="international-empty">
       <Star size={26}/><p>この酒類は飲酒記録がまだありません。商品情報だけの登録から味の好みを推測しません。</p>
     </div>:null}
     <div className="international-insight-grid">
       <section className="international-insight-panel">
         <h3>評価の分布</h3><p>評価あり {report.rated}件。各棒を選ぶと該当記録を表示します。</p>
         <div className="international-stars">{report.distribution.map((count,i)=><button type="button" key={i}
            disabled={!count} aria-label={'★'+(i+1)+'：'+count+'件'} onClick={()=>setDrill({facet:'rating',value:String(i+1)})}>
            <span>{count}</span><div><i style={{height:report.rated?(count/report.rated*100)+'%':'0%'}}/></div><small>★{i+1}</small></button>)}</div>
       </section>
       {dimensions.map(({facet,label})=>{
         const rows=(report.facets[facet]||[]).slice(0,12),max=Math.max(1,...rows.map(r=>r.count));
         return <section className="international-insight-panel" key={facet}>
           <h3>{label}</h3>
           {rows.length?rows.map(row=><button type="button" key={row.label} className="international-facet-row"
             onClick={()=>setDrill({facet,value:row.label})}>
             <span><strong>{row.label}</strong><small>{row.count}件 · {row.mean===null?'評価なし':row.mean.toFixed(2)+'点／'+row.ratedCount+'件'}</small></span>
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
         <strong>{it.text}</strong><span>{it.detail}</span><small>該当する日本酒を確認 →</small></button>)}</div>:
         <p>比較に十分な評価件数がありません。記録が増えると根拠付きで傾向を表示します。</p>}
     </section>
   </>}
 </section>;
}
