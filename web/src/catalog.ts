import type { Brand } from './types';

export const TYPES = [
  '純米酒', '特別純米酒', '純米吟醸酒', '純米大吟醸酒',
  '吟醸酒', '大吟醸酒', '本醸造酒', '特別本醸造酒',
  '普通酒（特定名称酒以外）', '特定名称の表示なし・不明', 'その他（自由記入）'
] as const;
export const HEAT_TREATMENTS = ['不明・記載なし', '生酒', '生貯蔵酒', '生詰酒', '火入れ', 'その他'] as const;
export const METHODS = ['不明・記載なし', '速醸', '生酛', '山廃', 'その他'] as const;
export const STYLES = [
  '無濾過', '原酒', 'にごり', 'おりがらみ', '直汲み',
  '袋吊り', '斗瓶囲い', '熟成', 'スパークリング',
  '低アルコール', '季節限定', 'その他'
] as const;
export const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
] as const;

/** Google Maps URLs work without an API key. These are search candidates, not verified pins. */
export function breweryMapsQuery(name:string,prefecture:string,municipality:string,address:string):string {
 const n=name.trim(),p=prefecture.trim(),m=municipality.trim(),a=address.trim();
 if(!n)return '';
 const place=a?(p&&!a.includes(p)?p+' '+a:a):[p,m].filter(Boolean).join(' ');
 return [n,place].filter(Boolean).join(' ');
}
export function breweryMapsUrl(name:string,prefecture:string,municipality:string,address:string):string {
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(breweryMapsQuery(name,prefecture,municipality,address));
}
export function breweryDirectionsUrl(name:string,prefecture:string,municipality:string,address:string):string {
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(breweryMapsQuery(name,prefecture,municipality,address));
}
export interface BreweryOption {name:string;prefecture:string;municipality:string;address:string;count:number}
export function listBreweries(brands:Brand[],records:{breweryName:string;prefecture:string;municipality?:string;breweryAddress?:string}[]=[]):BreweryOption[]{
 const map=new Map<string,BreweryOption>();
 for(const b of brands){
  const name=b.breweryName.trim(),prefecture=b.prefecture.trim();if(!name)continue;
  const k=name+'|'+prefecture,v=map.get(k);
  if(!v)map.set(k,{name,prefecture,municipality:b.municipality||'',address:b.breweryAddress||'',count:1});
  else{v.count++;if(!v.municipality&&b.municipality)v.municipality=b.municipality;if(!v.address&&b.breweryAddress)v.address=b.breweryAddress;}
 }
 for(const r of records){
  const name=r.breweryName.trim(),prefecture=r.prefecture.trim();if(!name)continue;
  const k=name+'|'+prefecture,v=map.get(k);
  if(!v)map.set(k,{name,prefecture,municipality:r.municipality||'',address:r.breweryAddress||'',count:0});
  else{if(!v.municipality&&r.municipality)v.municipality=r.municipality;if(!v.address&&r.breweryAddress)v.address=r.breweryAddress;}
 }
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.prefecture.localeCompare(b.prefecture,'ja'));
}
export async function loadBrands(): Promise<Brand[]> {
  const response = await fetch(import.meta.env.BASE_URL + 'sakenowa-brands.json');
  if (!response.ok) throw new Error('銘柄マスターの取得に失敗しました。');
  const rows: Brand[] = await response.json();
  return rows.filter((x) => x.brandId && x.brandName);
}
