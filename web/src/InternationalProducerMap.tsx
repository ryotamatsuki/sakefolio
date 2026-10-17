import {useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,WheelEvent as ReactWheelEvent} from 'react';
import {Compass,ExternalLink,MapPin,Search} from 'lucide-react';
import {project,unproject,fitBreweryLocations} from './breweryMapModel.ts';
import type {ChinaMasterRow} from './internationalMaster';
import {mapProducers} from './internationalMaster';
import type {InternationalRecord} from './internationalLocal';
import type {BeverageKind} from './internationalCatalog';
import {KIND_NAME} from './internationalCatalog';

interface Props {master:ChinaMasterRow[];records:InternationalRecord[];onRecordSelect:(id:string)=>void}
type View={lat:number;lon:number;zoom:number};
const TILE=256,range=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x));
const initial:View={lat:35.5,lon:104,zoom:4};
const TILE_DOMAIN='https://tile.openstreetmap.org/';
const osmSearch=(name:string)=>'https://www.openstreetmap.org/search?query='+encodeURIComponent(name+' 中国');
export default function InternationalProducerMap({master,records,onRecordSelect}:Props){
 const locations=useMemo(()=>mapProducers(master),[master]);
 const [kind,setKind]=useState<'all'|BeverageKind>('all');
 const [query,setQuery]=useState('');
 const points=useMemo(()=>locations.filter(p=>(kind==='all'||p.kind===kind)&&
    (!query.trim()||[p.name,p.description].some(s=>s.toLowerCase().includes(query.trim().toLowerCase())))),[locations,kind,query]);
 const [selected,setSelected]=useState('');
 const [view,setView]=useState<View>(initial);
 const [size,setSize]=useState({width:800,height:455});
 const surface=useRef<HTMLDivElement|null>(null);
 const drag=useRef<{pointer:number;x:number;y:number;view:View}|null>(null);
 useEffect(()=>{
   const el=surface.current;if(!el)return;
   const measure=()=>{const width=el.clientWidth||800,height=el.clientHeight||455;
     setSize(s=>s.width===width&&s.height===height?s:{width,height});};
   measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
 },[]);
 const boundsKey=points.map(p=>p.id).join(',');
 useEffect(()=>{
   if(!points.length){setView(initial);return;}
   const fit=fitBreweryLocations(points.map(p=>({lat:p.lat!,lon:p.lon!,breweryName:p.name,prefecture:'中国',precision:'lot_or_address'})),size.width,size.height);
   setView({lat:fit.lat,lon:fit.lon,zoom:Math.min(9,fit.zoom)});
 },[boundsKey,size.width,size.height]);
 const center=project(view.lat,view.lon,view.zoom),world=TILE*Math.pow(2,view.zoom);
 const tiles=useMemo(()=>{
   const left=center.x-size.width/2,top=center.y-size.height/2;
   const items:{x:number;y:number;tx:number;ty:number;key:string}[]=[];
   for(let i=Math.floor(left/TILE);i<=Math.floor((left+size.width)/TILE);i++)
    for(let j=Math.max(0,Math.floor(top/TILE));j<=Math.min(2**view.zoom-1,Math.floor((top+size.height)/TILE));j++)
     items.push({x:i*TILE-left,y:j*TILE-top,tx:((i%(2**view.zoom))+2**view.zoom)%2**view.zoom,ty:j,key:view.zoom+'/'+i+'/'+j});
   return items;
 },[view.lat,view.lon,view.zoom,size.width,size.height]);
 const match=(p:ChinaMasterRow)=>records.filter(r=>r.attributes.producerQid===p.id);
 const chosen=points.find(p=>p.id===selected)||null;
 const withoutMap=records.filter(r=>!r.attributes.producerQid||
   !locations.some(p=>p.id===r.attributes.producerQid));
 const zoom=(d:number)=>setView(v=>({...v,zoom:range(v.zoom+d,3,14)}));
 const pointerDown=(e:ReactPointerEvent<HTMLDivElement>)=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,view};
   e.currentTarget.setPointerCapture(e.pointerId);
 };
 const pointerMove=(e:ReactPointerEvent<HTMLDivElement>)=>{
   const start=drag.current;if(start?.pointer!==e.pointerId)return;
   const p=project(start.view.lat,start.view.lon,start.view.zoom);
   const pos=unproject(p.x-(e.clientX-start.x),p.y-(e.clientY-start.y),start.view.zoom);
   setView({...pos,zoom:start.view.zoom});
 };
 const pointerEnd=(e:ReactPointerEvent<HTMLDivElement>)=>{
   if(drag.current?.pointer===e.pointerId)drag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 return <section className="international-map">
   <div className="international-feature-head">
     <div><span className="taste-eyebrow">CHINA ORIGIN ATLAS</span><h2>中国のお酒の産地マップ</h2>
       <p>Wikidataで座標が登録されているメーカー・醸造所を表示します。会社所在地の座標である場合があり、工場入口や仕込み場所を確認した位置とは限りません。</p></div>
     <div className="international-feature-stats"><strong>{points.length}</strong><span>座標付き候補</span></div>
   </div>
   <div className="international-map-toolbar">
     <label><Search size={16}/><input type="search" placeholder="メーカー・醸造所を探す"
        value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <select aria-label="地図の酒類を絞る" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setSelected('');}}>
       <option value="all">すべて</option>{(['baijiu','huangjiu','beer','wine'] as const).map(k=><option key={k} value={k}>{KIND_NAME(k)}</option>)}
     </select>
   </div>
   <div ref={surface} className="international-map-surface" role="region" aria-label="Wikidata座標を用いた中国酒メーカーの地図">
     <div className="international-map-pan" onPointerDown={pointerDown} onPointerMove={pointerMove}
       onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onWheel={(e:ReactWheelEvent<HTMLDivElement>)=>{e.preventDefault();zoom(e.deltaY<0?1:-1);}}>
       {tiles.map(t=><img alt="" draggable={false} key={t.key} className="international-map-tile" width="256" height="256"
         src={TILE_DOMAIN+view.zoom+'/'+t.tx+'/'+t.ty+'.png'} style={{transform:'translate3d('+Math.round(t.x)+'px,'+Math.round(t.y)+'px,0)'}}/>)}
       {points.map(p=>{
         const pos=project(p.lat!,p.lon!,view.zoom);
         let delta=pos.x-center.x;
         if(delta>world/2)delta-=world;if(delta< -world/2)delta+=world;
         const left=delta+size.width/2,top=pos.y-center.y+size.height/2;
         if(left< -20||left>size.width+20||top< -20||top>size.height+20)return null;
         const count=match(p).length;
         return <button type="button" key={p.id} className={'international-map-point '+(count?'has-memory ':'')+(p.id===selected?'active':'')}
           title={p.name+'（Wikidata登録座標・施設位置の保証なし）'} aria-label={p.name+'、記録'+count+'件'} aria-pressed={p.id===selected}
           style={{left,top}} onPointerDown={e=>e.stopPropagation()} onClick={()=>setSelected(p.id)}>
           {count||'•'}</button>;
       })}
     </div>
     <div className="international-map-controls">
       <button type="button" aria-label="拡大" onClick={()=>zoom(1)}>＋</button>
       <button type="button" aria-label="縮小" onClick={()=>zoom(-1)}>－</button>
       <button type="button" aria-label="全体を表示" onClick={()=>{
         setQuery('');setKind('all');setSelected('');
       }}><Compass size={17}/></button>
     </div>
     {!points.length&&<div className="international-map-empty">
       <MapPin size={28}/><strong>座標付きメーカーがありません</strong>
       <p>実際のWikidataから位置情報を取得できるまで、地図に推測のピンは置きません。</p>
     </div>}
     <div className="international-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div>
   </div>
   <div className="international-map-results">
     <div className="international-map-locations"><h3>出典付きの位置情報</h3>
       {points.length?points.slice(0,250).map(p=><button type="button" key={p.id} onClick={()=>{
         setSelected(p.id);setView(v=>({...v,lat:p.lat!,lon:p.lon!,zoom:Math.max(9,v.zoom)}));
       }} className={p.id===selected?'active':''}>
         <span><strong>{p.name}</strong><small>{KIND_NAME(p.kind)} · 記録 {match(p).length}件</small></span>
         <MapPin size={17}/></button>):<p>確認できる施設座標はありません。</p>}
       {points.length>250&&<p>表示は250件まで。名称で絞り込んでください。</p>}
     </div>
     <div className="international-map-detail">
       {chosen?<><h3>{chosen.name}</h3>
           <p>{chosen.description||'説明未登録'} · {KIND_NAME(chosen.kind)}</p>
           <p className="international-location-warning">Wikidataのこのエンティティに登録された座標です。製造工場の位置が個別に現地確認されているわけではありません。</p>
           <a href={chosen.source} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Wikidata原典を確認</a>
           <a href={osmSearch(chosen.name)} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> OpenStreetMapで照合</a>
           <h4>このメーカーに紐づく自分の記録</h4>
           {match(chosen).length?match(chosen).map(r=><button key={r.id} onClick={()=>onRecordSelect(r.id)} type="button">{r.productName} — {r.experience==='tasted'?'★'+(r.rating||'未評価'):'商品登録のみ'} →</button>):
             <p>このメーカーQ-IDに紐づく記録はありません。記録時にWikidataの候補を選択すると正確に照合できます。</p>}
         </>:<><h3>地図上のメーカーを選択</h3><p>地図のピンか左のメーカーをタップすると、出典と自分の記録を確認できます。</p></>}
     </div>
   </div>
   {!!withoutMap.length&&<div className="international-unlocated">
     <h3>所在地を特定できない記録：{withoutMap.length}件</h3>
     <p>正確なWikidata Q-IDと座標が一致しない記録にはピンを置きません。</p>
     {withoutMap.slice(0,40).map(r=><button type="button" key={r.id} onClick={()=>onRecordSelect(r.id)}>
       {r.productName} · {r.producer||r.brandName} →</button>)}
   </div>}
   <p className="international-map-disclaimer">背景地図のタイルはOpenStreetMapから取得します。中国本土からの到達性は未検証です。あなたの写真・コメント・評価はタイル配信先へ送信しません。Wikidataの座標と実際の製造所を同一と推定していません。</p>
 </section>;
}
