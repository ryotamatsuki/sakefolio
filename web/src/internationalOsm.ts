/** OpenStreetMap facilities are ODbL and intentionally separate from CC0 Wikidata items. */
export type OsmFacilityKind='beer'|'wine'|'unclassified';
export interface OsmFacility {
 id:string;name:string;kind:OsmFacilityKind;craft:string;lat:number;lon:number;
 precision:'node'|'geometry_center';source:string;operator:string;address:string;
}
export interface ChinaOsmSnapshot {
 format:'sakefolio-china-osm-facilities-v1';generatedAt:string;license:'ODbL';rows:OsmFacility[];
}
export const EMPTY_CHINA_OSM:ChinaOsmSnapshot={format:'sakefolio-china-osm-facilities-v1',generatedAt:'',license:'ODbL',rows:[]};
const validPoint=(lat:number,lon:number)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=18&&lat<=54&&lon>=73&&lon<=136;
const text=(s:unknown,max=200)=>typeof s==='string'?s.trim().slice(0,max):'';
export function normalizeOsmSnapshot(input:unknown):ChinaOsmSnapshot{
 if(!input||typeof input!=='object'||Array.isArray(input))return EMPTY_CHINA_OSM;
 const data=input as Record<string,unknown>;
 if(data.format!=='sakefolio-china-osm-facilities-v1'||!Array.isArray(data.rows)||data.rows.length>4000)
   return EMPTY_CHINA_OSM;
 const rows:OsmFacility[]=[],seen=new Set<string>();
 for(const raw of data.rows){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const r=raw as Record<string,unknown>,id=text(r.id,60);
  const match=/^(node|way|relation)\/(\d{1,16})$/.exec(id);
  const name=text(r.name),craft=text(r.craft),kind=r.kind;
  const lat=Number(r.lat),lon=Number(r.lon);
  if(!match||!name||seen.has(id)||!validPoint(lat,lon)||!['brewery','winery','distillery'].includes(craft)||
     !['beer','wine','unclassified'].includes(String(kind)))continue;
  if((craft==='brewery'&&kind!=='beer')||(craft==='winery'&&kind!=='wine')||
    (craft==='distillery'&&kind!=='unclassified'))continue;
  const precision=match[1]==='node'?'node':'geometry_center';
  rows.push({id,name,craft,kind:kind as OsmFacilityKind,lat,lon,precision,
   source:'https://www.openstreetmap.org/'+id,operator:text(r.operator),address:text(r.address,500)});
  seen.add(id);
 }
 return {format:'sakefolio-china-osm-facilities-v1',license:'ODbL',
  generatedAt:text(data.generatedAt,35),rows};
}
export function normalizeOverpass(data:unknown):ChinaOsmSnapshot {
 if(!data||typeof data!=='object'||Array.isArray(data))return EMPTY_CHINA_OSM;
 const raw=(data as Record<string,unknown>).elements;if(!Array.isArray(raw))return EMPTY_CHINA_OSM;
 const rows=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const r=item as Record<string,unknown>,tags=r.tags;
  if(!tags||typeof tags!=='object'||Array.isArray(tags))continue;
  const t=tags as Record<string,unknown>;
  const type=r.type;
  if(!['node','way','relation'].includes(String(type))||!Number.isSafeInteger(r.id))continue;
  const craft=text(t.craft)||text(t.industrial);
  const name=text(t['name:zh'])||text(t.name);
  const center=r.center&&typeof r.center==='object'&&!Array.isArray(r.center)?r.center as Record<string,unknown>:null;
  const lat=typeof r.lat==='number'?r.lat:Number(center?.lat),lon=typeof r.lon==='number'?r.lon:Number(center?.lon);
  if(!name||!validPoint(lat,lon))continue;
  rows.push({id:type+'/'+r.id,name,craft,kind:craft==='brewery'?'beer':craft==='winery'?'wine':'unclassified',
    lat,lon,source:'https://www.openstreetmap.org/'+type+'/'+r.id,
    operator:text(t.operator),address:[text(t['addr:province']),text(t['addr:city']),text(t['addr:street'])].filter(Boolean).join(' ')}); 
 }
 return normalizeOsmSnapshot({format:'sakefolio-china-osm-facilities-v1',
  generatedAt:new Date().toISOString(),license:'ODbL',rows});
}
