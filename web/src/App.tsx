import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowRight, BookOpen, Camera, Check, ChevronDown, Compass,
  ExternalLink, FolderHeart, Leaf, LogIn, LogOut, MapPin,
  Plus, Search, ShieldCheck, Star, Wine, X
} from 'lucide-react';
import type { SaveAttempt } from './google';
import { validateRecordInput } from './security';
import type { Brand, RecordEntry, StorageInfo } from './types';
import type { BreweryCoordinate } from './breweryMapModel';
import BreweryMap from './BreweryMap';
import { createPhotoPreview } from './photos';
import { breweryMapsUrl, breweryDirectionsUrl, listBreweries, HEAT_TREATMENTS, loadBrands, METHODS, PREFECTURES, STYLES, TYPES } from './catalog';
import type { BreweryOption } from './catalog';
import { AROMA_GROUPS, POPULAR_AROMA_IDS, SENSORY_AXES, TASTE_GROUPS, selectedIds, tagLabels, toggleIds } from './sensory';
import { ensureStorage, getPhotoBlob, getDriveAccount, GOOGLE_CLIENT_ID, loadManualBrands, loadRecords, requestGoogleAccess, revokeAccess, saveRecord, inspectStorage } from './google';

type Tab = 'home' | 'explore' | 'record' | 'places';
function todayLocal(): string {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function emptyEntry(): RecordEntry {
  return {
    reviewId:'',brandId:'',brandName:'',breweryName:'',prefecture:'',municipality:'',
    breweryAddress:'',productName:'',sakeType:'特定名称の表示なし・不明',sakeTypeOther:'',
    brewingMethod:'不明・記載なし',heatTreatment:'不明・記載なし',processingStyles:'',
    riceVariety:'',polishingRatio:'',alcoholPercent:'',vintage:'',
    drinkingDate:todayLocal(),rating:'',aromaTagIds:'',tasteTagIds:'',sweetDry:'',lightRich:'',acidity:'',umami:'',notes:'',photoId:'',createdAt:''
  };
}
function Photo({ token, photoId, alt }: { token: string; photoId: string; alt: string }) {
  const [url, setUrl] = useState('');
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');setError('');
    if (token && photoId) {
      getPhotoBlob(token, photoId).then(blob => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      }).catch(error => { if (active) setError(error instanceof Error ? error.message : '写真の通信エラー。'); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [token, photoId,retry]);
  return url ? <img className="record-photo" src={url} alt={alt} loading="lazy" onError={()=>{setUrl('');setError('画像形式を展開できません。JPEG・PNGで再登録してください。');}} /> : <div className="photo-fallback"><Wine size={30} strokeWidth={1.3}/>{error && <div role="alert">{error}<button type="button" onClick={()=>setRetry(v=>v+1)}>写真を再取得</button></div>}</div>;
}
function SectionEyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow"><span className="eyebrow-line"/>{children}</div>;
}
export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [catalog, setCatalog] = useState<Brand[]>([]);
  const [breweryCoordinates, setBreweryCoordinates] = useState<BreweryCoordinate[]>([]);
  const [coordinateStatus, setCoordinateStatus] = useState<'loading'|'loaded'|'error'>('loading');
  const [manualBrands, setManualBrands] = useState<Brand[]>([]);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [token, setToken] = useState('');
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterPrefecture, setFilterPrefecture] = useState('');
  const [entry, setEntry] = useState<RecordEntry>(emptyEntry);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [selectedPhoto,setSelectedPhoto] = useState<File | null>(null);
  const [photoBusy,setPhotoBusy] = useState(false);
  const [photoError,setPhotoError] = useState('');
  const pendingSave = useRef<{entry:RecordEntry;photo:File|null;attempt:SaveAttempt;email:string} | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllAromas, setShowAllAromas] = useState(false);
  const [aromaSearch, setAromaSearch] = useState('');
  const [breweryPickerOpen,setBreweryPickerOpen]=useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Invalidates outstanding requests before a disconnect or another connection.
  const session = useRef(0);
  const operation = useRef(false);
  const brands = useMemo(() => [...manualBrands, ...catalog], [manualBrands, catalog]);
  const breweries=useMemo(()=>listBreweries(brands,records),[brands,records]);
  const breweryMatches=useMemo(()=>{
    const q=entry.breweryName.trim().toLocaleLowerCase('ja');
    if(!q)return [];
    return breweries.filter(b=>b.name.toLocaleLowerCase('ja').includes(q))
      .sort((a,b)=>Number(b.name.toLocaleLowerCase('ja').startsWith(q))-Number(a.name.toLocaleLowerCase('ja').startsWith(q))
      ||a.name.localeCompare(b.name,'ja')).slice(0,8);
  },[breweries,entry.breweryName]);
  const mapUrl=entry.breweryName.trim()?breweryMapsUrl(entry.breweryName,entry.prefecture,entry.municipality,entry.breweryAddress):'';
  const routeUrl=entry.breweryName.trim()?breweryDirectionsUrl(entry.breweryName,entry.prefecture,entry.municipality,entry.breweryAddress):'';

  useEffect(() => {
    loadBrands().then(setCatalog).catch(err => setMessage(String(err.message || err)));
    fetch(import.meta.env.BASE_URL + 'brewery-coordinates.json')
      .then(response => { if(!response.ok) throw new Error('酒蔵座標を取得できません。'); return response.json(); })
      .then((rows:unknown) => {
        if(!Array.isArray(rows)) throw new Error('酒蔵座標データの形式が不正です。');
        setBreweryCoordinates(rows as BreweryCoordinate[]);
        setCoordinateStatus('loaded');
      }).catch(()=>setCoordinateStatus('error'));
  }, []);
  useEffect(() => {
    let active = true;
    let url = '';
    setPreview('');setPhoto(null);setPhotoError('');setPhotoBusy(!!selectedPhoto);
    if (selectedPhoto) createPhotoPreview(selectedPhoto).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview(url);setPhoto(new File([blob],'label.png',{type:'image/png'}));
    }).catch(error => {
      if (active) setPhotoError(error instanceof Error ? error.message : '写真を変換できません。');
    }).finally(()=>{if(active)setPhotoBusy(false);});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [selectedPhoto]);

  const connect = async () => {
    if (operation.current) return;
    operation.current = true;
    const current = ++session.current;
    const previousEmail = accountEmail;
    setToken('');setStorage(null);setRecords([]);setManualBrands([]);setAccountEmail('');
    setBusy(true); setMessage('');
    try {
      const accessToken = await requestGoogleAccess();
      const account = await getDriveAccount(accessToken);
      if (pendingSave.current && pendingSave.current.email !== account.emailAddress) {
        setMessage('未完了の保存があります。同じGoogleアカウントで再接続してください。');return;
      }
      if (previousEmail && previousEmail !== account.emailAddress) {setEntry(emptyEntry());setSelectedPhoto(null);}
      const myStorage = await ensureStorage(accessToken);
      const [saved, added] = await Promise.all([
        loadRecords(accessToken, myStorage),loadManualBrands(accessToken,myStorage)
      ]);
      if (session.current !== current) return;
      setToken(accessToken);setStorage(myStorage);setRecords(saved);setManualBrands(added);
      setAccountEmail(account.emailAddress);
      setMessage('接続先: '+account.emailAddress+'。このアカウントのSakefolioフォルダに保存します。'+(pendingSave.current?'未完了の記録は保存ボタンで再確認・再開してください。':''));
    } catch (error) {
      if (session.current !== current) return;
      setMessage(error instanceof Error ? error.message : '接続に失敗しました。');
    } finally { operation.current = false; setBusy(false); }
  };
  const disconnect = () => {
    if (operation.current) return;
    pendingSave.current = null;setSelectedPhoto(null);
    ++session.current;
    if (token) revokeAccess(token);
    setToken('');setStorage(null);setRecords([]);setManualBrands([]);setAccountEmail('');
    setPhoto(null);setEntry(emptyEntry());setMessage('接続を解除しました。');setMenuOpen(false);
  };
  const update = (field: keyof RecordEntry, value: string) => setEntry(e => ({...e, [field]:value}));
  const toggleAroma = (id: string) => setEntry(e=>({...e, aromaTagIds:toggleIds(e.aromaTagIds,id)}));
  const toggleTaste = (id: string) => setEntry(e=>({...e, tasteTagIds:toggleIds(e.tasteTagIds,id)}));
  const selectBrewery=(brewery:BreweryOption)=>{
    if(pendingSave.current)return;
    setEntry(e=>{
      const same=e.breweryName===brewery.name&&e.prefecture===brewery.prefecture;
      return {...e,brandId:same?e.brandId:'',brandName:same?e.brandName:'',
        breweryName:brewery.name,prefecture:brewery.prefecture,
        municipality:brewery.municipality||(same?e.municipality:''),
        breweryAddress:brewery.address||(same?e.breweryAddress:'')};
    });
    setBreweryPickerOpen(false);
  };
  const setSelectedBrand = (brand: Brand) => {
    if (pendingSave.current) {setTab('record');setMessage('未完了の記録を先に再確認・再開してください。');return;}
    const located=breweries.find(b=>b.name===brand.breweryName&&b.prefecture===brand.prefecture);
    setEntry(e => ({...e,brandId:brand.brandId,brandName:brand.brandName,
      breweryName:brand.breweryName,prefecture:brand.prefecture,
      municipality:located?.municipality||'',breweryAddress:located?.address||''}));
    setBreweryPickerOpen(false);
    setTab('record');setSearch('');window.scrollTo({top:0,behavior:'smooth'});
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operation.current) return;
    if (!token || !storage) { setMessage('保存するには先にGoogle Driveへ接続してください。'); return; }
    if (!entry.breweryName.trim() || !entry.brandName.trim() || !entry.drinkingDate || !entry.rating) {
      setMessage('酒蔵、銘柄、飲んだ日、評価を入力してください。');return;
    }
    if (entry.sakeType === 'その他（自由記入）' && !entry.sakeTypeOther.trim()) {
      setMessage('「その他」を選んだ場合は種類名を記入してください。');return;
    }
    if (photoBusy || photoError) {setMessage('写真の確認が終わるまで保存できません。写真を選び直すか取り消してください。');return;}
    try {validateRecordInput(entry);} catch(error) {setMessage(error instanceof Error?error.message:'入力内容を確認してください。');return;}
    const pending = pendingSave.current ||= {entry:{...entry},photo,attempt:{reviewId:crypto.randomUUID()},email:accountEmail};
    operation.current = true;
    const current = session.current;
    setBusy(true);setMessage('');
    try {
      const reviewId = await saveRecord(token,storage,pending.entry,brands,pending.photo,pending.attempt);
      if (session.current !== current) return;
      const [saved, added] = await Promise.all([loadRecords(token,storage),loadManualBrands(token,storage)]);
      if (session.current !== current) return;
      if (!saved.some(record=>record.reviewId===reviewId)) throw new Error('保存後の一覧に記録が見つかりません。同じ画面から再確認してください。');
      pendingSave.current = null;
      setRecords(saved);setManualBrands(added);setEntry(emptyEntry());setPhoto(null);setSelectedPhoto(null);
      setShowAdvanced(false);setShowAllAromas(false);setAromaSearch('');setTab('home');
      setMessage('記録を保存しました。Google SheetsとDriveで確認できます。');
      window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) {
      if (session.current !== current) return;
      setMessage((error instanceof Error ? error.message : '記録の保存に失敗しました。')+' 入力内容を保持しています。認証期限切れの場合は右上から再接続し、同じ保存ボタンを押してください。');
    } finally {operation.current = false;setBusy(false);}
  };
  const filteredBrands = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('ja');
    if (!q && !filterPrefecture) return brands.slice(0,24);
    return brands.filter(b => (!filterPrefecture || b.prefecture === filterPrefecture) &&
      (!q || [b.brandName,b.breweryName,b.prefecture].some(v => v.toLocaleLowerCase('ja').includes(q)))
    ).slice(0,48);
  },[brands,search,filterPrefecture]);
  const prefCount = useMemo(() => new Set(records.map(r => r.prefecture).filter(Boolean)).size,[records]);
  const avgRating = useMemo(() => {
    const nums = records.map(r => Number(r.rating)).filter(r=>Number.isFinite(r)&&r>0);
    return nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : '—';
  },[records]);


  const navigation: {tab:Tab; title:string; icon:typeof BookOpen}[] = [
    {tab:'home',title:'コレクション',icon:BookOpen},
    {tab:'explore',title:'銘柄を探す',icon:Search},
    {tab:'record',title:'記録する',icon:Plus},
    {tab:'places',title:'酒蔵と産地',icon:MapPin}
  ];
  const goto = useCallback((next:Tab) => {
    setTab(next);setMenuOpen(false);window.scrollTo({top:0,behavior:'smooth'});
  },[]);

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <button type="button" className="brand-lockup" onClick={() => goto('home')} aria-label="ホームへ戻る">
          <span className="logo-symbol"><Leaf size={19} strokeWidth={1.8}/></span>
          <span className="logo-text">Sakefolio<span className="logo-dot">.</span></span>
        </button>
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {navigation.map(n => <button type="button" key={n.tab}
            onClick={() => goto(n.tab)} className={tab===n.tab?'nav-active':''}>{n.title}</button>)}
        </nav>
        <div className="header-actions">
          {token ? <button className="account-button" onClick={() => setMenuOpen(v=>!v)} type="button">
            <span className="connection-dot"/><span className="account-label">{accountEmail || 'My Drive'}</span><ChevronDown size={15}/>
          </button> : <button className="button button-dark button-small" disabled={busy || !GOOGLE_CLIENT_ID}
            type="button" onClick={connect}><LogIn size={16}/>Googleで始める</button>}
        </div>
        {menuOpen && token && <div className="account-menu">
          <div className="account-info"><ShieldCheck size={18}/><span>{accountEmail}<br/>このGoogleアカウントのDriveに保存中</span></div>
          {storage && <a href={'https://drive.google.com/drive/folders/'+storage.folderId}
            target="_blank" rel="noopener noreferrer">保存フォルダを開く <ExternalLink size={14}/></a>}
          <button type="button" disabled={busy} onClick={connect}>Googleに再接続</button>
          <button type="button" disabled={busy} onClick={async()=>{
            if(operation.current || !storage)return;
            operation.current=true;setBusy(true);
            try{setMessage(await inspectStorage(token,storage));}catch(error){setMessage(error instanceof Error?error.message:'保存先を確認できません。');}
            finally{operation.current=false;setBusy(false);}
          }}>保存先の整合性を確認</button>
          <button type="button" disabled={busy} onClick={disconnect}><LogOut size={15}/>接続を解除</button>
        </div>}
      </div>
    </header>

    {message && <div role="status" className="status-banner"><span>{message}</span>
      <button type="button" aria-label="閉じる" onClick={()=>setMessage('')}><X size={17}/></button></div>}
    {!GOOGLE_CLIENT_ID && <div className="config-notice">
      <ShieldCheck size={18}/><span>デザインプレビュー中。Google保存機能を使うにはOAuthクライアントIDの設定が必要です（README参照）。</span>
    </div>}

    <main>
      {tab==='home' && <>
        <section className="hero">
          <div className="hero-content">
            <div className="hero-label"><span className="hero-label-line"/> THE ART OF REMEMBERING SAKE</div>
            <h1>一杯の記憶を、<br/><em>一生の図鑑に。</em></h1>
            <p>出会った日本酒、その蔵元、その土地。<br/>美味しかった瞬間を、美しいコレクションに。</p>
            <div className="hero-buttons">
              <button className="button button-cream" type="button" onClick={()=>goto('record')}>
                日本酒を記録する <ArrowRight size={18}/>
              </button>
              <button className="hero-link" type="button" onClick={()=>goto('explore')}>銘柄を探す <ArrowRight size={16}/></button>
            </div>
            <div className="hero-stat"><span>3,303</span> 銘柄のデータベースから見つける</div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit hero-orbit-one"/><div className="hero-orbit hero-orbit-two"/>
            <div className="bottle-shadow"/>
            <div className="bottle"><div className="bottle-cap"/><div className="bottle-neck"/><div className="bottle-body">
              <div className="bottle-label"><span>酒</span><small>SAKEFOLIO</small></div>
            </div></div>
            <div className="hero-art-caption">THE SAKE COLLECTION<br/>VOL. 01 — JAPAN</div>
          </div>
        </section>

        <section className="page-section collection-section">
          <div className="section-title-row">
            <div><SectionEyebrow>MY PERSONAL ARCHIVE</SectionEyebrow><h2>あなたの日本酒図鑑</h2>
              <p className="section-subtitle">一杯ずつ、あなたらしいコレクションを。</p></div>
            <button type="button" className="text-action" onClick={()=>goto('record')}>新しく記録 <Plus size={18}/></button>
          </div>
          <div className="stats-grid">
            <div className="stat-box"><div className="stat-icon"><BookOpen size={20}/></div><strong>{records.length}</strong><span>飲んだ記録</span></div>
            <div className="stat-box"><div className="stat-icon"><Wine size={20}/></div><strong>{new Set(records.map(r=>r.brandName)).size}</strong><span>出会った銘柄</span></div>
            <div className="stat-box"><div className="stat-icon"><MapPin size={20}/></div><strong>{prefCount}</strong><span>出会った産地</span></div>
            <div className="stat-box"><div className="stat-icon"><Star size={20}/></div><strong>{avgRating}</strong><span>平均評価</span></div>
          </div>
          <div className="subheading-row"><h3>最近の記録</h3><span>{records.length ? 'NEWEST FIRST' : 'YOUR COLLECTION STARTS HERE'}</span></div>
          {records.length ? <div className="records-grid">{records.map(r => <article className="record-card" key={r.reviewId}>
            <div className="record-media">
              {r.photoId ? <Photo token={token} photoId={r.photoId} alt={r.brandName+'のラベル'}/> : <div className="photo-fallback"><Wine size={38} strokeWidth={1.2}/></div>}
              {r.rating && <div className="rating-pill"><Star size={12} fill="currentColor"/> {r.rating}</div>}
            </div>
            <div className="record-card-body"><span className="record-date">{r.drinkingDate}</span>
              <h4>{r.brandName}</h4>
              <div className="record-type">{r.productName||r.sakeTypeOther||r.sakeType}</div>
              {(r.aromaTagIds || r.tasteTagIds || SENSORY_AXES.some(a=>r[a.key])) && <div className="record-sensory">
                {r.aromaTagIds && <span>香り：{tagLabels(r.aromaTagIds,'aroma').slice(0,3).join('・')}{selectedIds(r.aromaTagIds).length>3?'…':''}</span>}
                {r.tasteTagIds && <span>味わい：{tagLabels(r.tasteTagIds,'taste').slice(0,3).join('・')}{selectedIds(r.tasteTagIds).length>3?'…':''}</span>}
                {SENSORY_AXES.filter(a=>r[a.key]).map(a=><span key={a.key}>{a.title}：{a.options[Number(r[a.key])-1]||'未設定'}</span>)}
              </div>}
              <div className="record-place"><MapPin size={13}/>{[r.prefecture,r.municipality].filter(Boolean).join(' · ') || '産地未登録'}</div>
              <p className="record-notes">{r.notes}</p>
              <a className="record-map-link" target="_blank" rel="noopener noreferrer"
                href={breweryMapsUrl(r.breweryName,r.prefecture,r.municipality,r.breweryAddress)}>
                酒蔵をGoogleマップで探す <ExternalLink size={13}/></a>
            </div>
          </article>)}</div> : <div className="empty-state">
            <div className="empty-illustration"><FolderHeart size={37} strokeWidth={1.3}/></div>
            <h3>まだ白紙の一ページ。</h3><p>最初の一杯を記録すると、ラベルとともにここに並びます。</p>
            {!token ? <button className="button button-dark" type="button" disabled={!GOOGLE_CLIENT_ID||busy} onClick={connect}>
              <LogIn size={17}/>Google Driveに接続</button>
              : <button className="button button-dark" type="button" onClick={()=>goto('record')}>記録をはじめる <ArrowRight size={18}/></button>}
          </div>}
        </section>
        <section className="story-strip">
          <div><SectionEyebrow>FROM BOTTLE TO PLACE</SectionEyebrow><h2>味わいの向こうに、<br/>つくり手の土地がある。</h2>
          <p>酒蔵名、銘柄、純米吟醸などの商品分類、さらに市町村まで。ひとつの記録が、土地の記憶とつながります。</p>
          <button className="button button-outline" type="button" onClick={()=>goto('places')}>酒蔵を探す <ArrowRight size={17}/></button></div>
          <div className="story-art" aria-hidden="true"><div className="landscape-sun"/><div className="landscape-hill hill-back"/><div className="landscape-hill hill-front"/><div className="story-kanji">醸</div></div>
        </section>
      </>}

      {tab==='explore' && <section className="page-section interior-section">
        <div className="interior-head"><SectionEyebrow>EXPLORE JAPANESE SAKE</SectionEyebrow>
          <h1>銘柄を探す<span className="green-period">.</span></h1>
          <p>銘柄・酒蔵名・都道府県から探せます。未掲載の日本酒は記録画面で直接入力できます。</p>
        </div>
        <div className="explore-controls"><label className="search-box"><Search size={20}/><input value={search} onChange={e=>setSearch(e.target.value)}
          type="search" placeholder="例：石鎚、梅錦、愛媛県" aria-label="銘柄・酒蔵を検索"/></label>
          <select aria-label="都道府県の絞り込み" value={filterPrefecture} onChange={e=>setFilterPrefecture(e.target.value)}>
            <option value="">すべての都道府県</option>{PREFECTURES.map(p=><option key={p} value={p}>{p}</option>)}
          </select></div>
        <div className="results-note">表示 {filteredBrands.length} 件（最大48件） / <a href="https://sakenowa.com" target="_blank" rel="noopener noreferrer">さけのわデータ</a>を利用しています（3,303銘柄）＋自分の追加分</div>
        <div className="explore-grid">
          {filteredBrands.map(b=><button className="brand-tile" type="button" key={b.brandId} onClick={()=>setSelectedBrand(b)}>
            <div className="brand-tile-icon"><Wine size={24} strokeWidth={1.35}/></div><div className="brand-tile-info">
              <h3>{b.brandName}</h3><p>{b.breweryName || '酒蔵未登録'}</p><span><MapPin size={13}/>{b.prefecture || '産地未登録'}</span>
            </div><ArrowRight className="brand-tile-arrow" size={18}/></button>)}
        </div>
        {!filteredBrands.length && <div className="empty-state compact"><h3>該当する銘柄がありません</h3><p>検索条件を変えるか、手入力で新規登録してください。</p></div>}
        <button type="button" className="button button-dark extra-action" onClick={()=>{if(!pendingSave.current)setEntry(emptyEntry());goto('record');}}>掲載されていない日本酒を記録 <Plus size={17}/></button>
      </section>}

      {tab==='record' && <section className="page-section interior-section form-layout">
        <div className="interior-head"><SectionEyebrow>YOUR SAKE JOURNAL</SectionEyebrow>
          <h1>日本酒を記録する<span className="green-period">.</span></h1>
          <p>酒蔵・銘柄・商品・味わいをそれぞれ分けて保存します。分からない項目は空白のままで構いません。</p>
        </div>
        <form onSubmit={save} className="record-form">
          <fieldset disabled={busy || !!pendingSave.current} className="record-fields">
          <div className="form-block">
            <div className="form-step"><span>01</span><div><h2>どこのお酒？</h2><p>酒蔵と銘柄、産地を記録しましょう。</p></div></div>
            <div className="form-fields">
              <div className="field-inline-note"><Compass size={16}/> <span>酒蔵または銘柄を選ぶとGoogleマップが自動で検索準備されます。</span>
                <button type="button" onClick={()=>goto('explore')}>銘柄を探す <ArrowRight size={14}/></button></div>
              <div className="field-grid two">
                <div className="brewery-picker">
                  <label htmlFor="brewery-name">酒蔵名 <span className="required">必須</span>
                    <input id="brewery-name" required autoComplete="off" value={entry.breweryName}
                      onFocus={()=>setBreweryPickerOpen(true)}
                      onChange={e=>{const value=e.target.value;setEntry(v=>({...v,breweryName:value,brandId:'',prefecture:value===v.breweryName?v.prefecture:'',municipality:'',breweryAddress:''}));setBreweryPickerOpen(true);}}
                      onKeyDown={e=>{if(e.key==='Escape')setBreweryPickerOpen(false);}}
                      aria-controls="brewery-options" aria-expanded={breweryPickerOpen&&breweryMatches.length>0}
                      placeholder="酒蔵名を入力して候補を選択"/>
                  </label>
                  {breweryPickerOpen&&breweryMatches.length>0&&<div id="brewery-options" className="brewery-suggestions" role="group" aria-label="酒蔵の候補">
                    {breweryMatches.map(b=><button key={b.name+'|'+b.prefecture} type="button" onClick={()=>selectBrewery(b)}>
                      <strong>{b.name}</strong><span>{[b.prefecture,b.municipality].filter(Boolean).join('・')||'所在地未登録'}</span>
                    </button>)}
                  </div>}
                </div>
                <label>銘柄名 <span className="required">必須</span>
                  <input required value={entry.brandName} onChange={e=>setEntry(v=>({...v,brandName:e.target.value,brandId:''}))} placeholder="例：石鎚"/></label>
              </div>
              <div className="field-grid two">
                <label>都道府県 <select value={entry.prefecture} onChange={e=>update('prefecture',e.target.value)}>
                  <option value="">都道府県を選択</option>{PREFECTURES.map(p=><option key={p}>{p}</option>)}</select></label>
                <label>市町村 <input value={entry.municipality} onChange={e=>update('municipality',e.target.value)}
                  placeholder="例：西条市"/></label>
              </div>
              <label>酒蔵の住所（任意）<input value={entry.breweryAddress} onChange={e=>update('breweryAddress',e.target.value)}
                placeholder="所在地が分かる場合は住所を入力"/></label>
              {!!mapUrl&&<div className="brewery-map-panel">
                <div className="brewery-map-title"><MapPin size={19}/><div>
                  <strong>{entry.breweryName}の地図</strong>
                  <span>{[entry.prefecture,entry.municipality,entry.breweryAddress].filter(Boolean).join(' / ')||'酒蔵名から検索'}</span>
                </div></div>
                <div className="brewery-map-actions">
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={16}/>Googleマップで場所を確認<ExternalLink size={14}/></a>
                  <a href={routeUrl} target="_blank" rel="noopener noreferrer"><Compass size={16}/>経路案内<ExternalLink size={14}/></a>
                </div>
                <p>SAKEOpenDataとさけのわを蔵元名・都道府県で照合した住所を参考表示します。古い所在地や事業所住所の可能性があるため、Googleマップで確認してください。未確認の地点は自動確定しません。</p>
              </div>}
              <p className="field-help">所在地は酒蔵の所在地として記録します。お酒の製造場所や原料米の産地とは必ずしも同じではありません。</p>
            </div>
          </div>
          <div className="form-block">
            <div className="form-step"><span>02</span><div><h2>どんな日本酒？</h2><p>銘柄内の商品名と、特定名称・製法を分けます。</p></div></div>
            <div className="form-fields">
              <label>商品名・限定名 <span className="optional">自由入力</span>
                <input value={entry.productName} onChange={e=>update('productName',e.target.value)}
                  placeholder="例：緑ラベル／朝日米／秋あがり 2026"/></label>
              <label>特定名称・基本分類
                <select value={entry.sakeType} onChange={e=>update('sakeType',e.target.value)}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
              {entry.sakeType==='その他（自由記入）' && <label>分類名を入力 <span className="required">必須</span>
                <input required value={entry.sakeTypeOther} onChange={e=>update('sakeTypeOther',e.target.value)} placeholder="ラベルにある分類など"/></label>}
              <div className="field-grid two">
                <label>火入れの区分<select value={entry.heatTreatment} onChange={e=>update('heatTreatment',e.target.value)}>
                  {HEAT_TREATMENTS.map(x=><option key={x}>{x}</option>)}</select></label>
                <label>酒母・造りの方法<select value={entry.brewingMethod} onChange={e=>update('brewingMethod',e.target.value)}>
                  {METHODS.map(x=><option key={x}>{x}</option>)}</select></label>
              </div>
              <div className="group-label">製法・特徴 <span className="optional">複数選択可</span></div>
              <div className="chip-group">{STYLES.map(style => {
                const selected=entry.processingStyles.split('、').filter(Boolean);
                const active=selected.includes(style);
                return <button key={style} type="button" className={'choice-chip '+(active?'selected':'')}
                  aria-pressed={active} onClick={() => update('processingStyles',
                    (active ? selected.filter(s=>s!==style) : [...selected,style]).join('、'))}>
                  {active && <Check size={14}/>} {style}</button>;
              })}</div>
              <p className="field-help">純米吟醸などは特定名称、「生酒」「無濾過」「原酒」などは別の性質です。商品名・ラベル記載を優先し、精米歩合だけで種類を自動判定しません。</p>
              <button type="button" className="advanced-toggle" onClick={()=>setShowAdvanced(v=>!v)}
                aria-expanded={showAdvanced}>原料米・精米歩合なども記録 <ChevronDown className={showAdvanced?'rotated':''} size={18}/></button>
              {showAdvanced && <div className="field-grid two advanced-fields">
                <label>原料米<input value={entry.riceVariety} onChange={e=>update('riceVariety',e.target.value)} placeholder="山田錦など"/></label>
                <label>精米歩合（%）<input type="number" min="1" max="100" value={entry.polishingRatio}
                  onChange={e=>update('polishingRatio',e.target.value)} placeholder="60"/></label>
                <label>アルコール度数（%）<input type="number" min="0" max="100" step="0.1" value={entry.alcoholPercent}
                  onChange={e=>update('alcoholPercent',e.target.value)} placeholder="15.5"/></label>
                <label>製造年度・BY<input value={entry.vintage} onChange={e=>update('vintage',e.target.value)} placeholder="2025BY"/></label>
              </div>}
            </div>
          </div>
          <div className="form-block">
            <div className="form-step"><span>03</span><div><h2>この一杯の記憶</h2><p>写真と評価で、あなただけの図鑑に。</p></div></div>
            <div className="form-fields">
              <label className={'upload-zone '+(preview?'with-photo':'')}>
                {preview ? <img src={preview} alt="選択した写真のプレビュー"/> : <><Camera size={30} strokeWidth={1.5}/><strong>ラベルの写真を追加</strong>
                <small>タップして撮影、またはライブラリから選択（10MBまで）</small></>}
                <input type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0]||null;setPhotoBusy(!!file);setPhoto(null);setPhotoError('');setSelectedPhoto(file);}}
                  aria-label="日本酒ラベル写真を選ぶ"/>
              </label>
              {selectedPhoto && <button className="remove-photo" type="button" onClick={()=>setSelectedPhoto(null)}>写真を取り消す <X size={15}/></button>}
              {photoBusy && <p role="status">写真を確認・変換しています…</p>}
              {photoError && <p role="alert">{photoError}</p>}
              <div className="field-grid two">
                <label>飲んだ日 <span className="required">必須</span>
                  <input type="date" required value={entry.drinkingDate} onChange={e=>update('drinkingDate',e.target.value)}/></label>
                <label>評価 <span className="required">必須</span>
                  <div className="star-input" role="group" aria-label="5段階評価">
                    {[1,2,3,4,5].map(n => <button aria-label={n+'点'} aria-pressed={Number(entry.rating)===n}
                      type="button" key={n} onClick={()=>update('rating',String(n))}>
                      <Star size={27} fill={Number(entry.rating)>=n?'currentColor':'none'}/></button>)}
                  </div>
                </label>
              </div>

              <div className="sensory-panel">
                <div className="sensory-heading">
                  <div><h3>味わいのバランス</h3><p>感じた印象をタップ。わからない項目は未選択でOK。</p></div>
                </div>
                <div className="sensory-axes">
                  {SENSORY_AXES.map(axis=><div className="sensory-axis" key={axis.key}>
                    <div className="sensory-axis-heading">
                      <strong>{axis.title}</strong>
                      <span>{entry[axis.key] ? axis.options[Number(entry[axis.key])-1] : '未選択'}</span>
                    </div>
                    <div className="sensory-segments" role="group" aria-label={axis.title}>
                      {axis.options.map((option,index)=><button key={option} type="button"
                        aria-label={axis.title+'：'+option} aria-pressed={entry[axis.key]===String(index+1)}
                        className={entry[axis.key]===String(index+1)?'active':''}
                        onClick={()=>update(axis.key,entry[axis.key]===String(index+1)?'':String(index+1))}>
                        <span>{index+1}</span><small>{option}</small>
                      </button>)}
                    </div>
                  </div>)}
                </div>
                <p className="sensory-explainer">甘辛は主観的な味の印象です。日本酒度を自動判定するものではありません。選択中の項目をもう一度タップすると解除できます。</p>
              </div>

              <div className="sensory-panel">
                <div className="sensory-heading">
                  <div><h3>どんな香り？</h3><p>果物だけでなく、米・麹・乳酸・熟成の香りまで選べます。</p></div>
                  <span className="sensory-count">{selectedIds(entry.aromaTagIds).length}件選択</span>
                </div>
                <div className="sensory-subheading">よく使う香り</div>
                <div className="sensory-chip-list" role="group" aria-label="よく使う日本酒の香り">
                  {POPULAR_AROMA_IDS.map(id=>{
                    const label = AROMA_GROUPS.flatMap(g=>g.terms).find(t=>t.id===id)?.label || id;
                    const active = selectedIds(entry.aromaTagIds).includes(id);
                    return <button key={id} type="button" className={'sensory-chip '+(active?'active':'')}
                      aria-pressed={active} onClick={()=>toggleAroma(id)}>{active && <Check size={14}/>} {label}</button>;
                  })}
                </div>
                <button className="sensory-expand" type="button" aria-expanded={showAllAromas}
                  aria-controls="aroma-catalog" onClick={()=>setShowAllAromas(v=>!v)}>
                  {showAllAromas?'香りの一覧を閉じる':'香りをもっと探す（分類別）'}
                  <ChevronDown size={16} className={showAllAromas?'rotated':''}/>
                </button>
                {showAllAromas && <div id="aroma-catalog" className="aroma-catalog">
                  <label className="sensory-search">香りを検索
                    <input type="search" value={aromaSearch} onChange={e=>setAromaSearch(e.target.value)}
                      placeholder="例：洋梨、麹、ヨーグルト"/>
                  </label>
                  {AROMA_GROUPS.map(group=>{
                    const matched = group.terms.filter(term=>term.label.includes(aromaSearch.trim()) || term.id.includes(aromaSearch.trim().toLowerCase()));
                    return matched.length ? <div className="aroma-category" key={group.title}>
                      <h4>{group.title}</h4>
                      <p>{group.hint}</p>
                      <div className="sensory-chip-list">
                        {matched.map(term=>{
                          const active = selectedIds(entry.aromaTagIds).includes(term.id);
                          return <button type="button" key={term.id} className={'sensory-chip '+(active?'active':'')}
                            aria-pressed={active} onClick={()=>toggleAroma(term.id)}>
                            {active && <Check size={14}/>} {term.label}
                          </button>;
                        })}
                      </div>
                    </div> : null;
                  })}
                  {!AROMA_GROUPS.some(g=>g.terms.some(t=>t.label.includes(aromaSearch.trim()) || t.id.includes(aromaSearch.trim().toLowerCase()))) &&
                    <p className="sensory-no-results">一致する香りがありません。自由メモに記入できます。</p>}
                </div>}
                {!!entry.aromaTagIds && <div className="sensory-summary"><strong>選んだ香り</strong><span>{tagLabels(entry.aromaTagIds,'aroma').join(' ／ ')}</span></div>}
                <p className="sensory-explainer">香りの表現は「〜のような香り」という比喩です。実際に果物や乳製品が入っている意味ではありません。</p>
              </div>

              <div className="sensory-panel">
                <div className="sensory-heading">
                  <div><h3>味わい・口当たりの特徴</h3><p>印象に残った言葉をいくつでも選べます。</p></div>
                  <span className="sensory-count">{selectedIds(entry.tasteTagIds).length}件選択</span>
                </div>
                {TASTE_GROUPS.map(group=><div key={group.title} className="taste-category">
                  <div className="sensory-subheading">{group.title}</div>
                  <div className="sensory-chip-list" role="group" aria-label={group.title}>
                    {group.terms.map(term=>{
                      const active = selectedIds(entry.tasteTagIds).includes(term.id);
                      return <button key={term.id} type="button" className={'sensory-chip '+(active?'active':'')}
                        aria-pressed={active} onClick={()=>toggleTaste(term.id)}>
                        {active && <Check size={14}/>} {term.label}
                      </button>;
                    })}
                  </div>
                </div>)}
              </div>
              <label>自由メモ・感想 <span className="optional">任意</span>
                <textarea rows={4} value={entry.notes} onChange={e=>update('notes',e.target.value)}
                  placeholder="香り、口当たり、一緒に食べたもの、その日の思い出など"/></label>
            </div>
          </div>
          </fieldset>
          <div className="save-area">
            <div className="save-security"><ShieldCheck size={19}/>
              <span>{token ? accountEmail+' のGoogle Drive / Sheetsに保存します。' : 'Google接続後に、ご本人のDriveへ保存します。'}</span></div>
            {token ? <button disabled={busy||photoBusy||!!photoError} type="submit" className="button button-dark button-save">
              {busy?'保存・再取得を確認しています…':pendingSave.current?'同じ記録の保存を再確認・再開':'この一杯を記録する'} <ArrowRight size={19}/></button>
              : <button disabled={busy||!GOOGLE_CLIENT_ID} type="button" onClick={connect} className="button button-dark button-save">
                <LogIn size={18}/> Googleに接続してから保存</button>}
          </div>
        </form>
      </section>}

      {tab==='places' && <section className="page-section interior-section">
        <div className="interior-head"><SectionEyebrow>ORIGIN & TERROIR</SectionEyebrow>
          <h1>私の日本酒地図<span className="green-period">.</span></h1>
          <p>飲んだ日本酒と、その酒を造った蔵元の場所を結びます。地図のピンからラベル写真・評価・味わいの記録を振り返れます。</p>
        </div>
        {coordinateStatus==='loading'&&<p className="sake-atlas__loading" role="status">酒蔵の位置情報を読み込んでいます。</p>}
        {coordinateStatus==='error'&&<p className="sake-atlas__warning" role="alert">酒蔵の位置データを読み込めませんでした。酒蔵名からのGoogleマップ検索は利用できます。</p>}
        <BreweryMap records={records} locations={breweryCoordinates}
          renderPhoto={r=><Photo token={token} photoId={r.photoId} alt={r.brandName+'のラベル写真'}/>}
          onRecordBrewery={g=>{
            selectBrewery({name:g.breweryName,prefecture:g.prefecture,
              municipality:'',address:g.address||g.coordinate?.address||'',count:0});
            goto('record');
          }}
          onExplore={()=>goto('explore')}/>
      </section>}
    </main>

    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand"><span className="logo-text">Sakefolio<span className="logo-dot">.</span></span><p>一杯を、忘れない。</p></div>
        <div className="footer-right"><span><ShieldCheck size={15}/> 記録はあなたのGoogle Driveへ</span>
          <a href="https://sakenowa.com" target="_blank" rel="noopener noreferrer">銘柄データ提供：さけのわ <ExternalLink size={12}/></a></div>
      </div>
    </footer>
    <nav className="mobile-nav" aria-label="モバイルナビゲーション">
      {navigation.map(n=> <button key={n.tab} onClick={()=>goto(n.tab)} type="button"
        aria-current={tab===n.tab?'page':undefined} className={tab===n.tab?'active':''}>
        <n.icon size={20} strokeWidth={tab===n.tab?2.4:1.9}/><span>{n.title}</span></button>)}
    </nav>
  </div>;
}
