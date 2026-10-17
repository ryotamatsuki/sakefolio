import {useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,ReactNode,WheelEvent as ReactWheelEvent} from 'react';
import type {RecordEntry} from './types';
import type {BreweryCoordinate,BreweryHistory} from './breweryMapModel';
import {collectBreweryHistory,fitBreweryLocations,precisionText,project,unproject} from './breweryMapModel';
import {breweryDirectionsUrl,breweryMapsUrl} from './catalog';

interface Props {
  records:RecordEntry[];
  locations:BreweryCoordinate[];
  renderPhoto:(record:RecordEntry)=>ReactNode;
  onRecordBrewery:(brewery:BreweryHistory)=>void;
  onExplore:()=>void;
}
type View={lat:number;lon:number;zoom:number};
const TILE_SIZE=256;
const clampZoom=(z:number)=>Math.max(3,Math.min(15,z));
const isDemoRecord=(r:RecordEntry)=>r.reviewId.startsWith('sakefolio-demo-') || r.productName.startsWith('DEBUG-') || r.notes?.startsWith('React版の保存テスト') || r.notes?.startsWith('React版JPEG保存テスト');

export default function BreweryMap({records,locations,renderPhoto,onRecordBrewery,onExplore}:Props) {
  const [includeDemo,setIncludeDemo]=useState(true);
  const demoCount=useMemo(()=>records.filter(isDemoRecord).length,[records]);
  const visibleRecords=useMemo(()=>includeDemo?records:records.filter(r=>!isDemoRecord(r)),[records,includeDemo]);
  const history=useMemo(()=>collectBreweryHistory(visibleRecords,locations),[visibleRecords,locations]);
  const mapRef=useRef<HTMLDivElement>(null);
  const gesture=useRef<{id:number;x:number;y:number;view:View}|null>(null);
  const [size,setSize]=useState({width:760,height:440});
  const [view,setView]=useState<View>({lat:36.3,lon:138.2,zoom:5});
  const [selectedKey,setSelectedKey]=useState('');
  const mapped=history.mapped;
  const mappedKey=mapped.map(g=>g.key+':'+g.coordinate?.lat+':'+g.coordinate?.lon).join(';');

  useEffect(()=>{
    const element=mapRef.current;
    if(!element)return;
    const update=()=>setSize(s=>{
      const next={width:element.clientWidth||760,height:element.clientHeight||440};
      return s.width===next.width&&s.height===next.height?s:next;
    });
    update();
    const observer=new ResizeObserver(update);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    setView(fitBreweryLocations(mapped.map(g=>g.coordinate!),size.width,size.height));
  },[mappedKey,size.width,size.height]);
  const selected=history.mapped.find(g=>g.key===selectedKey) ||
    history.unmapped.find(g=>g.key===selectedKey) || mapped[0] || history.unmapped[0] || null;
  const center=project(view.lat,view.lon,view.zoom);
  const world=TILE_SIZE*Math.pow(2,view.zoom);
  const tiles=useMemo(()=>{
    const output:{x:number;y:number;tileX:number;tileY:number;key:string}[]=[];
    const left=center.x-size.width/2,top=center.y-size.height/2;
    const minX=Math.floor(left/TILE_SIZE),maxX=Math.floor((left+size.width)/TILE_SIZE);
    const minY=Math.max(0,Math.floor(top/TILE_SIZE));
    const maxY=Math.min(Math.pow(2,view.zoom)-1,Math.floor((top+size.height)/TILE_SIZE));
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
      const normalized=((x%Math.pow(2,view.zoom))+Math.pow(2,view.zoom))%Math.pow(2,view.zoom);
      output.push({x:x*TILE_SIZE-left,y:y*TILE_SIZE-top,tileX:normalized,tileY:y,
        key:view.zoom+'/'+x+'/'+y});
    }
    return output;
  },[view.lat,view.lon,view.zoom,size.width,size.height]);
  const shift=(x:number,y:number,start:View):View=>{
    const p=project(start.lat,start.lon,start.zoom);
    return {...unproject(p.x-x,p.y-y,start.zoom),zoom:start.zoom};
  };
  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,view};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const s=gesture.current;
    if(!s||s.id!==event.pointerId)return;
    setView(shift(event.clientX-s.x,event.clientY-s.y,s.view));
  };
  const onPointerEnd=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(gesture.current?.id===event.pointerId)gesture.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const changeZoom=(delta:number)=>setView(v=>({...v,zoom:clampZoom(v.zoom+delta)}));
  const onWheel=(event:ReactWheelEvent<HTMLDivElement>)=>{
    event.preventDefault();
    changeZoom(event.deltaY<0?1:-1);
  };
  const select=(g:BreweryHistory)=>{
    setSelectedKey(g.key);
  };
  const reset=()=>setView(fitBreweryLocations(mapped.map(g=>g.coordinate!),size.width,size.height));

  return <div className="sake-atlas">
    <div className="sake-atlas__intro">
      <div>
        <span className="sake-atlas__eyebrow">YOUR PRIVATE SAKE ATLAS</span>
        <h2>飲んだ日本酒が、地図になる。</h2>
        <p>蔵元の場所から、ラベル写真とその日の味わいを振り返る。地図にはあなた自身の飲酒記録がある酒蔵だけを表示します。</p>
      </div>
      <div className="sake-atlas__summary" aria-label="地図の記録状況">
        <strong>{history.totalBreweries}<small>蔵</small></strong>
        <span>記録した酒蔵</span>
        <strong>{mapped.length}<small>蔵</small></strong>
        <span>地図に表示</span>
      </div>
    </div>
    {!!demoCount&&<label className="sake-atlas__demo-toggle">
      <input type="checkbox" checked={includeDemo} onChange={e=>setIncludeDemo(e.target.checked)}/>
      <span>テスト記録 {demoCount}件を表示する</span>
      <small>実際に飲んだ記録ではありません。後で非表示にできます。</small>
    </label>}
    <div className="sake-atlas__map" ref={mapRef} role="region" aria-label="飲んだ日本酒の酒蔵マップ。地図をドラッグして移動、拡大縮小ボタンでズーム">
      <div className="sake-atlas__surface" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={onWheel}>
        {tiles.map(tile=><img key={tile.key} className="sake-atlas__tile"
          src={`https://tile.openstreetmap.org/${view.zoom}/${tile.tileX}/${tile.tileY}.png`}
          style={{transform:`translate3d(${Math.round(tile.x)}px,${Math.round(tile.y)}px,0)`}}
          width="256" height="256" alt="" draggable={false}/>)}
        {mapped.map(g=>{
          const coordinate=g.coordinate!;
          const p=project(coordinate.lat,coordinate.lon,view.zoom);
          let dx=p.x-center.x;
          if(dx>world/2)dx-=world;
          else if(dx < -world/2)dx+=world;
          const px=dx+size.width/2,py=p.y-center.y+size.height/2;
          if(px < -25||px > size.width+25||py < -25||py > size.height+25)return null;
          const approx=coordinate.precision==='town_approximate';
          const verified=coordinate.precision==='facility_osm_verified';
          const demoOnly=g.records.every(isDemoRecord);
          return <button type="button" key={g.key}
            className={'sake-atlas__marker'+(approx?' approximate':verified?' verified':' address')+(selected?.key===g.key?' active':'')+(demoOnly?' demo':'')}
            style={{left:px,top:py}} aria-pressed={selected?.key===g.key}
            aria-label={g.breweryName+'、'+(demoOnly?'テスト記録':'飲酒記録')+g.records.length+'件、'+precisionText(coordinate.precision)}
            title={g.breweryName+'：'+precisionText(coordinate.precision)}
            onPointerDown={e=>e.stopPropagation()} onClick={()=>select(g)}>
            <span>{g.records.length}</span>
          </button>;
        })}
      </div>
      <div className="sake-atlas__controls" aria-label="地図の操作">
        <button type="button" aria-label="地図を拡大" onClick={()=>changeZoom(1)}>＋</button>
        <button type="button" aria-label="地図を縮小" onClick={()=>changeZoom(-1)}>－</button>
        <button type="button" aria-label="すべての酒蔵を表示" onClick={reset}>全体</button>
      </div>
      {!mapped.length && <div className="sake-atlas__no-markers">
        <strong>あなたの日本酒地図は、ここから。</strong>
        <p>{visibleRecords.length?'記録した酒蔵に表示できる座標がありません。住所検索から確認できます。':'表示対象の記録がありません。テスト記録を表示するか、最初の一杯を記録してください。'}</p>
        <button type="button" onClick={onExplore}>日本酒を探す</button>
      </div>}
      <div className="sake-atlas__attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
          onPointerDown={e=>e.stopPropagation()}>© OpenStreetMap contributors</a>
      </div>
    </div>
    <div className="sake-atlas__legend" aria-label="地図上の位置精度">
      <span><i className="sake-atlas__legend-dot verified"/>施設を資料照合</span>
      <span><i className="sake-atlas__legend-dot address"/>住所・地番の代表点</span>
      <span><i className="sake-atlas__legend-dot approximate"/>町丁目の参考位置</span>
      <span><i className="sake-atlas__legend-dot demo"/>テスト記録のみ</span>
    </div>
    <div className="sake-atlas__details">
      <div className="sake-atlas__places">
        <h3>あなたが飲んだ酒蔵</h3>
        {history.totalBreweries
          ? [...mapped,...history.unmapped].map(g=><button className={'sake-atlas__place'+(selected?.key===g.key?' active':'')}
              type="button" key={g.key} onClick={()=>{
                select(g);
                if(g.coordinate)setView(v=>({...v,lat:g.coordinate!.lat,lon:g.coordinate!.lon,
                  zoom:g.coordinate!.precision==='town_approximate'?Math.min(v.zoom,8):Math.max(v.zoom,10)}));
              }}>
              <span><strong>{g.breweryName}</strong><small>{g.prefecture} · 記録 {g.records.length}件</small></span>
              <em>{g.records.every(isDemoRecord)?'テスト':g.coordinate?(g.coordinate.precision==='town_approximate'?'参考位置':'地図あり'):'位置未確認'}</em>
            </button>)
          : <p className="sake-atlas__empty-list">まずは一杯を記録してください。</p>}
      </div>
      <div className="sake-atlas__memory">
        {selected?<div>
          <div className="sake-atlas__memory-header">
            <span className="sake-atlas__eyebrow">BREWERY MEMORY</span>
            <h3>{selected.breweryName}</h3>
            <p>{[selected.prefecture,selected.address||selected.coordinate?.address].filter(Boolean).join(' · ')}</p>
            {selected.records.every(isDemoRecord)&&<span className="sake-atlas__demo-note">テスト記録：実際に飲んだ履歴ではありません</span>}
            <span className="sake-atlas__precision">{selected.coordinate
              ?precisionText(selected.coordinate.precision):'位置未確認：地図に推測のピンは表示しません'}</span>
          </div>
          <div className="sake-atlas__memory-actions">
            <a href={breweryMapsUrl(selected.breweryName,selected.prefecture,'',selected.address||selected.coordinate?.address||'')}
              target="_blank" rel="noopener noreferrer">Googleマップで確認 ↗</a>
            <a href={breweryDirectionsUrl(selected.breweryName,selected.prefecture,'',selected.address||selected.coordinate?.address||'')}
              target="_blank" rel="noopener noreferrer">経路を探す ↗</a>
            <button type="button" onClick={()=>onRecordBrewery(selected)}>この酒蔵を再記録 ＋</button>
          </div>
          <h4>ここで造られたお酒の記憶 · {selected.records.length}件</h4>
          <div className="sake-atlas__memories">
            {selected.records.map(r=><article className="sake-atlas__memory-card" key={r.reviewId}>
              <div className="sake-atlas__memory-photo">{r.photoId?renderPhoto(r):<span>写真なし</span>}</div>
              <div>
                <time dateTime={r.drinkingDate}>{r.drinkingDate}{isDemoRecord(r)?' · DEMO':''}</time>
                <strong>{r.brandName}{r.productName?' · '+r.productName:''}</strong>
                <span>{r.rating?'★ '+r.rating+' / 5':''}{r.sakeType?' · '+r.sakeType:''}</span>
                {r.notes&&<p>{r.notes}</p>}
              </div>
            </article>)}
          </div>
        </div>:<div className="sake-atlas__empty-memory">酒蔵を選ぶと、写真と飲酒記録が表示されます。</div>}
      </div>
    </div>
    {!!history.unmapped.length&&<p className="sake-atlas__warning">
      {history.unmapped.length}蔵は信頼できる座標がないため、推測のピンを表示していません。酒蔵リストから住所検索できます。
    </p>}
    <p className="sake-atlas__footnote">
      地図の点は醸造所の建物・入口を保証しません。町丁目の点は所在地の参考で、現地訪問したことも意味しません。
      地図の背景タイルのみOpenStreetMapから取得し、写真・評価・飲酒記録は本人のGoogle Driveに保存します。
    </p>
  </div>;
}
