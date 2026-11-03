// Local-only HTTPS server for synthetic acceptance tests. Nothing is deployed.
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'sakefolio-ci-'));
const key=join(directory,'server.key'),cert=join(directory,'server.crt');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,
 '-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
const assets=new Map(),root=resolve('dist');
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain'};
function collect(dir,prefix=''){
 for(const file of readdirSync(dir,{withFileTypes:true})){
  if(file.isDirectory())collect(join(dir,file.name),prefix+'/'+file.name);
  else if(file.isFile())assets.set(prefix+'/'+file.name,{bytes:readFileSync(join(dir,file.name)),type:types[extname(file.name)]||'application/octet-stream'});
 }
}
collect(root);assets.set('/',assets.get('/index.html'));
const common=Object.fromEntries(readFileSync(join(root,'_headers'),'utf8').split('\n').filter(line=>/^  [\w-]+:/.test(line)).map(line=>{
 const colon=line.indexOf(':');return [line.slice(2,colon),line.slice(colon+1).trim()];
}));
const server=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
 const path=new URL(req.url,'https://127.0.0.1:4173').pathname;
 const asset=assets.get(path);
 res.writeHead(asset?200:404,{...common,'Content-Type':asset?.type||'text/plain'});
 res.end(req.method==='HEAD'?'':asset?.bytes||'Not found');
});
server.listen(4173,'127.0.0.1');
const stop=()=>server.close(()=>{rmSync(directory,{recursive:true,force:true});process.exit(0);});
process.on('SIGTERM',stop);process.on('SIGINT',stop);
