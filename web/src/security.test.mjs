import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectPhotoType, verifyPhoto, validateRecordInput, MAX_PHOTO_BYTES } from './security.ts';

const photo = (bytes, mime='') => new File([new Uint8Array(bytes)], 'uploaded.any', {type:mime});
test('accepts JPEG/PNG/WEBP magic bytes', () => {
  assert.equal(detectPhotoType(new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0]))?.mime,'image/jpeg');
  assert.equal(detectPhotoType(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]))?.mime,'image/png');
  assert.equal(detectPhotoType(new Uint8Array(Buffer.from('RIFFxxxxWEBPxxxx')))?.mime,'image/webp');
});
test('rejects SVG/HTML masquerading as image',async()=>{
  await assert.rejects(verifyPhoto(photo(Buffer.from('<svg onload="alert(1)"></svg>'),'image/svg+xml')));
  await assert.rejects(verifyPhoto(photo(Buffer.from('<html>evil</html>'),'image/png')));
});
test('rejects spoofed MIME and empty files',async()=>{
  await assert.rejects(verifyPhoto(photo([255,216,255,0,0,0,0,0,0,0,0,0],'image/png')));
  await assert.rejects(verifyPhoto(new File([], 'x.png', {type:'image/png'})));
});
test('rejects oversized files',async()=>{
  await assert.rejects(verifyPhoto(new File([new Uint8Array(MAX_PHOTO_BYTES+1)], 'x.jpg',{type:'image/jpeg'})));
});
const valid={breweryName:'石鎚酒造',brandName:'石鎚',drinkingDate:'2026-10-15',rating:'4',notes:'吟醸香が心地よい'};
test('validates safe record',()=>assert.doesNotThrow(()=>validateRecordInput(valid)));
test('rejects malformed dates, ratings and controls',()=>{
  assert.throws(()=>validateRecordInput({...valid,drinkingDate:'2026-02-30'}));
  assert.throws(()=>validateRecordInput({...valid,rating:'999'}));
  assert.throws(()=>validateRecordInput({...valid,notes:'bad\u0000value'}));
  assert.throws(()=>validateRecordInput({...valid,notes:'x'.repeat(4001)}));
});

test('OAuth scope is limited and tokens are never persisted by Google API layer',()=>{
  const source=readFileSync(new URL('./google.ts', import.meta.url),'utf8');
  assert.match(source,/GOOGLE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.file'/);
  assert.doesNotMatch(source,/localStorage\s*[.\[]|sessionStorage\s*[.\[]/);
  assert.match(source,/valueInputOption=RAW/);
  assert.match(source,/sakefolioApp/);
});
test('index restricts script origins and forbids eval/inline JavaScript',()=>{
  const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
  assert.match(html,/http-equiv="Content-Security-Policy"/);
  assert.match(html,/script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(html,/object-src 'none'/);
  assert.match(html,/base-uri 'none'/);
  assert.doesNotMatch(html,/unsafe-inline|unsafe-eval/);
});
