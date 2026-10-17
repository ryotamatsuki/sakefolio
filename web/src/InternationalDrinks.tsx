import {useEffect,useMemo,useState} from 'react';
import type {ChangeEvent,FormEvent} from 'react';
import {ArrowRight,BookOpen,Camera,Check,ChevronDown,Download,ExternalLink,Info,MapPin,Search,ShieldCheck,Upload,Wine,X} from 'lucide-react';
import {BRAND_STARTERS,KIND_CONFIG,KIND_NAME,brandMatches,normalizeOffProducts} from './internationalCatalog';
import type {BeverageKind,OffProduct} from './internationalCatalog';
import {buildBackup,listInternationalRecords,restoreBackup,saveInternationalRecord} from './internationalLocal';
import type {InternationalRecord} from './internationalLocal';

const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const initial=(kind:BeverageKind)=>({
  kind,brandName:'',productName:'',producer:'',region:'',sourceUrl:'',attributes:{} as Record<string,string>,
  experience:'catalogued' as 'catalogued'|'tasted',tastedAt:'',rating:'',aroma:'',taste:'',notes:''
});
function PhotoPreview({blob,alt}:{blob:Blob|null;alt:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{
  if(!blob){setUrl('');return;}
  const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next);
 },[blob]);
 return url?<img src={url} alt={alt} loading="lazy"/>:<Wine size={25}/>;
}
const avg=(r:InternationalRecord[])=>{
 const grades=r.map(x=>Number(x.rating)).filter(x=>Number.isInteger(x)&&x>=1&&x<=5);
 return grades.length?(grades.reduce((a,b)=>a+b,0)/grades.length).toFixed(2):'—';
};
const urlForOff=(q:string)=>'https://world.openfoodfacts.org/cgi/search.pl?search_terms='+
  encodeURIComponent(q)+'&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,quantity';
