import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {oauthClientIds} from '../scripts/oauth-client-ids.mjs';
test('delivery audit extracts whole client IDs only',()=>{
  const id='123-abc.apps.googleusercontent.com';
  assert.deepEqual(oauthClientIds(`"${id}" '${id}' "x${id}" "${id}.evil"`),[id]);
});
for(const [file,name] of [['audit-official-brewery-sites.mjs','plain'],['audit-brewery-access-assets.mjs','text']]){
  test(`${file}: whitespace closing tags do not leak script/style text`,()=>{
    const source=readFileSync(new URL('../scripts/'+file,import.meta.url),'utf8');
    const fn=source.split('\n').find(line=>line.startsWith('function '+name+'('));
    const extract=runInNewContext(fn+';'+name);
    assert.equal(extract('<p>visible</p><script>hidden</script ><style>secret</style\t> end').trim(),'visible end');
  });
}
test('map classifier rejects lookalike OpenStreetMap hosts',()=>{
  const source=readFileSync(new URL('../scripts/audit-brewery-access-assets.mjs',import.meta.url),'utf8');
  const definition=source.slice(source.indexOf('function links('),source.indexOf('function addressEvidence('));
  const links=runInNewContext(definition+';links',{URL});
  for(const host of ['openstreetmap.org','www.openstreetmap.org'])
    assert.equal(links(`<a href="https://${host}/map">`,'https://example.com/').map.length,1);
  for(const host of ['evilopenstreetmap.org','openstreetmap.org.evil.com'])
    assert.equal(links(`<a href="https://${host}/map">`,'https://example.com/').map.length,0);
});
