import {useEffect,useMemo,useState} from 'react';
import type {RecordEntry} from './types';
import {SENSORY_AXES} from './sensory';
import {analyzeTaste,isDemoRecord} from './tasteAnalytics';
import type {AxisStat,InsightCategory,StatRow} from './tasteAnalytics';
import {ArrowRight,BarChart3,ChevronDown,Compass,Star,Wine,Camera,ShieldCheck} from 'lucide-react';

interface Props {records:RecordEntry[];loggedIn:boolean;onNewRecord:()=>void;onMap:()=>void}
const categories:['すべて',InsightCategory,InsightCategory,InsightCategory,InsightCategory,InsightCategory,InsightCategory]=
 ['すべて','味わい','香り','スタイル','産地','飲み方の傾向','記録の軌跡'];
const formatMean=(n:number|null)=>n===null?'—':n.toFixed(2);
function Facet({title,rows,kind}: {title:string;rows:StatRow[];kind:'count'|'rating'}) {
  const qualified=kind==='rating'?rows.filter(x=>x.ratedCount>=2&&x.mean!==null):rows;
  const shown=qualified.slice(0,7),max=Math.max(1,...shown.map(r=>kind==='count'?r.count:r.mean||0));
  return <section className="taste-panel">
    <h3>{title}</h3>
    {!shown.length?<p className="taste-muted">集計できる記録がまだありません。</p>:
      <div className="taste-bars">{shown.map(r=><div className="taste-bar-row" key={r.label}>
        <div className="taste-bar-heading"><strong>{r.label}</strong>
          <span>{kind==='count'?r.count+'件':formatMean(r.mean)+'点 · '+r.ratedCount+'件'}</span></div>
        <div className="taste-bar-bg"><div className="taste-bar-fill" style={{width:(kind==='count'?100*r.count/max:100*(r.mean||0)/5)+'%'}}/></div>
      </div>)}</div>}
    {kind==='rating'&&<p className="taste-small">評価2件以上の分類のみを表示。サンプル数が少ない場合、順位は不安定です。</p>}
  </section>;
}
function Radar({axes}: {axes:AxisStat[]}) {
  const center=105,radius=83,complete=axes.every(x=>x.count>0);
  const point=(i:number,t:number)=>{
    const phi=(-Math.PI/2+i*Math.PI/2);return [center+Math.cos(phi)*radius*t,center+Math.sin(phi)*radius*t];
  };
  const shape=(level:number)=>axes.map((_,i)=>point(i,level).join(',')).join(' ');
  const actual=axes.map((x,i)=>point(i,(x.mean||3)/5).join(',')).join(' ');
  return <section className="taste-panel taste-radar-section">
    <h3>味わいプロファイル</h3>
    <div className="taste-radar-body">
      <svg viewBox="0 0 210 210" className="taste-radar" role="img" aria-label="甘辛、淡麗濃醇、酸味、旨みの印象の平均を5段階で表示">
        {[.2,.4,.6,.8,1].map(v=><polygon key={v} points={shape(v)} stroke="#dfe6dc" strokeWidth="1" fill="none"/>)}
        {axes.map((_,i)=>{const p=point(i,1);return <line key={i} x1={center} y1={center} x2={p[0]} y2={p[1]} stroke="#dfe6dc"/>;})}
        {complete&&<polygon points={actual} fill="#6b957873" stroke="#255d3b" strokeWidth="2.5"/>}
        {complete&&axes.map((x,i)=>{const [cx,cy]=point(i,(x.mean||3)/5);return <circle key={x.key} cx={cx} cy={cy} r="3.8" fill="#255d3b"/>;})}
      </svg>
      <div className="taste-axis-notes">{axes.map((axis,i)=><div key={axis.key}>
        <span>{axis.title}</span><strong>{axis.mean===null?'未記録':axis.mean.toFixed(1)+'/5'}</strong>
        <small>{SENSORY_AXES[i].options[0]} ↔ {SENSORY_AXES[i].options[4]} · {axis.count}件</small></div>)}</div>
    </div>
    <p className="taste-small">飲んだ日本酒の印象であり、好みの強さを表すグラフではありません。未記録の軸は推測しません。</p>
  </section>;
}
export default function TasteDashboard({records,loggedIn,onNewRecord,onMap}:Props){
  const demoCount=useMemo(()=>records.filter(isDemoRecord).length,[records]);
  const realCount=records.length-demoCount;
  const [includeDemo,setIncludeDemo]=useState(false);
  const [category,setCategory]=useState<(typeof categories)[number]>('すべて');
  const [showAll,setShowAll]=useState(false);
  useEffect(()=>{if(demoCount>0&&realCount===0)setIncludeDemo(true);else if(realCount>0)setIncludeDemo(false);},
    [demoCount,realCount]);
  const chosen=useMemo(()=>includeDemo?records:records.filter(r=>!isDemoRecord(r)),[records,includeDemo]);
  const report=useMemo(()=>analyzeTaste(chosen),[chosen]);
  const insights=report.insights.filter(x=>category==='すべて'||x.category===category);
  const shown=showAll?insights:insights.slice(0,8);
  const maxMonth=Math.max(1,...report.months.map(x=>x.count));
  return <section className="page-section taste-dashboard">
    <div className="interior-head"><span className="taste-eyebrow">MY SAKE PROFILE · PERSONAL ANALYTICS</span>
      <h1>私の日本酒分析<span className="green-period">.</span></h1>
      <p>あなたの一杯一杯から、好みの傾向と新しい発見を。記録した事実だけから、ルールベースで自動集計します。</p>
    </div>
    {!!demoCount&&<label className="taste-demo-toggle">
      <input type="checkbox" checked={includeDemo} onChange={e=>setIncludeDemo(e.target.checked)}/>
      <span>デモ記録 {demoCount}件を含める</span>
      <small>評価や感想はテスト用の架空データです。実際の嗜好として扱わないでください。</small>
    </label>}
    {!report.total?<div className="taste-empty">
      <BarChart3 size={37}/>
      <h2>{loggedIn?'分析できる記録がありません':'Googleに接続すると、あなたの記録を分析できます'}</h2>
      <p>香り・味わい・評価を記録すると、グラフと根拠付きの分析コメントが自動で増えます。</p>
      <button type="button" className="button button-dark" onClick={onNewRecord}>日本酒を記録する <ArrowRight size={16}/></button>
    </div>:<>
      <div className="taste-hero">
        <div><span className="taste-eyebrow">YOUR TASTING SIGNATURE</span>
          <h2>あなたの一杯が、<br/>好みの輪郭になる。</h2>
          <p>記録{report.total}件を集計。平均評価と特徴を可視化し、十分な比較件数があるときだけ「評価が高い」などの推定を表示します。</p></div>
        <div className="taste-hero-score"><span>AVERAGE RATING</span>
          <strong>{formatMean(report.average)}</strong><small> / 5.00</small>
          <p>評価あり {report.rated}件</p>
        </div>
      </div>
      <div className="taste-kpis">
        {[{label:'記録した一杯',n:report.total,unit:'件',icon:Wine},
          {label:'出会った銘柄',n:report.brandCount,unit:'銘柄',icon:Star},
          {label:'出会った産地',n:report.prefectureCount,unit:'都道府県',icon:Compass},
          {label:'ラベル写真',n:report.photoCount,unit:'枚',icon:Camera}].map(item=>
        <div className="taste-kpi" key={item.label}><item.icon size={19}/><strong>{item.n}<small>{item.unit}</small></strong><span>{item.label}</span></div>)}
      </div>
      <div className="taste-grid">
        <section className="taste-panel">
          <h3>評価の分布</h3><p className="taste-muted">評価あり {report.rated}件 · 星1〜5</p>
          <div className="taste-rating-chart">{report.ratingDistribution.map((count,i)=><div className="taste-rating-column" key={i}>
            <span>{count}</span><div className="taste-rating-track"><div style={{height:report.rated?100*count/report.rated+'%':'0%'}}/></div>
            <small>★{i+1}</small></div>)}</div>
          <p className="taste-small">未評価の記録は平均値・評価分布から除外します。</p>
        </section>
        <Radar axes={report.axes}/>
        <Facet title="よく飲んだ日本酒の種類" rows={report.types} kind="count"/>
        <Facet title="産地別の記録" rows={report.prefectures} kind="count"/>
        <Facet title="よく選んだ香り" rows={report.aromas} kind="count"/>
        <Facet title="味わい・口当たり" rows={report.tastes} kind="count"/>
        <Facet title="高評価の酒蔵" rows={report.breweries} kind="rating"/>
        <Facet title="高評価の日本酒の種類" rows={report.types} kind="rating"/>
      </div>
      <section className="taste-panel taste-months">
        <h3>日本酒との出会いの軌跡</h3>
        {report.months.length?<div className="taste-month-track">{report.months.map(m=><div className="taste-month" key={m.month}>
          <strong>{m.count}</strong><div className="taste-month-bar" style={{height:Math.max(6,100*m.count/maxMonth)+'%'}}/><span>{m.month.slice(2)}</span>
        </div>)}</div>:<p className="taste-muted">日付のある記録がまだありません。</p>}
        <p className="taste-small">月ごとの飲酒記録件数です。飲んだ量や健康状態を示すものではありません。</p>
      </section>
      <section className="taste-insights">
        <div className="taste-insights-head"><div>
          <span className="taste-eyebrow">PERSONALIZED · RULE-BASED INSIGHTS</span>
          <h2>あなたの日本酒、こんな傾向があります。</h2>
          <p>AIは使っていません。比較条件を満たす記録から、説明可能なルールだけでコメントを生成します。</p>
        </div><strong>{report.insights.length}<small>件の気づき</small></strong></div>
        <div className="taste-insight-filters" role="group" aria-label="分析コメントのカテゴリ">
          {categories.map(c=><button key={c} type="button" aria-pressed={category===c} onClick={()=>{setCategory(c);setShowAll(false);}}>{c}</button>)}
        </div>
        {insights.length?<div className="taste-insight-list">{shown.map(it=><article className="taste-insight" key={it.id}>
          <div><span className="taste-insight-category">{it.category}</span>
            <span className="taste-insight-strength">{it.strength}</span></div>
          <h3>{it.headline}</h3><p>{it.detail}</p><small>{it.evidence}</small>
        </article>)}</div>:<p className="taste-muted">このカテゴリでは、十分な件数のある分析コメントがまだありません。</p>}
        {insights.length>8&&<button type="button" className="taste-more" onClick={()=>setShowAll(v=>!v)}>
          {showAll?'表示を減らす':'すべての気づきを表示（'+insights.length+'件）'} <ChevronDown size={15}/>
        </button>}
      </section>
      <div className="taste-dashboard-actions">
        <button type="button" className="button button-dark" onClick={onNewRecord}>次の一杯を記録する <ArrowRight size={17}/></button>
        <button type="button" className="button button-outline" onClick={onMap}>酒蔵の地図を開く <Compass size={17}/></button>
      </div>
      <p className="taste-footer-note"><ShieldCheck size={14}/> 記録の分析はブラウザ内で実施し、外部AIサービスに送信しません。個人の記録は接続したGoogle Driveに保存されています。サンプルが少ないと傾向は変動しやすくなります。</p>
    </>}
  </section>;
}
