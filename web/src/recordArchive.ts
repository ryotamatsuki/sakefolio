/** Portable text export. Photos remain in private Drive; do not imply
 * that a plain CSV/JSON file contains the original image bytes.
 */
import type {RecordEntry} from './types';
const clean=(x:unknown):string=>{
 const s=String(x??'');
 // Spreadsheet applications can execute formulas imported from CSV.
 return /^[\s\uFEFF]*[=+@-]/.test(s)?"'"+s:s;
};
const quoted=(value:unknown)=>'"'+clean(value).replace(/"/g,'""')+'"';
export function csvRecords<T extends object>(records:T[]):string{
 const columns=Array.from(new Set(records.flatMap(r=>Object.keys(r)))).filter(x=>x!=='photo');
 return '\ufeff'+columns.map(quoted).join(',')+'\r\n'+records.map(r=>columns.map(c=>quoted((r as Record<string,unknown>)[c])).join(',')).join('\r\n');
}
export function downloadBlob(name:string,blob:Blob):void{
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function downloadCsv<T extends object>(filename:string,records:T[]):void{
 downloadBlob(filename,new Blob([csvRecords(records)],{type:'text/csv;charset=utf-8'}));
}
export function downloadJson(filename:string,data:unknown):void{
 downloadBlob(filename,new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
}
export function buildPreferenceSummary(records:RecordEntry[]):string{
 const rated=records.filter(r=>/^[1-5]$/.test(r.rating));
 if(rated.length<2)return '記録が2件以上になると、好みの傾向を振り返れます。';
 const groups=new Map<string,{count:number;sum:number}>();
 for(const r of rated){
   const name=r.prefecture||'産地不明',g=groups.get(name)||{count:0,sum:0};
   g.count++;g.sum+=Number(r.rating);groups.set(name,g);
 }
 const ranked=[...groups].filter(([,v])=>v.count>=2).sort((a,b)=>b[1].sum/b[1].count-a[1].sum/a[1].count);
 const best=rated.reduce((top,r)=>Number(r.rating)>Number(top.rating)?r:top);
 return ranked.length
  ?'記録した産地では'+ranked[0][0]+'が平均'+(ranked[0][1].sum/ranked[0][1].count).toFixed(1)+'点（'+ranked[0][1].count+'件）。最高評価は'+best.brandName+' '+best.rating+'点です。'
  :'最高評価は'+best.brandName+' '+best.rating+'点。各産地で2件以上記録すると比較できます。';
}
export function sameProductHistory<T extends {brandName:string;productName:string;rating:string;createdAt:string;id?:string;reviewId?:string}>(
 records:T[],current:T):T[]{
 return records.filter(x=>x!==current&&(x.id||x.reviewId)!==(current.id||current.reviewId)
   &&x.brandName===current.brandName&&x.productName===current.productName)
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
