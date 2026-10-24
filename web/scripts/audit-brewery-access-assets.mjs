import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import robotsParser from 'robots-parser';
const exec=promisify(execFile);
const prior=JSON.parse(await fs.readFile('data/brewery-official-site-audit.json','utf8'));
const targets=JSON.parse(await fs.readFile('data/brewery-official-site-targets.json','utf8'));
const coords=JSON.parse(await fs.readFile('public/brewery-coordinates.json','utf8'));
const pointMap=new Map(coords.map(x=>[x.breweryName+'|'+x.prefecture,x]));
const reportMap=new Map(prior.results.map(x=>[x.breweryName+'|'+x.prefecture,x]));
const UA='SakefolioAccessMapAudit/1.0 (+https://github.com/ryotamatsuki/sakefolio)';
const caches=new Map(),timers=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const LIMIT=4_000_000;
function isLocal(ip){if(net.isIP(ip)===6)return true;const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);}
async function safe(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hostname==='localhost'||net.isIP(u.hostname)||u.port&&!['80','443'].includes(u.port))throw Error('unsafe_url');const a=await dns.lookup(u.hostname,{all:true});if(!a.length||a.some(x=>isLocal(x.address)))throw Error('non_public_host');return u;}
async function get(raw,limit=LIMIT){
 let u=await safe(raw);
 for(let i=0;i<5;i++){
  const last=timers.get(u.host)||0;await wait(Math.max(0,1100-(Date.now()-last)));timers.set(u.host,Date.now());
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(13000),headers:{'User-Agent':UA}});
  if([301,302,303,307,308].includes(r.status)){u=await safe(new URL(r.headers.get('location'),u).href);continue;}
  if(!r.ok)throw Error('HTTP_'+r.status);
  if(Number(r.headers.get('content-length')||0)>limit)throw Error('oversized');
  const chunks=[];let size=0;const reader=r.body.getReader();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('oversized');}chunks.push(Buffer.from(value));}
  return {url:u.href,type:r.headers.get('content-type')||'',data:Buffer.concat(chunks)};
 }
 throw Error('redirect_limit');
}
async function allowed(raw){
 const u=await safe(raw);
 if(!caches.has(u.origin))caches.set(u.origin,(async()=>{try{const r=await get(u.origin+'/robots.txt',500000);return robotsParser(u.origin+'/robots.txt',r.data.toString('utf8'));}catch(e){return ['HTTP_404','HTTP_410'].includes(e.message)?robotsParser(u.origin+'/robots.txt',''):null;}})());
 const parser=await caches.get(u.origin);return parser!==null&&parser.isAllowed(raw,UA)!==false;
}
function text(s){return String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');}
function links(html,base){
 const found={pdf:[],image:[],map:[],access:[]};
 const rx=/<(?:a|img|iframe)\b[^>]{0,3000}>/gi;
 for(const match of html.matchAll(rx)){
  const tag=match[0],raw=(tag.match(/\b(?:href|src)=["']([^"']+)["']/i)||[])[1];if(!raw)continue;
  const label=(tag.match(/\b(?:alt|title)=["']([^"']+)["']/i)||[])[1]||'';
  const context=tag+' '+label;
  let u;try{u=new URL(raw.replace(/&amp;/g,'&'),base);}catch{continue;}
  if(!/^https?:/.test(u.protocol))continue;
  const url=u.href;
  if(/(?:google\.[^/]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(u.hostname+u.pathname)){found.map.push({provider:'google',url,kind:tag.slice(0,8)});continue;}
  if((u.hostname==='openstreetmap.org'||u.hostname.endsWith('.openstreetmap.org'))){found.map.push({provider:'openstreetmap',url,kind:tag.slice(0,8)});continue;}
  if(u.origin!==new URL(base).origin)continue;
  if(/\.pdf(?:$|\?)/i.test(url)&&/地図|アクセス|案内|access|map|交通|会社|pdf/i.test(context))found.pdf.push(url);
  if(/\.(?:png|jpg|jpeg|webp)(?:$|\?)/i.test(url)&&/地図|アクセス|案内|access|map|交通|location/i.test(context))found.image.push(url);
  if(/access|アクセス|交通案内|所在地|会社概要|company|location/i.test(context)&&!/\.(?:pdf|png|jpg|jpeg|webp)/i.test(url))found.access.push(url);
 }
 for(const key of Object.keys(found))found[key]=[...new Map(found[key].map(x=>[typeof x==='string'?x:x.url,x])).values()].slice(0,8);
 return found;
}
function addressEvidence(content,target){
 const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/[ー－‐–—−]/g,'-');
 const normalized=clean(content),addr=clean(target.address),pref=clean(target.prefecture);
 const full=!!addr&&addr.length>=9&&normalized.includes(addr);
 const hasPref=!!pref&&normalized.includes(pref);
 const match=normalized.match(new RegExp(pref+'[^、。;；]{5,70}'))?.[0]||'';
 return {exactReferenceAddress:full,prefectureMention:hasPref,excerpt:match.slice(0,85)};
}
async function extractPDF(buf){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sake-pdf-'));const file=path.join(dir,'map.pdf');
 try{await fs.writeFile(file,buf);const {stdout}=await exec('pdftotext',['-f','1','-l','2','-layout',file,'-'],{timeout:20000,maxBuffer:1000000});return stdout.slice(0,120000);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function extractImage(buf){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sake-map-'));const file=path.join(dir,'map-image');
 try{await fs.writeFile(file,buf);const {stdout}=await exec('tesseract',[file,'stdout','-l','jpn+eng'],{timeout:18000,maxBuffer:500000});return stdout.slice(0,50000);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function audit(target){
 const key=target.breweryName+'|'+target.prefecture,old=reportMap.get(key),baseline=pointMap.get(key);
 const r={breweryName:target.breweryName,prefecture:target.prefecture,previousPrecision:baseline?.precision||'unresolved',priority:baseline?.precision==='lot_or_address'?'standard':'high',website:target.website,status:'not_attempted',accessPages:[],mapLinks:[],pdfEvidence:[],imageEvidence:[],errors:[],promoted:false};
 if(!target.website){r.status='no_website';return r;}
 if(!old?.pages?.some(p=>p.url)){r.status='previously_inaccessible';return r;}
 const pages=[...new Set(old.pages.filter(p=>p.url&&!p.error).map(p=>p.url))].slice(0,2);
 const collected={pdf:[],image:[]};
 for(const url of pages){
  try{
   if(!await allowed(url)){r.errors.push('robots_disallowed '+url);continue;}
   const res=await get(url,550000);if(!/html/i.test(res.type))continue;
   const l=links(res.data.toString('utf8'),res.url);
   r.accessPages.push({url:res.url,accessLinkCount:l.access.length});
   r.mapLinks.push(...l.map);
   collected.pdf.push(...l.pdf);collected.image.push(...l.image);
  }catch(e){r.errors.push(String(e.message||e).slice(0,110));}
 }
 for(const kind of ['pdf','image']){
  const urls=[...new Set(collected[kind])].slice(0,1);
  for(const url of urls){
   try{
    if(!await allowed(url)){r.errors.push('asset_robots_disallowed');continue;}
    const res=await get(url);if(kind==='pdf'&&!(/pdf/i.test(res.type)||res.data.subarray(0,4).toString()==='%PDF'))continue;
    if(kind==='image'&&!/image/i.test(res.type))continue;
    const extracted=kind==='pdf'?await extractPDF(res.data):await extractImage(res.data);
    r[kind+'Evidence'].push({url:res.url,bytes:res.data.length,extractedChars:extracted.length,...addressEvidence(extracted,target)});
   }catch(e){r.errors.push(kind+' '+String(e.message||e).slice(0,100));}
  }
 }
 r.mapLinks=[...new Map(r.mapLinks.map(x=>[x.url,x])).values()].slice(0,6);
 r.status=r.pdfEvidence.length||r.imageEvidence.length?'assets_inspected':r.mapLinks.length?'map_links_found':r.accessPages.length?'pages_inspected':'no_access';
 return r;
}
const ordered=[...targets].sort((a,b)=>{
 const A=pointMap.get(a.breweryName+'|'+a.prefecture),B=pointMap.get(b.breweryName+'|'+b.prefecture);
 const priority=x=>!x?0:x.precision==='town_approximate'?1:2;return priority(A)-priority(B);
});
const results=new Array(ordered.length);let next=0;
await Promise.all(Array.from({length:5},async()=>{while(next<ordered.length){const i=next++;results[i]=await audit(ordered[i]);if((i+1)%100===0)console.log('MAP_ASSET_AUDIT '+(i+1)+' / '+ordered.length);}}));
const counts={};for(const x of results)counts[x.status]=(counts[x.status]||0)+1;
const totals={targets:results.length,counts,googleMapLinks:results.reduce((n,x)=>n+x.mapLinks.filter(l=>l.provider==='google').length,0),osmMapLinks:results.reduce((n,x)=>n+x.mapLinks.filter(l=>l.provider==='openstreetmap').length,0),pdfInspected:results.reduce((n,x)=>n+x.pdfEvidence.length,0),imageInspected:results.reduce((n,x)=>n+x.imageEvidence.length,0),pdfAddressConfirmed:results.filter(x=>x.pdfEvidence.some(e=>e.exactReferenceAddress)).length,imageAddressConfirmed:results.filter(x=>x.imageEvidence.some(e=>e.exactReferenceAddress)).length};
await fs.writeFile('data/brewery-access-map-assets-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),totals,methodology:'Analyze first-party access HTML and linked PDFs/images using pdftotext and Japanese OCR. Map links are references only; Google map coordinates are not extracted or stored. No automatic coordinate promotion.',results},null,2)+'\n');
console.log('MAP_ASSET_AUDIT_RESULT '+JSON.stringify(totals));
