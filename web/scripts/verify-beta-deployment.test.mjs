import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyHeaders,verifyDeployment} from './verify-beta-deployment.mjs';
const lines=readFileSync(new URL('../public/_headers',import.meta.url),'utf8').split('\n');
const headers=()=>new Headers(lines.filter(s=>/^  [\w-]+:/.test(s)).map(s=>{const i=s.indexOf(':');return [s.slice(2,i),s.slice(i+1).trim()];}));
test('deployment verifier rejects missing HTTP CSP even if HTML has a CSP meta',()=>{
 const h=headers();verifyHeaders(h);h.delete('content-security-policy');assert.throws(()=>verifyHeaders(h));
});
test('deployment verifier rejects weak script policy',()=>{
 const h=headers();h.set('content-security-policy',h.get('content-security-policy').replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"));assert.throws(()=>verifyHeaders(h));
});
test('deployment verifier binds dedicated origin, exact bundle bytes and source SHA',async()=>{
 const files={'index.html':'<html>synthetic</html>','assets/index-test.js':'console.log("synthetic")'};
 const manifest={version:1,origin:'https://sakefolio-test.pages.dev',sourceCommit:'a'.repeat(40),storageNamespace:'Sakefolio',oauthScope:'https://www.googleapis.com/auth/drive.file',files:Object.fromEntries(Object.entries(files).map(([f,body])=>[f,createHash('sha256').update(body).digest('hex')]))};
 const request=async url=>{const file=new URL(url).pathname.slice(1);const h=headers();h.set('content-type',file.endsWith('.html')?'text/html':'application/json');return new Response(file==='build-manifest.json'?JSON.stringify(manifest):files[file],{headers:h});};
 assert.equal((await verifyDeployment(manifest,request)).checked.length,2);
 await assert.rejects(verifyDeployment({...manifest,origin:'https://ryotamatsuki.github.io'},request));
 await assert.rejects(verifyDeployment(manifest,async()=>new Response('stale',{headers:headers()})),/stale/);
});
