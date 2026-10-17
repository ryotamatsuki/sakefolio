import {useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import type {RecordEntry} from './types';
import {SENSORY_AXES} from './sensory';
import {analyzeTaste,isDemoRecord} from './tasteAnalytics';
import type {Drilldown,DashboardDimension,IndexDimension} from './dashboardDrilldown';
import {detailOfInsight} from './dashboardDrilldown';
import DashboardDrilldown from './DashboardDrilldown';
import type {AxisStat,InsightCategory,StatRow} from './tasteAnalytics';
import {ArrowRight,BarChart3,ChevronDown,Compass,Star,Wine,Camera,ShieldCheck} from 'lucide-react';

interface Props {records:RecordEntry[];loggedIn:boolean;onNewRecord:()=>void;onMap:()=>void;renderPhoto:(r:RecordEntry)=>ReactNode}
const categories:['すべて',InsightCategory,InsightCategory,InsightCategory,InsightCategory,InsightCategory,InsightCategory]=
 ['すべて','味わい','香り','スタイル','産地','飲み方の傾向','記録の軌跡'];
const formatMean=(n:number|null)=>n===null?'—':n.toFixed(2);
function Facet({title,rows,kind,dimension,index,onSelect}: {
  title:string;rows:StatRow[];kind:'count'|'rating';
  dimension:DashboardDimension;index:IndexDimension;
  onSelect:(d:Drilldown)=>void
}) {
  const qualified=kind==='rating'?
    [...rows].filter(x=>x.ratedCount>=1&&x.mean!==null)
      .sort((a,b)=>(b.mean||0)-(a.mean||0)||b.ratedCount-a.ratedCount):rows;
  const shown=qualified.slice(0,7),max=Math.max(1,...shown.map(r=>kind==='count'?r.count:r.mean||0));
  return <section className="taste-panel">
    <div className="taste-panel-heading"><h3>{title}</h3>
      <button type="button" onClick={()=>onSelect({kind:'index',index,label:title+'の内訳'})}>すべて見る <ChevronDown size={14}/></button></div>
    {!shown.length?<p className="taste-muted">集計できる記録がまだありません。</p>:
      <div className="taste-bars">{shown.map(r=><button type="button" className="taste-bar-row taste-bar-link" key={r.label}
        onClick={()=>onSelect({kind:dimension,value:r.label,label:title+'：'+r.label})}
        aria-label={r.label+'の日本酒'+r.count+'件の内訳を見る'}>
        <div className="taste-bar-heading"><strong>{r.label}</strong>
          <span>{kind==='count'?r.count+'件':formatMean(r.mean)+'点 · '+r.ratedCount+'件'} <ChevronDown size={13}/></span></div>
        <div className="taste-bar-bg"><div className="taste-bar-fill" style={{width:(kind==='count'?100*r.count/max:100*(r.mean||0)/5)+'%'}}/></div>
      </button>)}</div>}
    {kind==='rating'&&<p className="taste-small">平均評価の高い順に表示。評価1件の分類は参考値です。タップすると個別のお酒を確認できます。</p>}
  </section>;
}
function Radar({axes,onSelect}: {axes:AxisStat[];onSelect:(d:Drilldown)=>void}) {
  const center=105,radius=83,complete=axes.every(x=>x.count>0);
  const point=(i:number,t:number)=>{
    const phi=(-Math.PI/2+i*Math.PI/2);return [center+Math.cos(phi)*radius*t,center+Math.sin(phi)*radius*t];
  };
  const shape=(level:number)=>axes.map((_,i)=>point(i,level).join(',')).join(' ');
  const actual=axes.map((x,i)=>point(i,(x.mean||3)/5).join(',')).join(' ');
  return <section className="taste-panel taste-radar-section">
    <h3>味わいプロファイル</h3>
    <div className="taste-radar-body">
      <button type="button" className="taste-radar-button" disabled={!axes.some(x=>x.count>0)}
        aria-label="味わいプロファイルの4軸の内訳を見る"
        onClick={()=>onSelect({kind:'index',index:'axes',label:'味わいプロファイルの内訳'})}>
      <svg viewBox="0 0 210 210" className="taste-radar" role="img" aria-label="甘辛、淡麗濃醇、酸味、旨みの印象の平均を5段階で表示">
        {[.2,.4,.6,.8,1].map(v=><polygon key={v} points={shape(v)} stroke="#dfe6dc" strokeWidth="1" fill="none"/>)}
        {axes.map((_,i)=>{const p=point(i,1);return <line key={i} x1={center} y1={center} x2={p[0]} y2={p[1]} stroke="#dfe6dc"/>;})}
        {complete&&<polygon points={actual} fill="#6b957873" stroke="#255d3b" strokeWidth="2.5"/>}
        {complete&&axes.map((x,i)=>{const [cx,cy]=point(i,(x.mean||3)/5);return <circle key={x.key} cx={cx} cy={cy} r="3.8" fill="#255d3b"/>;})}
      </svg><span className="taste-tap-hint">タップして4軸の内訳を見る</span></button>
      <div className="taste-axis-notes">{axes.map((axis,i)=><button type="button" key={axis.key} disabled={!axis.count}
        onClick={()=>onSelect({kind:'axis',value:axis.key,label:'味わい：'+axis.title})}>
        <span>{axis.title}</span><strong>{axis.mean===null?'未記録':axis.mean.toFixed(1)+'/5'}</strong>
        <small>{SENSORY_AXES[i].options[0]} ↔ {SENSORY_AXES[i].options[4]} · {axis.count}件</small></button>)}</div>
    </div>
    <p className="taste-small">飲んだ日本酒の印象であり、好みの強さを表すグラフではありません。未記録の軸は推測しません。</p>
  </section>;
}
export default function TasteDashboard({records,loggedIn,onNewRecord,onMap,renderPhoto}:Props){
  const demoCount=useMemo(()=>records.filter(isDemoRecord).length,[records]);
  const realCount=records.length-demoCount;
  const [includeDemo,setIncludeDemo]=useState(false);
  const [category,setCategory]=useState<(typeof categories)[number]>('すべて');
  const [showAll,setShowAll]=useState(false);
  const [path,setPath]=useState<Drilldown[]>([]);
  const navigate=(filter:Drilldown)=>{setPath(p=>[...p,filter]);window.scrollTo({top:0,behavior:'smooth'});};
  const reset=()=>{setPath([]);window.scrollTo({top:0,behavior:'smooth'});};
  const back=()=>{setPath(p=>p.slice(0,-1));window.scrollTo({top:0,behavior:'smooth'});};
  const jump=(count:number)=>{setPath(p=>p.slice(0,count));window.scrollTo({top:0,behavior:'smooth'});};
  useEffect(()=>{setPath([]);},[records]);
  useEffect(()=>{if(demoCount>0&&realCount===0)setIncludeDemo(true);else if(realCount>0)setIncludeDemo(false);},
    [demoCount,realCount]);
  const chosen=useMemo(()=>includeDemo?records:records.filter(r=>!isDemoRecord(r)),[records,includeDemo]);
  const report=useMemo(()=>analyzeTaste(chosen),[chosen]);
  const insights=report.insights.filter(x=>category==='すべて'||x.category===category);
  const shown=showAll?insights:insights.slice(0,8);
  const maxMonth=Math.max(1,...report.months.map(x=>x.count));
  if(path.length)return <DashboardDrilldown records={chosen} path={path}
    onNavigate={navigate} onBack={back} onReset={reset} onJump={jump} renderPhoto={renderPhoto}/>;
  return <section className="page-section taste-dashboard">
    <div className="interior-head"><span className="taste-eyebrow">MY SAKE PROFILE · PERSONAL ANALYTICS</span>
      <h1>私の日本酒分析<span className="green-period">.</span></h1>
      <p>あなたの一杯一杯から、好みの傾向と新しい発見を。記録した事実だけから、ルールベースで自動集計します。</p>
    </div>
    {!!demoCount&&<label className="taste-demo-toggle">
      <input type="checkbox" checked={includeDemo} onChange={e=>{setIncludeDemo(e.target.checked);setPath([]);}}/>
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
        <button type="button" className="taste-hero-score" onClick={()=>navigate({kind:'rated',label:'評価のある日本酒'})}>
          <span>AVERAGE RATING</span>
          <strong>{formatMean(report.average)}</strong><small> / 5.00</small>
          <p>評価あり {report.rated}件　<ArrowRight size={14}/></p>
        </button>
      </div>
      <div className="taste-kpis">
        {[{label:'記録した一杯',n:report.total,unit:'件',icon:Wine,drill:{kind:'all',label:'すべての飲酒記録'}},
          {label:'出会った銘柄',n:report.brandCount,unit:'銘柄',icon:Star,drill:{kind:'index',index:'brands',label:'記録した銘柄'}},
          {label:'出会った産地',n:report.prefectureCount,unit:'都道府県',icon:Compass,drill:{kind:'index',index:'prefectures',label:'産地の内訳'}},
          {label:'ラベル写真',n:report.photoCount,unit:'枚',icon:Camera,drill:{kind:'photo',label:'写真のある日本酒'}}].map(item=>
        <button type="button" className="taste-kpi" key={item.label} onClick={()=>navigate(item.drill as Drilldown)}
          aria-label={item.label+'の内訳を見る'}><item.icon size={19}/><strong>{item.n}<small>{item.unit}</small></strong>
          <span>{item.label} <ArrowRight size={13}/></span></button>)}
      </div>
      <div className="taste-grid">
        <section className="taste-panel">
          <h3>評価の分布</h3><p className="taste-muted">評価あり {report.rated}件 · 星1〜5</p>
          <div className="taste-rating-chart">{report.ratingDistribution.map((count,i)=><button type="button"
            className="taste-rating-column" key={i} disabled={!count}
            onClick={()=>navigate({kind:'rating',value:String(i+1),label:'星'+(i+1)+'の日本酒'})}
            aria-label={'星'+(i+1)+'の日本酒 '+count+'件の内訳'}>
            <span>{count}</span><div className="taste-rating-track"><div style={{height:report.rated?100*count/report.rated+'%':'0%'}}/></div>
            <small>★{i+1}</small></button>)}</div>
          <p className="taste-small">未評価の記録は平均値・評価分布から除外します。</p>
        </section>
        <Radar axes={report.axes} onSelect={navigate}/>
        <Facet title="よく飲んだ日本酒の種類" rows={report.types} kind="count" dimension="type" index="types" onSelect={navigate}/>
        <Facet title="産地別の記録" rows={report.prefectures} kind="count" dimension="prefecture" index="prefectures" onSelect={navigate}/>
        <Facet title="よく選んだ香り" rows={report.aromas} kind="count" dimension="aroma" index="aromas" onSelect={navigate}/>
        <Facet title="味わい・口当たり" rows={report.tastes} kind="count" dimension="taste" index="tastes" onSelect={navigate}/>
        <Facet title="高評価の酒蔵" rows={report.breweries} kind="rating" dimension="brewery" index="breweries" onSelect={navigate}/>
        <Facet title="高評価の日本酒の種類" rows={report.types} kind="rating" dimension="type" index="types" onSelect={navigate}/>
      </div>
      <section className="taste-panel taste-months">
        <h3>日本酒との出会いの軌跡</h3>
        {report.months.length?<div className="taste-month-track">{report.months.map(m=><button type="button" className="taste-month" key={m.month}
          onClick={()=>navigate({kind:'month',value:m.month,label:m.month+'の記録'})}
          aria-label={m.month+'の日本酒 '+m.count+'件を見る'}>
          <strong>{m.count}</strong><div className="taste-month-bar" style={{height:Math.max(6,100*m.count/maxMonth)+'%'}}/><span>{m.month.slice(2)}</span>
        </button>)}</div>:<p className="taste-muted">日付のある記録がまだありません。</p>}
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
        {insights.length?<div className="taste-insight-list">{shown.map(it=><button type="button" className="taste-insight taste-insight-link" key={it.id}
          onClick={()=>navigate(detailOfInsight(it.id))}>
          <div><span className="taste-insight-category">{it.category}</span>
            <span className="taste-insight-strength">{it.strength}</span></div>
          <h3>{it.headline}</h3><p>{it.detail}</p><small>{it.evidence}　·　対象の日本酒を見る →</small>
        </button>)}</div>:<p className="taste-muted">このカテゴリでは、十分な件数のある分析コメントがまだありません。</p>}
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
