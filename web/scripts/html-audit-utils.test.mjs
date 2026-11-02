import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument,elements,attribute,plainHtmlText,visibleText,rawScriptText} from './html-audit-utils.mjs';

test('malicious scripts and styles are inert and omitted from visible text',()=>{
  const html='<p>安全な本文</p><script type="text/javascript" onerror="alert(1)">evil()</script><style>body{color:red}</style><div>施設情報</div>';
  const plain=plainHtmlText(html);
  assert.match(plain,/安全な本文/);
  assert.match(plain,/施設情報/);
  assert.doesNotMatch(plain,/evil\(\)|color:red|alert\(1\)/);
});

test('HTML5 parser reads tags and decoded attributes without brittle tag regexes',()=>{
 const html='<meta name="geo.position" content="33.84, 132.77"><a href="/access?x=1&amp;y=2"><b>アクセス</b></a>';
 const doc=parseDocument(html), meta=elements(doc,'meta')[0], a=elements(doc,'a')[0];
 assert.equal(attribute(meta,'content'),'33.84, 132.77');
 assert.equal(attribute(a,'href'),'/access?x=1&y=2');
 assert.equal(visibleText(a).trim(),'アクセス');
});

test('JSON-LD script payload can be extracted but cannot execute',()=>{
 const doc=parseDocument('<script type="application/ld+json">{"geo":{"latitude":33.8,"longitude":132.8}}</script>');
 const script=elements(doc,'script')[0];
 assert.equal(attribute(script,'type'),'application/ld+json');
 assert.equal(JSON.parse(rawScriptText(script)).geo.latitude,33.8);
 assert.equal(plainHtmlText('<script>attack()</script>'),'');
});
