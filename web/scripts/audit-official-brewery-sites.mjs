import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import robotsParser from 'robots-parser';
const targets=JSON.parse(await fs.readFile('data/brewery-official-site-targets.json','utf8'));
const previous=JSON.parse(await fs.readFile('public/brewery-coordinates.json','utf8'));
const prior=new Map(previous.map(p=>[p.breweryName+'|'+p.prefecture,p]));
const UA='SakefolioBreweryAudit/1.0 (+https://github.com/ryotamatsuki/sakefolio)';
const robots=new Map(),hostTimers=new Map(),results=new Array(targets.length);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function localIP(ip){if(net.isIP(ip)===6)return true;const a=ip.split('.').map(Number);return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127);}
async function safe(raw){
 const u=new URL(raw);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&& !['80','443'].includes(u.port)||u.hostname==='localhost'||net.isIP(u.hostname))throw Error('unsafe_url');
 const addresses=await dns.lookup(u.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>localIP(a.address)))throw Error('nonpublic_host');
 return u;
}
async function get(raw,robotsFile=false){
 let u=await safe(raw);
 for(let n=0;n<5;n++){
  const last=hostTimers.get(u.host)||0;
  await delay(Math.max(0,1250-(Date.now()-last)));
  hostTimers.set(u.host,Date.now());
  const res=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'User-Agent':UA,'Accept':robotsFile?'text/plain':'text/html'}});
  if([301,302,303,307,308].includes(res.status)){u=await safe(new URL(res.headers.get('location'),u).href);continue;}
  if(!res.ok)throw Error('HTTP_'+res.status);
  if(!robotsFile&&!/html/i.test(res.headers.get('content-type')||''))throw Error('not_html');
  if(Number(res.headers.get('content-length')||0)>500000)throw Error('oversized');
  const reader=res.body.getReader();let total=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>500000){await reader.cancel();throw Error('oversized');}chunks.push(Buffer.from(value));}
  return {url:u.href,html:Buffer.concat(chunks).toString('utf8')};
 }
 throw Error('redirect_limit');
}
async function allowed(url){
 const u=new URL(url);
 if(!robots.has(u.origin))robots.set(u.origin,(async()=>{
  try{const r=await get(u.origin+'/robots.txt',true);return robotsParser(u.origin+'/robots.txt',r.html);}
  catch(e){return ['HTTP_404','HTTP_410'].includes(e.message)?robotsParser(u.origin+'/robots.txt',''):null;}
 })());
 const p=await robots.get(u.origin);
 return p!==null&&p.isAllowed(url,UA)!==false;
}
function plain(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').slice(0,100000);}
function geo(html){
 const coords=[];
 for(const m of html.matchAll(/<meta\b[^>]{0,1000}>/gi)){
  const s=m[0],key=(s.match(/\b(?:name|property)=["']([^"']+)["']/i)||[])[1]||'';
  if(!/^(geo\.position|icbm)$/i.test(key))continue;
  const v=(s.match(/\bcontent=["']([^"']+)["']/i)||[])[1]||'';
  const a=v.match(/(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{2,3}\.\d+)/);
  if(a)coords.push({lat:+a[1],lon:+a[2],kind:'first_party_meta'});
 }
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const obj=JSON.parse(m[1]);
   const walk=(x,depth=0)=>{
    if(!x||typeof x!=='object'||depth>8)return;
    if(Array.isArray(x)){for(const v of x)walk(v,depth+1);return;}
    const g=x.geo||(/GeoCoordinates/i.test(String(x['@type']||''))?x:null);
    if(g&&typeof g==='object'&&Number.isFinite(Number(g.latitude))&&Number.isFinite(Number(g.longitude)))
      coords.push({lat:+g.latitude,lon:+g.longitude,kind:'first_party_jsonld',associatedName:String(x.name||'').slice(0,100)});
    for(const [k,v]of Object.entries(x))if(k!=='geo'&&v&&typeof v==='object')walk(v,depth+1);
   };walk(obj);
  }catch{}
 }
 return coords.filter(x=>x.lat>=20&&x.lat<=47&&x.lon>=122&&x.lon<=154);
}
function access(html,base){
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  if(!/(access|アクセス|会社概要|所在地|交通案内|company|about|location)/i.test(m[1]+' '+plain(m[2])))continue;
  try{const u=new URL(m[1].replace(/&amp;/g,'&'),base);if(u.origin===new URL(base).origin&&/^https?:/.test(u.protocol)&&!/\.(pdf|jpg|png)$/i.test(u.pathname))return u.href;}catch{}
 }
 return null;
}
function distKm(a,b,c,d){const r=Math.PI/180,v=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(v)));}
async function inspect(t){
 const p=prior.get(t.breweryName+'|'+t.prefecture);
 const row={breweryName:t.breweryName,prefecture:t.prefecture,referenceAddress:t.address,website:t.website,previousPrecision:p?.precision||'unresolved',status:'no_website',pages:[],coordinateCandidates:[],addressMentions:[],promoted:false};
 if(!t.website)return row;
 try{
  if(!await allowed(t.website)){row.status='robots_disallowed_or_unavailable';return row;}
  const home=await get(t.website);const pages=[home],link=access(home.html,home.url);
  if(link){try{if(await allowed(link))pages.push(await get(link));}catch(e){row.pages.push({url:link,error:String(e.message).slice(0,120)});}}
  for(const page of pages){
   const txt=plain(page.html),nameMatch=txt.includes(t.breweryName),prefMatch=txt.includes(t.prefecture);
   row.pages.push({url:page.url,mentionsBrewery:nameMatch,mentionsPrefecture:prefMatch});
   if(t.address&&txt.includes(t.address))row.addressMentions.push({url:page.url,address:t.address,exact:true});
   for(const c of geo(page.html))row.coordinateCandidates.push({...c,url:page.url,mentionsBrewery:nameMatch,mentionsPrefecture:prefMatch,distanceToPreviousKm:p?Math.round(distKm(c.lat,c.lon,p.lat,p.lon)*100)/100:null});
  }
  row.status=row.coordinateCandidates.length?'official_geo_candidate':row.addressMentions.length?'address_confirmed_on_page':'site_accessible_no_location';
 }catch(e){row.status='fetch_error';row.error=String(e.message||e).slice(0,150);}
 return row;
}
let index=0;
await Promise.all(Array.from({length:6},async()=>{
 while(index<targets.length){const i=index++;results[i]=await inspect(targets[i]);if((i+1)%100===0)console.log('Processed '+(i+1)+' / '+targets.length);}
}));
const counts={};for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
const report={generatedAt:new Date().toISOString(),total:targets.length,counts,
 methodology:'Visit linked official-site candidates and one access page; obey robots.txt; extract first-party coordinate metadata and exact address mentions. All coordinates are candidates, not auto-approved.',
 caution:'URL ownership, brewery building identity, and address match need verification. Never extract Google Maps tile, iframe, map center or pin coordinates for reuse.',
 results};
await fs.writeFile('data/brewery-official-site-audit.json',JSON.stringify(report,null,2)+'\n');
console.log('AUDIT_RESULT '+JSON.stringify({total:targets.length,counts,candidates:results.reduce((n,x)=>n+x.coordinateCandidates.length,0)}));
