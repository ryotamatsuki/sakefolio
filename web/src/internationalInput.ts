/** Structured packaging and technical specifications for China drinks.
 * Values are stored in base units (ml, %vol); never formatted local strings.
 * Presets are convenience shortcuts, not limits on legitimate values.
 */
import type {BeverageKind} from './internationalCatalog.ts';

export const VOLUME_PRESETS:Record<BeverageKind,readonly number[]>={
 baijiu:[50,100,125,250,375,475,500,700,750,1000,1500],
 huangjiu:[300,375,500,600,640,700,720,750,1000,1800],
 beer:[250,330,350,355,473,500,568,600,640,1000],
 wine:[187,200,250,375,500,750,1000,1500,3000]
};
export const ABV_PRESETS:Record<BeverageKind,readonly number[]>={
 baijiu:[38,42,45,50,52,53,55,56,60],
 huangjiu:[8,10,12,13,14,15,16,17,18,20],
 beer:[0,3.5,4,4.5,5,5.5,6,6.5,7,8,9,10],
 wine:[8.5,9,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16]
};
export type SpecKey='volume'|'abv';
export function normalizeVolume(raw:unknown):string|null{
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 const value=String(raw).trim();
 if(!/^[0-9]{1,5}$/.test(value))return null;
 const num=Number(value);
 return Number.isSafeInteger(num)&&num>=1&&num<=20000?String(num):null;
}
export function normalizeAbv(raw:unknown):string|null{
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 const value=String(raw).trim();
 if(!/^(?:\d{1,3})(?:\.\d)?$/.test(value))return null;
 const number=Number(value);
 return Number.isFinite(number)&&number>=0&&number<=100?String(number):null;
}
export function canonicalSpec(key:SpecKey,raw:unknown):string|null{
 return key==='volume'?normalizeVolume(raw):normalizeAbv(raw);
}
export function validateTechnicalSpecs(attrs:Record<string,string>):void{
 for(const key of ['volume','abv'] as const){
   if(attrs[key]!==undefined&&attrs[key]!==''&&canonicalSpec(key,attrs[key])===null)
     throw Error(key==='volume'?'容量は1～20,000mLの整数で入力してください。':
       'アルコール度数は0～100%で小数第1位までにしてください。');
 }
 if(attrs.vintage&&(!/^(?:19\d{2}|20\d{2})$/.test(attrs.vintage)||
     Number(attrs.vintage)>new Date().getFullYear()+1))
   throw Error('ヴィンテージは1900年以降の西暦4桁で入力してください。');
}
export function canonicalizeTechnicalSpecs(attrs:Record<string,string>):Record<string,string>{
 validateTechnicalSpecs(attrs);
 return {...attrs,
  ...(attrs.volume?{volume:normalizeVolume(attrs.volume)!}:{}),
  ...(attrs.abv?{abv:normalizeAbv(attrs.abv)!}:{})
 };
}
/** Single-container product quantity only. Multipacks must be manually clarified. */
export function volumeFromQuantity(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 const s=raw.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 if(!s||/\d(?:x|×|\*)\d|\d(?:pack|本|瓶|缶|罐|袋|盒|pk)/i.test(s))return null;
 const found=/^(\d+(?:\.\d+)?)\s*(ml|毫升|cl|厘升|l|升|litre|liter|litres|liters)$/.exec(s);
 if(!found)return null;
 const count=Number(found[1]),unit=found[2];
 const factor=unit==='ml'||unit==='毫升'?1:unit==='cl'||unit==='厘升'?10:1000;
 const ml=count*factor;
 return Number.isInteger(ml)?normalizeVolume(String(ml)):null;
}
/** Existing data uses the same units. Bad old values are not silently converted. */
export function specStats(
 attrs:readonly Record<string,string>[],key:SpecKey
):{count:number;mean:number|null;min:number|null;max:number|null;frequencies:{value:string;count:number}[]} {
 const values=attrs.map(a=>canonicalSpec(key,a[key])).filter((v):v is string=>v!==null);
 const unique=new Map<string,number>();
 for(const item of values)unique.set(item,(unique.get(item)||0)+1);
 const numbers=values.map(Number);
 return {
   count:values.length,
   mean:numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null,
   min:numbers.length?Math.min(...numbers):null,max:numbers.length?Math.max(...numbers):null,
   frequencies:[...unique].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count||Number(a.value)-Number(b.value))
 };
}
