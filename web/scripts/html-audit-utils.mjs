// Parse untrusted third-party HTML without regex-based tag stripping.
// Only extract inert text/attributes. Never execute remote markup.
import {parse} from 'parse5';

export function parseDocument(html) {
  return parse(String(html ?? ''));
}
export function elements(root, tag) {
  const wanted=tag?.toLowerCase();
  const result=[], pending=[root];
  while(pending.length) {
    const node=pending.pop();
    if (node.tagName && (!wanted||node.tagName===wanted)) result.push(node);
    if (node.content) pending.push(node.content);
    for (const child of node.childNodes || []) pending.push(child);
  }
  return result;
}
export function attribute(node,name) {
  return node.attrs?.find(item=>item.name===name)?.value || '';
}
export function visibleText(node) {
  if(node.nodeName==='#text') return node.value||'';
  if(node.tagName==='script'||node.tagName==='style') return '';
  return (node.childNodes||[]).map(visibleText).join(' ');
}
export function rawScriptText(script) {
  return (script.childNodes||[]).filter(child=>child.nodeName==='#text').map(child=>child.value||'').join('');
}
export function plainHtmlText(html,limit=100000) {
  return visibleText(parseDocument(html)).replace(/\s+/g,' ').trim().slice(0,limit);
}