export default function InternationalDrinks(){
 const [kind,setKind]=useState<BeverageKind>('baijiu');
 const [data,setData]=useState(initial('baijiu'));
 const [records,setRecords]=useState<InternationalRecord[]>([]);
 const [photo,setPhoto]=useState<File|null>(null);
 const [query,setQuery]=useState('');
 const [offQuery,setOffQuery]=useState('');
 const [offResults,setOffResults]=useState<OffProduct[]>([]);
 const [offState,setOffState]=useState<'idle'|'loading'|'error'|'done'>('idle');
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const [ready,setReady]=useState(false);
 const [selected,setSelected]=useState<string>('');
 const [filter,setFilter]=useState<BeverageKind|'all'>('all');
 const [lastSearch,setLastSearch]=useState(0);
 const [section,setSection]=useState<'new'|'collection'>('new');
 const config=KIND_CONFIG.find(c=>c.id===kind)!;
 const filtered=useMemo(()=>BRAND_STARTERS.filter(b=>brandMatches(b,kind,query)).slice(0,15),[kind,query]);
 const own=useMemo(()=>records.filter(r=>filter==='all'||r.kind===filter),[records,filter]);
 const chosen=records.find(x=>x.id===selected);
 const load=async()=>{
   try{setRecords(await listInternationalRecords());setReady(true);setError('');}
   catch(e){setReady(false);setError(e instanceof Error?e.message:'端末内データを開けません。');}
 };
 useEffect(()=>{void load();},[]);
 const swap=(next:BeverageKind)=>{setKind(next);setData(initial(next));setQuery('');setOffResults([]);setOffState('idle');setPhoto(null);setSelected('');setError('');};
 const setField=(key:string,value:string)=>setData(d=>({...d,[key]:value}));
 const setAttribute=(key:string,value:string)=>setData(d=>({...d,attributes:{...d.attributes,[key]:value}}));
 const pick=(name:string,region:string,source='')=>{
   setData(d=>({...d,brandName:name,productName:name,region:region||d.region,sourceUrl:source}));
   setQuery(name);
 };
 const searchOff=async()=>{
   const q=offQuery.trim();
   if(q.length<2){setError('検索語は2文字以上入力してください。');return;}
   if(Date.now()-lastSearch<15000){setError('検索の連続実行を避けるため15秒お待ちください。');return;}
   setOffState('loading');setOffResults([]);setError('');setLastSearch(Date.now());
   try{
     const response=await fetch(urlForOff(q),{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
     if(!response.ok)throw new Error('検索先が応答しませんでした（HTTP '+response.status+'）。');
     const json:unknown=await response.json();
     setOffResults(normalizeOffProducts(json));setOffState('done');
   }catch(e){setOffState('error');setError('Open Food Factsの検索に失敗しました。中国国内などからアクセスできない場合は手動入力してください。');}
 };
 const save=async(e:FormEvent)=>{
   e.preventDefault();if(busy||!ready)return;
   setBusy(true);setStatus('');setError('');
   const record:InternationalRecord={
     id:crypto.randomUUID(),kind,brandName:data.brandName.trim(),productName:data.productName.trim(),
     producer:data.producer.trim(),region:data.region.trim(),country:'中国',
     sourceUrl:data.sourceUrl,attributes:Object.fromEntries(Object.entries(data.attributes).filter(([,v])=>!!v.trim())),
     experience:data.experience,tastedAt:data.experience==='tasted'?data.tastedAt:'',
     rating:data.experience==='tasted'?data.rating:'',
     aroma:data.aroma.trim(),taste:data.taste.trim(),notes:data.notes.trim(),
     createdAt:new Date().toISOString(),photo:null
   };
   try{
     await saveInternationalRecord(record,photo);
     await load();setData(initial(kind));setPhoto(null);setQuery('');setOffResults([]);setOffState('idle');
     setSection('collection');setStatus('端末内に保存しました。Google Driveにはまだ同期していません。');
   }catch(x){setError(x instanceof Error?x.message:'保存できませんでした。');}
   finally{setBusy(false);}
 };
 const backup=async()=>{
   setError('');setStatus('');
   try{
     const blob=await buildBackup(records),url=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=url;a.download='sakefolio-china-backup-'+today()+'.json';a.click();
     setTimeout(()=>URL.revokeObjectURL(url),60000);
     setStatus('バックアップのダウンロードを開始しました。端末外にも安全に保管してください。');
   }catch(e){setError(e instanceof Error?e.message:'書き出しに失敗しました。');}
 };
 const restore=async(e:ChangeEvent<HTMLInputElement>)=>{
   const file=e.target.files?.[0];e.target.value='';if(!file)return;
   if(!window.confirm('バックアップを読み込みます。既存IDは上書きせず、重複を追加しません。続行しますか？'))return;
   setBusy(true);setError('');setStatus('');
   try{
     const outcome=await restoreBackup(file);await load();
     setStatus('復元しました：新規'+outcome.added+'件、既存重複'+outcome.duplicates+'件（上書きなし）。');
     setSection('collection');
   }catch(x){await load();setError(x instanceof Error?x.message:'復元できませんでした。');}
   finally{setBusy(false);}
 };
 return <section className="page-section international-page">
   <div className="interior-head"><span className="taste-eyebrow">SAKEFOLIO · CHINA / INTERNATIONAL LAB</span>
     <h1>中国のお酒を記録する<span className="green-period">.</span></h1>
     <p>白酒、紹興酒を含む黄酒、中国ビール、中国ワイン。日本酒とは別の分類で記録し、端末内で管理します。</p>
   </div>
   <div className="international-notice" role="note"><ShieldCheck size={19}/>
     <div><strong>Googleが使えない環境向けの端末内保存（試験機能）</strong>
       <p>このページの記録・写真は、このブラウザのIndexedDBに保存します。Google Driveには送信・同期しません。ブラウザのデータ消去や端末故障で失われるため、定期的にバックアップを書き出してください。サイト自体の中国本土からの接続は未確認です。</p></div>
   </div>
   {!!status&&<p className="international-status" role="status">{status}</p>}
   {!!error&&<p className="international-error" role="alert">{error}</p>}
   <div className="international-mode" role="group" aria-label="記録画面の切替">
     <button type="button" aria-pressed={section==='new'} onClick={()=>{setSection('new');setSelected('');}}>商品を登録する</button>
     <button type="button" aria-pressed={section==='collection'} onClick={()=>setSection('collection')}>マイコレクション ({records.length})</button>
   </div>
   {section==='new'?<>
    <div className="international-kinds" role="group" aria-label="酒類を選ぶ">
      {KIND_CONFIG.map(c=><button type="button" key={c.id} aria-pressed={kind===c.id} onClick={()=>swap(c.id)}>
        <small>{c.english}</small><strong>{c.name}</strong><span>{c.description}</span></button>)}
    </div>
    <div className="international-layout">
      <div className="international-finder">
        <h2><Search size={18}/> まず銘柄を探す</h2>
        <label>候補ブランド（実在するブランド名のみ）
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="茅台、青島、Changyuなど"/>
        </label>
        <div className="international-hits">{filtered.map(b=><button type="button" key={b.id}
          onClick={()=>pick(b.name,b.region)}>
          <strong>{b.name}</strong><span>{b.latin} · {b.region}</span><ArrowRight size={16}/></button>)}</div>
        {!filtered.length&&<p>候補がありません。実在する商品名を調べて手動で登録できます。</p>}
        <h3>Open Food Factsから商品を検索</h3>
        <p>利用者が検索ボタンを押したときだけ外部APIへ検索語を送信します。商品名・ブランド名・容量はユーザー登録の参考値です。商品区分の一致やラベル写真の利用権限は別途確認してください。</p>
        <label>商品名・ブランド名<input value={offQuery} onChange={e=>setOffQuery(e.target.value)}
          placeholder="例：Tsingtao" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void searchOff();}}}/></label>
        <button type="button" className="international-lookup" disabled={offState==='loading'} onClick={()=>void searchOff()}>
          {offState==='loading'?'検索中…':'Open Food Factsを検索'} <Search size={15}/></button>
        {offState==='done'&&!offResults.length&&<p role="status">一致する商品がありません。検索語を変えるか手動入力してください。</p>}
        {!!offResults.length&&<div className="international-hits">
          {offResults.map(p=><button type="button" key={p.code} onClick={()=>{
            setData(d=>({...d,brandName:p.brandName||d.brandName,productName:p.productName,sourceUrl:p.source}));
            setQuery(p.brandName||'');
          }}>
            <strong>{p.productName}</strong><span>{p.brandName||'ブランド未登録'} · {p.quantity} · EAN {p.code}</span><ArrowRight size={16}/></button>)}</div>}
        <p className="international-credits"><a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a> — ODbL / データ帰属。<a href="https://world.openfoodfacts.org/terms-of-use" target="_blank" rel="noopener noreferrer">再利用規約</a>。掲載データの正確性・網羅性は未保証。</p>
      </div>
      <form className="international-form" onSubmit={save}>
        <h2><BookOpen size={19}/> {config.name}の記録</h2>
        <div className="field-grid two">
          <label>ブランド名 <span className="required">必須</span><input required maxLength={200} value={data.brandName} onChange={e=>setField('brandName',e.target.value)} placeholder="商品に記載された銘柄名"/></label>
          <label>商品・シリーズ名 <span className="required">必須</span><input required maxLength={200} value={data.productName} onChange={e=>setField('productName',e.target.value)} placeholder="正式な商品名"/></label>
          <label>メーカー・醸造所<input maxLength={200} value={data.producer} onChange={e=>setField('producer',e.target.value)} placeholder="ラベル・公式情報を確認"/></label>
          <label>中国の産地<input maxLength={200} value={data.region} onChange={e=>setField('region',e.target.value)} placeholder="例：貴州省、寧夏回族自治区"/></label>
          <label>アルコール度数（%）<input type="number" min="0" max="100" step=".1"
            value={data.attributes.abv||''} onChange={e=>setAttribute('abv',e.target.value)} placeholder="例：53"/></label>
          <label>容量（mL）<input type="number" min="1" max="20000" step="1"
            value={data.attributes.volume||''} onChange={e=>setAttribute('volume',e.target.value)} placeholder="例：500"/></label>
        </div>
        <div className="field-grid two">
          {config.fields.map(field=><label key={field.key}>{field.label}
            {field.options?<select value={data.attributes[field.key]||''} onChange={e=>setAttribute(field.key,e.target.value)}>
              {field.options.map(option=><option key={option} value={option}>{option||'未設定'}</option>)}</select>:
              <input maxLength={200} value={data.attributes[field.key]||''} placeholder={field.placeholder}
                onChange={e=>setAttribute(field.key,e.target.value)}/>}</label>)}
        </div>
        <label>商品情報の出典URL（任意）<input type="url" pattern="https://.*" maxLength={1000}
          value={data.sourceUrl} placeholder="https://..." onChange={e=>setField('sourceUrl',e.target.value)}/></label>
        <div className="international-experience" role="group" aria-label="記録の種別">
          <button type="button" aria-pressed={data.experience==='catalogued'} onClick={()=>setData(d=>({...d,experience:'catalogued',rating:'',tastedAt:''}))}>商品だけ登録（未飲酒）</button>
          <button type="button" aria-pressed={data.experience==='tasted'} onClick={()=>setData(d=>({...d,experience:'tasted',tastedAt:today()}))}>実際に飲んだ</button>
        </div>
        {data.experience==='tasted'&&<div className="field-grid two">
          <label>飲んだ日 <span className="required">必須</span><input type="date" required value={data.tastedAt} onChange={e=>setField('tastedAt',e.target.value)}/></label>
          <label>評価（任意）<select value={data.rating} onChange={e=>setField('rating',e.target.value)}>
            <option value="">未評価</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}点</option>)}</select></label>
        </div>}
        <div className="field-grid two">
          <label>香りのメモ<input maxLength={600} value={data.aroma} onChange={e=>setField('aroma',e.target.value)} placeholder={kind==='baijiu'?'例：酱香、穀物香':'例：果実香、麦芽香'}/></label>
          <label>味わいのメモ<input maxLength={600} value={data.taste} onChange={e=>setField('taste',e.target.value)} placeholder="例：甘み、酸味、余韻"/></label>
        </div>
        <label>記録メモ<textarea rows={3} maxLength={2500} value={data.notes} onChange={e=>setField('notes',e.target.value)}
          placeholder="飲んでいない場合は商品情報のメモとして記録します。"/></label>
        <label className="international-photo-upload">
          <Camera size={20}/><strong>ラベル写真を追加（任意）</strong>
          <span>{photo?photo.name:'端末で撮影または保存した写真を選択（10MB以内）'}</span>
          <input type="file" accept="image/*" onChange={e=>setPhoto(e.target.files?.[0]||null)}/>
        </label>
        {photo&&<button type="button" className="international-photo-clear" onClick={()=>setPhoto(null)}>写真を取り消す <X size={14}/></button>}
        <button type="submit" disabled={!ready||busy} className="button button-dark international-save">
          {busy?'端末へ保存中…':'この商品を端末に保存'} <ArrowRight size={17}/></button>
        <p className="international-small">Google Drive同期は未実装です。保存できたら「マイコレクション」で確認し、バックアップを作成してください。</p>
      </form>
    </div>
   </>:<>
     <div className="international-backup">
       <div><h2>端末内のコレクション</h2><p>登録 {records.length}件 · 実際に飲んだ記録 {records.filter(r=>r.experience==='tasted').length}件 · 平均評価 {avg(records)}点（評価ありの記録のみ）</p></div>
       <div className="international-backup-actions">
         <button type="button" onClick={()=>void backup()} disabled={!ready||!records.length}><Download size={16}/> バックアップ書出し</button>
         <label><Upload size={16}/> バックアップを復元<input type="file" accept=".json,application/json" onChange={e=>void restore(e)} disabled={busy}/></label>
       </div>
     </div>
     <div className="international-collection-filter" role="group" aria-label="コレクションの酒類を絞る">
       {[{id:'all',name:'すべて'},...KIND_CONFIG].map(k=><button type="button" key={k.id} aria-pressed={filter===k.id} onClick={()=>{setFilter(k.id as BeverageKind|'all');setSelected('');}}>{k.name}</button>)}
     </div>
     {!!records.length&&<div className="international-category-stats">
       {KIND_CONFIG.map(c=><div key={c.id}><span>{c.name}</span><strong>{records.filter(r=>r.kind===c.id).length}</strong><small>件 · 平均 {avg(records.filter(r=>r.kind===c.id))} / 5</small></div>)}
     </div>}
     {!own.length?<div className="international-empty"><Wine size={30}/><p>この酒類の記録はまだありません。商品情報を登録してみましょう。</p></div>:
      <div className="international-collection-layout">
       <div className="international-collection-list">{own.map(r=><button type="button" key={r.id}
         aria-pressed={selected===r.id} onClick={()=>setSelected(r.id)}>
         <span className="international-thumb"><PhotoPreview blob={r.photo} alt={r.brandName+'のラベル'}/></span>
         <span><strong>{r.productName}</strong><small>{KIND_NAME(r.kind)} · {r.brandName}</small>
           <small>{r.experience==='tasted'?'★ '+(r.rating||'未評価')+' · '+r.tastedAt:'商品情報のみ'} · {r.region||'産地未設定'}</small></span>
         <ArrowRight size={17}/></button>)}</div>
       {chosen&&<article className="international-record-detail">
         <button className="international-close" type="button" onClick={()=>setSelected('')}><X size={17}/> 閉じる</button>
         <div className="international-detail-photo"><PhotoPreview blob={chosen.photo} alt={chosen.productName+'のラベル'}/></div>
         <h3>{chosen.productName}</h3><p>{chosen.brandName} · {KIND_NAME(chosen.kind)} · {chosen.region}</p>
         <dl>
           {([['メーカー',chosen.producer],['区分',chosen.experience==='tasted'?'実際に飲んだ':'商品情報のみ'],
             ['飲んだ日',chosen.tastedAt],['評価',chosen.rating?chosen.rating+' / 5':''],
             ['香り',chosen.aroma],['味わい',chosen.taste],
             ...Object.entries(chosen.attributes).map(([key,v])=>
               [KIND_CONFIG.find(c=>c.id===chosen.kind)?.fields.find(f=>f.key===key)?.label||
                 ({abv:'アルコール度数(%)',volume:'容量(mL)'} as Record<string,string>)[key]||key,v])
           ] as string[][]).filter(([,v])=>v).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
         </dl>
         {chosen.notes&&<p className="international-notes">{chosen.notes}</p>}
         {chosen.sourceUrl&&<a className="international-source-link" href={chosen.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> 商品情報の出典を確認</a>}
         {chosen.producer&&<a className="international-source-link" target="_blank" rel="noopener noreferrer"
           href={'https://www.openstreetmap.org/search?query='+encodeURIComponent(chosen.producer+' '+chosen.region+' 中国')}><MapPin size={15}/> OpenStreetMapで場所を検索（位置未確定）</a>}
       </article>}
      </div>}
   </>}
   <p className="international-footer"><Info size={14}/> このページは日本酒とは独立した開発中の機能です。国際酒類の登録内容は日本酒用Google Sheets、既存の日本酒地図・嗜好分析には混ぜません。商品名とメーカーの事実確認はラベル・公式情報を優先します。</p>
 </section>;
}
