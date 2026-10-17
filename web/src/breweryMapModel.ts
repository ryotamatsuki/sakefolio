import type { RecordEntry } from './types';

export interface BreweryCoordinate {
  breweryName: string;
  prefecture: string;
  address?: string;
  lat: number;
  lon: number;
  precision: string;
  source?: string;
  verification?: { sourceUrl?: string; checkedAt?: string };
}
export interface BreweryHistory {
  key: string;
  breweryName: string;
  prefecture: string;
  address: string;
  records: RecordEntry[];
  coordinate: BreweryCoordinate | null;
}
export const breweryKey = (name: string, prefecture: string): string =>
  name.trim().normalize('NFKC').replace(/[\s\u3000]+/g, '') + '|' + prefecture.trim().normalize('NFKC');

export const validCoordinate = (c: BreweryCoordinate): boolean =>
  Number.isFinite(c.lat) && Number.isFinite(c.lon) &&
  c.lat >= -85 && c.lat <= 85 && c.lon >= -180 && c.lon <= 180 &&
  ['facility_osm_verified', 'lot_or_address', 'town_approximate'].includes(c.precision);

export function collectBreweryHistory(records: RecordEntry[], coords: BreweryCoordinate[]) {
  const locations = new Map<string, BreweryCoordinate>();
  const duplicateKeys = new Set<string>();
  for (const c of coords) {
    if (!c.breweryName || !c.prefecture || !validCoordinate(c)) continue;
    const key = breweryKey(c.breweryName, c.prefecture);
    if (locations.has(key)) duplicateKeys.add(key);
    else locations.set(key, c);
  }
  for (const k of duplicateKeys) locations.delete(k); // Conflicts must never silently choose a pin.
  const groups = new Map<string, BreweryHistory>();
  for (const r of records) {
    if (!r.breweryName?.trim()) continue;
    const key = breweryKey(r.breweryName, r.prefecture || '');
    const found = groups.get(key);
    if (found) found.records.push(r);
    else groups.set(key, {
      key, breweryName:r.breweryName, prefecture:r.prefecture,
      address:r.breweryAddress || '', records:[r], coordinate:locations.get(key) || null
    });
  }
  const sorted = [...groups.values()].map(g=>({
    ...g, records:[...g.records].sort((a,b) => b.drinkingDate.localeCompare(a.drinkingDate) ||
      b.createdAt.localeCompare(a.createdAt))
  })).sort((a,b)=>a.prefecture.localeCompare(b.prefecture,'ja') ||
    a.breweryName.localeCompare(b.breweryName,'ja'));
  return {
    mapped:sorted.filter(g=>g.coordinate!==null),
    unmapped:sorted.filter(g=>g.coordinate===null),
    totalBreweries:sorted.length,
    mappedRecords:sorted.filter(g=>g.coordinate!==null).reduce((n,g)=>n+g.records.length,0)
  };
}

export function precisionText(value:string):string {
  if (value==='facility_osm_verified') return '施設の位置を資料照合';
  if (value==='lot_or_address') return '地番・住所の代表点（建物未確認）';
  if (value==='town_approximate') return '町丁目の参考位置（酒蔵の位置ではありません）';
  return '位置未確認';
}

const MAX_LAT=85.05112878;
export function project(lat:number, lon:number, zoom:number) {
  const size = 256 * Math.pow(2,zoom);
  const phi = Math.min(MAX_LAT,Math.max(-MAX_LAT,lat))*Math.PI/180;
  return {x:(lon+180)/360*size,
    y:(1-Math.log(Math.tan(phi)+1/Math.cos(phi))/Math.PI)/2*size};
}
export function unproject(x:number,y:number,zoom:number) {
  const size=256*Math.pow(2,zoom);
  const normalizedY=Math.max(0,Math.min(size,y));
  return {lat:Math.atan(Math.sinh(Math.PI*(1-2*normalizedY/size)))*180/Math.PI,
    lon:((x/size*360)%360+360)%360-180};
}
export function fitBreweryLocations(points: BreweryCoordinate[],width:number,height:number) {
  if (!points.length) return {lat:36.3,lon:138.2,zoom:5};
  if (points.length===1) return {lat:points[0].lat,lon:points[0].lon,zoom:11};
  const padding=95;
  for (let z=12;z>=3;z--) {
    const p=points.map(x=>project(x.lat,x.lon,z));
    const xs=p.map(x=>x.x),ys=p.map(x=>x.y);
    const w=Math.max(...xs)-Math.min(...xs);
    const h=Math.max(...ys)-Math.min(...ys);
    if (w<=Math.max(120,width-padding)&&h<=Math.max(120,height-padding)) {
      const m=unproject((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,z);
      return {...m,zoom:z};
    }
  }
  return {lat:36.3,lon:138.2,zoom:3};
}
