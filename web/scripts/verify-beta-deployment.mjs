import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function verifyHeaders(headers){
  const policy=headers.get('content-security-policy')||'';
  for(const directive of ["default-src 'none'","script-src 'self' https://accounts.google.com/gsi/client","object-src 'none'","base-uri 'none'","frame-ancestors 'none'"])
    assert.ok(policy.split(';').map(s=>s.trim()).includes(directive),'Missing/changed CSP directive: '+directive);
  assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(policy),'Unsafe script execution policy');
  assert.equal(headers.get('x-content-type-options'),'nosniff');
  assert.equal(headers.get('x-frame-options'),'DENY');
  assert.equal(headers.get('cross-origin-opener-policy'),'same-origin-allow-popups');
  assert.match(headers.get('strict-transport-security')||'',/max-age=31536000/);
  assert.equal(headers.get('referrer-policy'),'strict-origin-when-cross-origin');
  assert.match(headers.get('permissions-policy')||'',/microphone=\(\)/);
  assert.match(headers.get('x-robots-tag')||'',/noindex/);
}
export async function verifyDeployment(manifest,request=fetch){
  assert.equal(manifest.version,1);
  assert.match(manifest.origin,/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pages\.dev$/);
  assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(manifest.oauthScope,'https://www.googleapis.com/auth/drive.file');
  assert.equal(manifest.storageNamespace,'Sakefolio');
  assert.ok(Object.hasOwn(manifest.files,'index.html'));
  assert.ok(Object.keys(manifest.files).some(f=>f.startsWith('assets/')&&f.endsWith('.js')));
  const checked=[];
  for(const [file,hash] of Object.entries(manifest.files)){
    assert.match(file,/^(?:index\.html|assets\/[A-Za-z0-9_-]+\.(?:js|css))$/);
    assert.match(hash,/^[a-f0-9]{64}$/);
    const response=await request(manifest.origin+'/'+file,{redirect:'error',signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,'Non-200: '+file);
    verifyHeaders(response.headers);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Wrong/stale deployed bytes: '+file);
    if(file==='index.html'){
      assert.match(response.headers.get('content-type')||'',/text\/html/);
      assert.match(response.headers.get('cache-control')||'',/no-store/);
    }
    checked.push(file);
  }
  const live=await request(manifest.origin+'/build-manifest.json',{redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(live.status,200);verifyHeaders(live.headers);
  assert.deepEqual(await live.json(),manifest,'Source SHA or manifest mismatch');
  return {sourceCommit:manifest.sourceCommit,origin:manifest.origin,checked,oauth:'NOT_TESTED',iPhone:'NOT_TESTED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const manifest=JSON.parse(readFileSync(resolve(root,'dist/build-manifest.json'),'utf8'));
  console.log(JSON.stringify(await verifyDeployment(manifest),null,2));
}
