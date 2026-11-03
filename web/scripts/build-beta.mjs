import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const origin=process.env.VITE_BETA_ORIGIN||'';
const client=process.env.VITE_GOOGLE_CLIENT_ID||'';
if(!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pages\.dev$/.test(origin))
  throw Error('Set VITE_BETA_ORIGIN to the final dedicated https://PROJECT.pages.dev origin (no path).');
if(!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(client))
  throw Error('Set the public Google web OAuth client ID. Do not supply a client secret.');
if(execFileSync('git',['status','--porcelain','--','.'],{cwd:root,encoding:'utf8'}).trim())
  throw Error('Refusing to stamp a dirty source tree as a reviewed commit. Commit source changes first.');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
// Do not accidentally deploy the isolated real-account audit storage namespace.
execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit',env:{...process.env,
  GITHUB_PAGES:'false',VITE_SAKEFOLIO_SECURITY_TEST:'',VITE_BETA_ORIGIN:origin}});
const files=['index.html',...readdirSync(resolve(root,'dist/assets')).filter(f=>/\.(js|css)$/.test(f)).map(f=>'assets/'+f)];
const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,'dist',file))).digest('hex')]));
const manifest={version:1,sourceCommit:commit,origin,storageNamespace:'Sakefolio',oauthScope:'https://www.googleapis.com/auth/drive.file',files:hashes};
writeFileSync(resolve(root,'dist/build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceCommit:commit,origin,files:files.length,storageNamespace:manifest.storageNamespace}));
