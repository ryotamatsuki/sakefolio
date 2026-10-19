import {useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,ChevronRight,MapPin,Star,Wine,Search,ShieldCheck} from 'lucide-react';
import type {RecordEntry} from './types';
import {breweryMapsUrl} from './catalog';
import {SENSORY_AXES,tagLabels} from './sensory';
import {isDemoRecord,validRating} from './tasteAnalytics';
import {drilldownIndexRows,getDrilldownRecords,indexChild,sortDrilldownRecords} from './dashboardDrilldownModel';
import type {Drilldown,RecordSort} from './dashboardDrilldownModel';

interface Props {
  records:RecordEntry[];
  path:Drilldown[];
  onBack:()=>void;
  onReset:()=>void;
  onNavigate:(filter:Drilldown)=>void;
  onJump:(depth:number)=>void;
  renderPhoto:(record:RecordEntry)=>ReactNode;
}
const average=(rs:RecordEntry[])=>{
  const scores=rs.map(validRating).filter((v):v is number=>v!==null);
  return scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2):'—';
};
const axisNames=Object.fromEntries(SENSORY_AXES.map(axis=>[axis.key,axis.title]));
const indexLabels:{[key:string]:string}={
  prefectures:'産地',breweries:'酒蔵',brands:'銘柄',types:'日本酒の種類',
  aromas:'香り',tastes:'味わい',months:'年月',axes:'味わいの軸'
};
export default function DashboardDrilldown({records,path,onBack,onReset,onNavigate,onJump,renderPhoto}:Props){
  const [sort,setSort]=useState<RecordSort>('date');
  const [search,setSearch]=useState('');
  const [onlyHigh,setOnlyHigh]=useState(false);
  const selected=path[path.length-1];
  const parentRows=useMemo(()=>getDrilldownRecords(records,path),[records,path]);
  const isRecord=selected.kind==='record';
  const isIndex=selected.kind==='index';
  const detail=useMemo(()=>isRecord?parentRows[0]||null:null,[isRecord,parentRows]);
  useEffect(()=>{setSort(selected.kind==='rating'||selected.kind==='high'?'rating-desc':'date');setSearch('');setOnlyHigh(false);},
    [selected.kind,selected.value,selected.index]);
  const listing=useMemo(()=>{
    let list=parentRows;
    if(search.trim()){
      const q=search.trim().toLocaleLowerCase('ja');
      list=list.filter(r=>[r.brandName,r.productName,r.breweryName,r.prefecture,r.sakeType,r.notes]
        .some(value=>(value||'').toLocaleLowerCase('ja').includes(q)));
    }
    if(onlyHigh)list=list.filter(r=>(validRating(r)??0)>=4);
    return sortDrilldownRecords(list,sort);
  },[parentRows,search,onlyHigh,sort]);
  const indexRows=useMemo(()=>isIndex&&selected.index?
    drilldownIndexRows(parentRows,selected.index):[],[isIndex,parentRows,selected.index]);
  const indexName=selected.index||'brands';
  return <section className="taste-detail-page" aria-label="ダッシュボード集計の内訳">
    <nav className="taste-crumbs" aria-label="分析の階層">
      <button type="button" onClick={onReset}>嗜好分析</button>
      {path.map((p,i)=><span key={i} className="taste-crumb-item"><ChevronRight size={13}/>
        <button type="button" onClick={()=>onJump(i+1)} aria-current={i===path.length-1?'page':undefined}>
          {p.label}</button></span>)}
    </nav>
    <button type="button" className="taste-return" onClick={onBack}><ArrowLeft size={17}/> ひとつ前に戻る</button>
    <div className="taste-detail-head">
      <span className="taste-eyebrow">SAKE COLLECTION · DRILL DOWN</span>
      <h1>{isRecord?(detail?.brandName||'記録の詳細'):selected.label}<span className="green-period">.</span></h1>
      <p>{isRecord?'この一杯の記録に保存された内容を確認できます。':
        isIndex?'項目をタップすると、該当する日本酒一覧を確認できます。':
        'この条件に一致した日本酒です。銘柄をタップすると、評価や香り、ラベル写真を確認できます。'}</p>
    </div>
    {isRecord?(detail?<article className="taste-record-detail">
      <div className="taste-record-detail-media">
        {detail.photoId?renderPhoto(detail):<div className="taste-no-photo"><Wine size={39}/><span>ラベル写真未登録</span></div>}
      </div>
      <div className="taste-record-detail-content">
        <div className="taste-record-info">
          {isDemoRecord(detail)&&<span className="taste-demo-badge">DEMO · 架空の飲酒評価</span>}
          <span className="taste-record-date"><CalendarDays size={14}/> {detail.drinkingDate||'日付なし'}</span>
        </div>
        <h2>{detail.brandName}</h2>
        {detail.productName&&<p className="taste-record-product">{detail.productName}</p>}
        <div className="taste-detail-score">{validRating(detail)===null?'未評価':<><Star size={18} fill="currentColor"/> {detail.rating} / 5</>}</div>
        <dl className="taste-record-facts">
          {([['酒蔵',detail.breweryName],['産地',detail.prefecture],['日本酒の種類',detail.sakeType],
            ['火入れ',detail.heatTreatment],['醸造法',detail.brewingMethod],['原料米',detail.riceVariety],
            ['精米歩合',detail.polishingRatio?detail.polishingRatio+'%':''],
            ['香り',tagLabels(detail.aromaTagIds,'aroma').join('・')],
            ['味わい',tagLabels(detail.tasteTagIds,'taste').join('・')],
            ...SENSORY_AXES.map(axis=>[axis.title,axis.options[Number(detail[axis.key])-1]||''])
          ] as [string,string][]).filter(([,v])=>Boolean(v)).map(([k,v])=><div key={k}>
            <dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {detail.notes&&<div className="taste-record-comment"><strong>記録した感想</strong><p>{detail.notes}</p></div>}
        {detail.breweryName&&<a className="taste-record-map" href={breweryMapsUrl(detail.breweryName,detail.prefecture,detail.municipality,detail.breweryAddress)} target="_blank" rel="noopener noreferrer">
          <MapPin size={17}/> この酒蔵をGoogleマップで確認 <ArrowRight size={16}/></a>}
      </div>
    </article>:<p className="taste-muted">記録が見つかりません。表示対象が変更された可能性があります。</p>):
    isIndex?<div className="taste-index">
      <p className="taste-index-count">{indexLabels[indexName]}の区分 {indexRows.length}件 / 対象の飲酒記録 {parentRows.length}件</p>
      <div className="taste-index-grid">{indexRows.map(row=><button type="button" key={row.value}
        className="taste-index-item" onClick={()=>onNavigate(indexChild(indexName,row.value,row.label))}>
        <span><strong>{row.label}</strong><small>{row.count}件の記録</small></span>
        <ChevronRight size={20}/></button>)}</div>
      {!indexRows.length&&<p className="taste-muted">この項目のデータがまだ登録されていません。</p>}
    </div>:<>
      <div className="taste-detail-summary">
        <div><span>該当する記録</span><strong>{parentRows.length}<small>件</small></strong></div>
        <div><span>平均評価</span><strong>{average(parentRows)}<small> / 5</small></strong></div>
        <div><span>星4以上</span><strong>{parentRows.filter(r=>(validRating(r)??0)>=4).length}<small>件</small></strong></div>
      </div>
      {selected.kind==='axis'&&<div className="taste-axis-detail-hint">
        <strong>{axisNames[selected.value||'']||'味の印象'}：5段階の内訳</strong>
        <div>{SENSORY_AXES.filter(axis=>axis.key===selected.value).flatMap(axis=>
          axis.options.map((option,i)=><span key={i}>{i+1}：{option} {parentRows.filter(r=>r[axis.key]===String(i+1)).length}件</span>))}</div>
      </div>}
      <div className="taste-detail-controls">
        <label className="taste-detail-search"><Search size={17}/><input type="search" value={search}
          onChange={e=>setSearch(e.target.value)} placeholder="銘柄・酒蔵・メモで絞り込み" aria-label="内訳の検索"/></label>
        <label className="taste-detail-sort">表示順
          <select value={sort} onChange={e=>setSort(e.target.value as RecordSort)}>
            <option value="date">記録日の新しい順</option>
            <option value="rating-desc">評価の高い順</option>
            <option value="rating-asc">評価の低い順</option>
            <option value="name">銘柄名順</option>
          </select>
        </label>
        <label className="taste-detail-high"><input type="checkbox" checked={onlyHigh} onChange={e=>setOnlyHigh(e.target.checked)}/> ★4以上のみ</label>
      </div>
      <p className="taste-index-count">表示 {listing.length}件 / 条件に一致 {parentRows.length}件</p>
      <div className="taste-record-list">{listing.map(r=><button type="button" key={r.reviewId}
        className="taste-record-item" onClick={()=>onNavigate({kind:'record',value:r.reviewId,label:r.brandName})}>
        <span className="taste-record-thumb">{r.photoId?renderPhoto(r):<Wine size={24}/>}</span>
        <span className="taste-record-item-main">
          <span className="taste-record-item-top">{r.drinkingDate||'日付なし'}{isDemoRecord(r)&&<em>DEMO</em>}</span>
          <strong>{r.brandName}</strong>
          <span>{r.productName||r.sakeType} · {r.prefecture||'産地未登録'}</span>
          <small>{r.breweryName}</small>
        </span>
        <span className="taste-record-item-end"><strong>{validRating(r)===null?'—':'★ '+r.rating}</strong><ChevronRight size={18}/></span>
      </button>)}</div>
      {!listing.length&&<p className="taste-muted taste-detail-no-results">一致する記録がありません。検索や絞り込みを変更してください。</p>}
    </>}
    <p className="taste-drilldown-privacy"><ShieldCheck size={14}/> この一覧は、現在接続しているGoogle Driveの記録をブラウザ内で絞り込んだ結果です。</p>
  </section>;
}
