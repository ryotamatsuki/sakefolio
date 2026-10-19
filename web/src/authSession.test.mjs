import test from 'node:test';
import assert from 'node:assert/strict';
import {broadcastAuthSessionSignal, closeAuthSessionPublisher, configureSecurityAudit, isAuthSessionMessage, listenForAuthSessionSignals, recordAuthAuditEvent} from './authSession.ts';

class FakeBroadcastChannel {
  static channels = [];
  static messages = [];
  onmessage = null;
  closed = false;
  constructor(name) { this.name=name; FakeBroadcastChannel.channels.push(this); }
  postMessage(message) {
    FakeBroadcastChannel.messages.push(structuredClone(message));
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && !channel.closed && channel.name === this.name)
        queueMicrotask(()=>channel.onmessage?.({data:structuredClone(message)}));
    }
  }
  close() { this.closed=true; }
}

test('cross-tab notices contain only a version, event type and correlation ID',async()=>{
  const previous=globalThis.BroadcastChannel;
  const previousWindow=globalThis.window;
  globalThis.window=new EventTarget();
  globalThis.BroadcastChannel=FakeBroadcastChannel;
  FakeBroadcastChannel.channels=[];FakeBroadcastChannel.messages=[];
  const seenA=[],seenB=[];
  const closeA=listenForAuthSessionSignals((type,eventId)=>seenA.push({type,eventId}));
  const closeB=listenForAuthSessionSignals((type,eventId)=>seenB.push({type,eventId}));
  try{
    const eventId=broadcastAuthSessionSignal('logout');
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(seenA,[],'the current tab ignores its own broadcast');
    assert.deepEqual(seenB,[],'the current tab ignores its own broadcast');
    assert.deepEqual(Object.keys(FakeBroadcastChannel.messages[0]).sort(),['eventId','sourceTabId','type','version']);
    assert.equal(isAuthSessionMessage(FakeBroadcastChannel.messages[0]),true);
    assert.equal(isAuthSessionMessage({...FakeBroadcastChannel.messages[0],access_token:'must-not-be-sent'}),false);
    const remote={version:1,type:'logout',eventId:'remote-event',sourceTabId:'another-tab'};
    for(const channel of FakeBroadcastChannel.channels.filter(c=>c.onmessage))channel.onmessage({data:remote});
    assert.deepEqual(seenA,[{type:'logout',eventId:'remote-event'}]);
    assert.deepEqual(seenB,[{type:'logout',eventId:'remote-event'}]);
  }finally{
    closeA();closeB();closeAuthSessionPublisher();globalThis.BroadcastChannel=previous;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
});

test('malformed or token-bearing notices are not accepted as session signals',()=>{
  assert.equal(isAuthSessionMessage({version:1,type:'logout',eventId:'e1',sourceTabId:'tab-a'}),true);
  assert.equal(isAuthSessionMessage({version:1,type:'logout',eventId:'e1',sourceTabId:'tab-a',access_token:'secret'}),false);
  assert.equal(isAuthSessionMessage({version:1,type:'unknown',eventId:'e1'}),false);
  assert.equal(isAuthSessionMessage({version:2,type:'logout',eventId:'e1',sourceTabId:'tab-a'}),false);
  assert.equal(isAuthSessionMessage({version:1,type:'logout',eventId:'',sourceTabId:'tab-a'}),false);
});

test('security audit logs allow only redacted fields even if a caller supplies a token',()=>{
  const original=console.info,lines=[];
  configureSecurityAudit(true);
  console.info=(...args)=>lines.push(args);
  try{
    recordAuthAuditEvent('api-request',{requestId:'req-1',tokenPresent:true,access_token:'credential',url:'https://example.invalid/?token=credential'});
    const rendered=JSON.stringify(lines);
    assert.match(rendered,/req-1/);
    assert.doesNotMatch(rendered,/credential|example\.invalid|access_token/);
  }finally{console.info=original;configureSecurityAudit(false);}
});
