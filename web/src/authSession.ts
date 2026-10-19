export type AuthSessionSignal = 'logout' | 'authorization-invalid';

export interface AuthSessionMessage {
  version: 1;
  type: AuthSessionSignal;
  eventId: string;
  sourceTabId: string;
}

const CHANNEL_NAME = 'sakefolio-auth-session-v1';
const LOCAL_EVENT_NAME = 'sakefolio-auth-session';
let publisher: BroadcastChannel | null = null;
let securityAuditEnabled = false;
const tabId = createId();

export type AuthAuditEvent =
  | 'api-request'
  | 'api-response'
  | 'revoke-request'
  | 'revoke-callback'
  | 'session-cleared';

export interface AuthAuditFields {
  requestId?: string;
  eventId?: string;
  signal?: AuthSessionSignal;
  tokenPresent?: boolean;
  tokenPresentBefore?: boolean;
  tokenPresentAfter?: boolean;
  apiHost?: 'www.googleapis.com' | 'sheets.googleapis.com' | 'other-google-api';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  status?: number;
  outcome?: 'success' | 'failure' | 'timeout' | 'network-error' | 'aborted' | 'unauthorized' | 'unavailable' | 'exception';
  durationMs?: number;
  errorCode?: string;
}

function createId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function configureSecurityAudit(enabled: boolean): void {
  securityAuditEnabled = enabled;
}

/** Sandbox-only, redacted timing logs. Never pass token values, URLs, user text, or response bodies. */
export function recordAuthAuditEvent(event: AuthAuditEvent, fields: AuthAuditFields = {}): void {
  if (!securityAuditEnabled) return;
  const {
    requestId,eventId,signal,tokenPresent,tokenPresentBefore,tokenPresentAfter,
    apiHost,method,status,outcome,durationMs,errorCode
  } = fields;
  console.info('[Sakefolio security-test]', {
    event,
    at: new Date().toISOString(),
    tabId,
    ...(requestId ? {requestId} : {}),
    ...(eventId ? {eventId} : {}),
    ...(signal ? {signal} : {}),
    ...(tokenPresent !== undefined ? {tokenPresent} : {}),
    ...(tokenPresentBefore !== undefined ? {tokenPresentBefore} : {}),
    ...(tokenPresentAfter !== undefined ? {tokenPresentAfter} : {}),
    ...(apiHost ? {apiHost} : {}),
    ...(method ? {method} : {}),
    ...(status !== undefined ? {status} : {}),
    ...(outcome ? {outcome} : {}),
    ...(durationMs !== undefined ? {durationMs} : {}),
    ...(errorCode ? {errorCode} : {})
  });
}

export function isAuthSessionMessage(value: unknown): value is AuthSessionMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AuthSessionMessage>;
  return Object.keys(value).length === 4 &&
    message.version === 1 &&
    (message.type === 'logout' || message.type === 'authorization-invalid') &&
    typeof message.eventId === 'string' && message.eventId.length > 0 && message.eventId.length <= 80 &&
    typeof message.sourceTabId === 'string' && message.sourceTabId.length > 0 && message.sourceTabId.length <= 80;
}

function makeMessage(type: AuthSessionSignal,eventId=createId()): AuthSessionMessage {
  return { version: 1, type, eventId, sourceTabId: tabId };
}

function postMessage(message: AuthSessionMessage): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    publisher ??= new BroadcastChannel(CHANNEL_NAME);
    publisher.postMessage(message);
  } catch {
    // The current tab still clears its own in-memory session if cross-tab messaging is unavailable.
  }
}

/** Close the process-wide publisher when its host is torn down (also useful for isolated tests). */
export function closeAuthSessionPublisher(): void {
  publisher?.close();
  publisher=null;
}

/** Publish a non-secret logout/session-invalid notice to other tabs on this origin. */
export function broadcastAuthSessionSignal(type: AuthSessionSignal,eventId?:string): string {
  const message = makeMessage(type,eventId);
  postMessage(message);
  return message.eventId;
}

/** Notify this tab and other Sakefolio tabs that Google rejected an API request. */
export function notifyAuthSessionSignal(type: AuthSessionSignal): string {
  const message = makeMessage(type);
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME, { detail: message }));
    } catch {
      // Continue to notify other tabs even if this browser lacks CustomEvent support.
    }
  }
  postMessage(message);
  return message.eventId;
}

export function listenForAuthSessionSignals(
  listener: (type: AuthSessionSignal, eventId: string) => void
): () => void {
  const accept = (value: unknown,fromBroadcast=false) => {
    if (isAuthSessionMessage(value) && (!fromBroadcast||value.sourceTabId!==tabId)) listener(value.type, value.eventId);
  };
  const onLocal = (event: Event) => accept((event as CustomEvent<unknown>).detail);
  if (typeof window !== 'undefined') window.addEventListener(LOCAL_EVENT_NAME, onLocal);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = event => accept(event.data,true);
    }
  } catch {
    channel = null;
  }

  return () => {
    if (typeof window !== 'undefined') window.removeEventListener(LOCAL_EVENT_NAME, onLocal);
    channel?.close();
  };
}
