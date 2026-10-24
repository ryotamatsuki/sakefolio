// Read-only delivery audit. Never sends Google credentials or user data.
import {createHash} from 'node:crypto';
const urls=process.argv.slice(2);
if(!urls.length)throw Error('Pass the exact HTTPS delivery URL(s).');
for(const input of urls){
  const url=new URL(input);if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await fetch(url,{redirect:'follow'}),html=await response.text();
  const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)].map(m=>new URL(m[1],response.url).href);
  const assets=[];
  for(const script of scripts){
    if(new URL(script).origin!==url.origin){assets.push({url:script,thirdParty:true});continue;}
    const asset=await fetch(script),body=await asset.text();
    assets.push({url:script,status:asset.status,sha256:createHash('sha256').update(body).digest('hex'),
      oauthClientIds:[...new Set(body.match(/[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/g)||[])],
      serviceWorkerRegistration:/serviceWorker\s*\.\s*register/.test(body),
      sandboxMarker:body.includes('SAKEFOLIO_SECURITY_TEST_20261019')});
  }
  let manifest=null;
  if(url.pathname.includes('security-test-20261019')){
    const r=await fetch(new URL('security-sandbox-build.json',url));if(r.ok)manifest=await r.json();
  }
  console.log(JSON.stringify({requestedUrl:input,finalUrl:response.url,status:response.status,
    contentSecurityPolicy:response.headers.get('content-security-policy'),
    serviceWorkerAllowed:response.headers.get('service-worker-allowed'),scripts:assets,manifest}));
}
