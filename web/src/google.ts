import type { Brand, RecordEntry, RevocationResponse, StorageInfo, TokenResponse } from './types';
import { detectPhotoType, validateRecordInput, verifyPhoto } from './security';

/**
 * The only OAuth scope requested. No refresh token, client secret, or user file
 * contents are stored on our servers. Access tokens live only in React memory.
 */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const TABLE_HEADERS: Record<string, string[]> = {
  Brands: ['brandId','brandName','breweryName','prefecture','breweryId','areaId','source','sakenowaBrandId','createdAt','updatedAt','municipality','breweryAddress'],
  Bottles: ['bottleId','brandId','productName','sakeType','processingStyle','riceVariety','polishingRatio','alcoholPercent','vintage','notes','createdAt','updatedAt','sakeTypeOther','brewingMethod','heatTreatment'],
  Reviews: ['reviewId','brandId','bottleId','drinkingDate','rating','aromaTagIds','tasteTagIds','sweetDry','lightRich','acidity','umami','comment','drinkingPlace','priceJPY','createdAt','updatedAt','brandName','breweryName','prefecture','municipality','breweryAddress','productName','sakeType','sakeTypeOther','brewingMethod','heatTreatment','processingStyles','riceVariety','polishingRatio','alcoholPercent','vintage','photoId'],
  Photos: ['photoId','reviewId','imageFile','photoType','caption','capturedAt','aiStatus'],
  Tags: ['tagId','category','tagGroup','tagLabel','displayOrder','isActive'],
  Wishlist: ['wishlistId','brandId','bottleId','wishNote','priority','status','addedAt','updatedAt']
};

function extractError(_json: unknown, status: number): Error {
  if (status === 401) return new Error('Google認証の有効期限が切れました。再度接続してください。');
  if (status === 403) return new Error('権限が不足しています。Google CloudのDrive API・Sheets APIと認可設定を確認してください。');
  if (status === 404) return new Error('ファイルが存在しないか、このアカウントから参照できません (HTTP 404)。');
  return new Error('Google APIエラー (HTTP ' + status + ')。通信を確認して再試行してください。');
}
async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal || AbortSignal.timeout(45000),
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(init.body && !(init.body instanceof Blob) ? {'Content-Type': 'application/json'} : {}),
      ...(init.headers || {})
    }
  }).catch(() => { throw new Error('通信エラー。接続を確認して再試行してください。'); });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw extractError(body, response.status);
  }
  return response.json() as Promise<T>;
}
export async function requestGoogleAccess(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_IDが設定されていません。web/README.mdを確認してください。');
  if (!window.google?.accounts?.oauth2) throw new Error('Google認証スクリプトの読込が終わっていません。通信を確認して再試行してください。');
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      include_granted_scopes: false,
      callback: (response: TokenResponse) => {
        if (settled) return;
        settled = true;
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || response.error || 'Google認証が完了しませんでした。'));
      },
      error_callback: () => rejectOnce(new Error('Google認証が中断されました。'))
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}
export function revokeAccess(token: string): Promise<RevocationResponse> {
  const revoke = typeof window === 'undefined' ? undefined : window.google?.accounts.oauth2.revoke;
  if (!revoke) return Promise.resolve({successful:false,error:'unavailable'});
  return new Promise(resolve => {
    let settled=false;
    const finish=(result:RevocationResponse)=>{
      if(settled)return;
      settled=true;clearTimeout(watchdog);resolve(result);
    };
    // GIS callbacks sometimes never arrive. A timeout must never count as success.
    const watchdog=setTimeout(()=>finish({successful:false,error:'timeout'}),10000);
    try { revoke(token,response=>finish(response?.successful===true?{successful:true}:{successful:false,error:typeof response?.error==='string'?response.error:'unconfirmed'})); }
    catch { finish({successful:false,error:'unavailable'}); }
  });
}
const APP_MARKER = 'sakefolio-react-v1';
type FileKind = 'root' | 'photos-folder' | 'spreadsheet' | 'photo';
const metadata = (kind: FileKind) => ({appProperties: {sakefolioApp: APP_MARKER, sakefolioKind:kind}});
interface DriveFile { id: string; name?: string; mimeType?: string }
export interface DriveAccount { emailAddress:string; displayName:string }
export async function getDriveAccount(token: string): Promise<DriveAccount> {
  const info = await api<{user?: DriveAccount}>(token,
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)');
  if (!info.user?.emailAddress) throw new Error('Googleアカウントの本人確認情報を取得できません。');
  return info.user;
}
async function findFile(token: string, name: string, parentId: string, mimeType: string, kind: FileKind): Promise<DriveFile | undefined> {
  const safe = (x: string) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = [
    "trashed = false",
    ...(parentId ? ["'" + safe(parentId) + "' in parents"] : []),
    "mimeType = '" + safe(mimeType) + "'",
    "appProperties has { key='sakefolioApp' and value='" + APP_MARKER + "' }",
    "appProperties has { key='sakefolioKind' and value='" + kind + "' }"
  ].filter(Boolean).join(' and ');
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q, fields: 'nextPageToken,files(id,name,mimeType)', pageSize: '100'
  }).toString();
  const result = await api<{files: DriveFile[]}>(token, url);
  if ((result.files?.length || 0) > 1) throw new Error('同じ役割のSakefolio保存先（'+name+'）が複数あります。自動的に選ばず、管理者が確認してください。');
  return result.files?.[0];
}
async function createFile(token: string, metadata: Record<string, unknown>): Promise<DriveFile> {
  return api<DriveFile>(token, 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType', {
    method: 'POST', body: JSON.stringify(metadata)
  });
}
async function initializeSpreadsheet(token: string, id: string): Promise<void> {
  const spreadsheet = await api<{sheets: {properties: {sheetId: number, title: string}}[]}>(token,
    'https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=sheets(properties(sheetId,title))');
  const first = spreadsheet.sheets[0]?.properties;
  if (!first) throw new Error('作成したスプレッドシートにシートがありません。');
  const names = Object.keys(TABLE_HEADERS);
  const existing = new Set(spreadsheet.sheets.map(x => x.properties.title));
  const requests: Record<string, unknown>[] = [];
  if (first.title !== 'Brands' && !existing.has('Brands')) {
    requests.push({updateSheetProperties: {properties: {sheetId: first.sheetId, title: 'Brands'}, fields: 'title'}});
    existing.add('Brands');
  }
  names.forEach(name => { if (!existing.has(name)) requests.push({addSheet: {properties: {title: name}}}); });
  if (requests.length) {
    await api(token, 'https://sheets.googleapis.com/v4/spreadsheets/' + id + ':batchUpdate',
      {method:'POST',body:JSON.stringify({requests})});
  }
  const data = [];
  for (const name of names) {
    const current = await getRows(token,id,name,'A1:AZ1');
    if (!current.length) data.push({range:"'"+name+"'!A1",values:[TABLE_HEADERS[name]]});
  }
  if (!data.length) return;
  await api(token, 'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values:batchUpdate',
    {method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
}
/** Creates/reuses only files available to drive.file. Never overwrites old data. */
export async function ensureStorage(token: string): Promise<StorageInfo> {
  const folderMime = 'application/vnd.google-apps.folder';
  const sheetMime = 'application/vnd.google-apps.spreadsheet';
  let folder = await findFile(token, 'Sakefolio', '', folderMime, 'root');
  if (!folder) folder = await createFile(token,{name:'Sakefolio',mimeType:folderMime,...metadata('root')});
  let photos = await findFile(token,'Photos',folder.id,folderMime,'photos-folder');
  if (!photos) photos = await createFile(token,{name:'Photos',mimeType:folderMime,parents:[folder.id],...metadata('photos-folder')});
  let spreadsheet = await findFile(token,'Sakefolio_Data',folder.id,sheetMime,'spreadsheet');
  if (!spreadsheet) spreadsheet = await createFile(token,{name:'Sakefolio_Data',mimeType:sheetMime,parents:[folder.id],...metadata('spreadsheet')});
  // Validate known schema. Only initialize an empty/partially created app-owned workbook;
  // never rewrite the headings of a populated workbook.
  const structure = await api<{sheets:{properties:{sheetId:number,title:string}}[]}>(token,
    'https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheet.id+'?fields=sheets(properties(sheetId,title))');
  const allTitles = new Set(structure.sheets.map(item => item.properties.title));
  let needsSetup = Object.keys(TABLE_HEADERS).some(table=>!allTitles.has(table));
  if (!needsSetup) {
    for (const [table, expected] of Object.entries(TABLE_HEADERS)) {
      const cells = await getRows(token,spreadsheet.id,table,'A1:AZ1');
      const current = cells[0] || [];
      if (current.length === 0) { needsSetup = true; continue; }
      if (expected.some((name,index) => current[index] !== name))
        throw new Error('保存先の「'+table+'」の列構造が変わっています。データ保護のため書き込みを中止しました。');
    }
  }
  if (needsSetup) {
    // Guard every populated sheet before filling missing tabs/headers.
    for (const [table,expected] of Object.entries(TABLE_HEADERS)) {
      if (!allTitles.has(table)) continue;
      const current = (await getRows(token,spreadsheet.id,table,'A1:AZ1'))[0] || [];
      if (current.length && expected.some((name,index)=>current[index]!==name))
        throw new Error('保存先の「'+table+'」が予期しない形式のため初期化を中止しました。');
    }
    await initializeSpreadsheet(token,spreadsheet.id);
  }
  return {folderId:folder.id,photoFolderId:photos.id,spreadsheetId:spreadsheet.id};
}
async function getRows(token: string, id: string, table: string, range?: string): Promise<string[][]> {
  const encoded = encodeURIComponent("'" + table + "'!" + (range || 'A1:AZ'));
  const value = await api<{values?: string[][]}>(token,
    'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + encoded);
  return value.values || [];
}
async function appendRow(token: string, id: string, table: string, fields: Record<string,string>): Promise<void> {
  const header = TABLE_HEADERS[table];
  if (!header) throw new Error('不明な保存先テーブル: ' + table);
  await api(token,'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' +
    encodeURIComponent("'" + table + "'!A:AZ") +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method:'POST',body:JSON.stringify({values:[header.map(key => fields[key] || '')]})
    });
}
export async function loadRecords(token: string, storage: StorageInfo): Promise<RecordEntry[]> {
  const rows = await getRows(token,storage.spreadsheetId,'Reviews');
  if (!rows.length) return [];
  const headers = rows[0];
  const records = rows.slice(1).filter(row => row[0]);
  return records.map(row => ({
    ...(Object.fromEntries(TABLE_HEADERS.Reviews.map(field => [field, String(row[headers.indexOf(field)] || '')])) as unknown as RecordEntry),
    notes: String(row[headers.indexOf('comment')] || '')
  })).sort((a,b) => b.drinkingDate.localeCompare(a.drinkingDate));
}
export async function loadManualBrands(token: string, storage: StorageInfo): Promise<Brand[]> {
  const rows = await getRows(token,storage.spreadsheetId,'Brands','A1:L');
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.length && r[0]).map(row => ({
    brandId: String(row[headers.indexOf('brandId')] || ''),
    brandName: String(row[headers.indexOf('brandName')] || ''),
    breweryName: String(row[headers.indexOf('breweryName')] || ''),
    prefecture: String(row[headers.indexOf('prefecture')] || ''),
    municipality: String(row[headers.indexOf('municipality')] || ''),
    breweryAddress: String(row[headers.indexOf('breweryAddress')] || '')
  }));
}
export async function uploadPhoto(token: string, folderId: string, file: File, id?: string, reviewId?: string): Promise<string> {
  const verified = await verifyPhoto(file);
  const boundary = 'sakefolio_' + crypto.randomUUID().replace(/-/g,'');
  // Generated name and content type derive from verified magic bytes, not user input.
  const name = crypto.randomUUID() + '.' + verified.extension;
  const photoMetadata = {id,name,parents:[folderId],description:'Sakefolio private label photo',
    appProperties:{...metadata('photo').appProperties,...(reviewId ? {reviewId} : {})}};
  const delimiter = '\r\n--' + boundary + '\r\n';
  const body = new Blob([
    '--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(photoMetadata),
    delimiter,
    'Content-Type: ' + verified.mime + '\r\n\r\n',
    file,
    '\r\n--' + boundary + '--'
  ]);
  const result = await api<{id:string}>(token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method:'POST', headers: {'Content-Type':'multipart/related; boundary=' + boundary}, body
    });
  if (!result.id) throw new Error('写真保存後のファイルIDを取得できませんでした。');
  return result.id;
}
/** Refuse IDs from spreadsheet text unless they still designate an app-owned
 * photo in the current Sakefolio photo folder. Never download arbitrary Drive files.
 * A Sheet cell is untrusted even when read through the user's own OAuth token.
 */
export async function getPhotoBlob(token: string, id: string, expectedFolderId?: string): Promise<Blob> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id))
    throw new Error('写真IDが正しい形式ではありません。');
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id);
  const meta=await api<{id?:string;mimeType?:string;parents?:string[];trashed?:boolean;
    appProperties?:Record<string,string>}>(token,url+'?fields=id,mimeType,parents,trashed,appProperties');
  if (meta.id!==id||meta.trashed===true||
    meta.appProperties?.sakefolioApp!==APP_MARKER||meta.appProperties?.sakefolioKind!=='photo'||
    (expectedFolderId&&!meta.parents?.includes(expectedFolderId)))
    throw new Error('指定されたファイルはSakefolioが管理する写真ではありません。');
  // The app never creates active-content MIME types.
  if (!meta.mimeType||!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif'].includes(meta.mimeType))
    throw new Error('写真のMIMEタイプが許可されていません。');
  const response=await fetch(url+'?alt=media',{
    signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token}
  }).catch(()=>{throw new Error('写真の通信エラー。接続を確認してください。');});
  if (!response.ok) throw extractError(undefined,response.status);
  const contentLength=Number(response.headers.get('Content-Length')||'0');
  if(contentLength>10*1024*1024)throw new Error('写真の容量が制限を超えています。');
  const blob=await response.blob();
  const verified=blob.size&&blob.size<=10*1024*1024?
    detectPhotoType(new Uint8Array(await blob.slice(0,32).arrayBuffer())):null;
  if(!verified||(verified.mime!==meta.mimeType &&
    !(verified.mime==='image/heic'&&meta.mimeType==='image/heif') &&
    !(verified.mime==='image/heif'&&meta.mimeType==='image/heic')))
    throw new Error('保存された写真が未対応の形式、またはMIMEタイプと不一致です。');
  // Safe, verified MIME is assigned explicitly instead of trusting response headers.
  return blob.type===verified.mime?blob:new Blob([blob],{type:verified.mime});
}
export interface SaveAttempt {
  reviewId: string;
  brandId?: string;
  photoFileId?: string;
  startedAt?: string;
}
const activeSaves = new Set<string>();

/** Read before append: a retry reconciles an uncertain response instead of repeating a write.
 * Conflicting rows are never overwritten. This is not a distributed transaction/lock.
 */
async function ensureRow(token: string, storage: StorageInfo, table: string, fields: Record<string,string>): Promise<void> {
  const rows = await getRows(token,storage.spreadsheetId,table);
  const key = TABLE_HEADERS[table][0];
  const matches = rows.slice(1).filter(row => row[0] === fields[key]);
  if (matches.length > 1) throw new Error(table+'に同じIDが複数あります。自動変更せず確認してください。');
  if (matches.length) {
    if (TABLE_HEADERS[table].some((name,index) => String(matches[0][index] || '') !== (fields[name] || '')))
      throw new Error(table+'の保存済み内容と一致しません。データ保護のため停止しました。');
    return;
  }
  await appendRow(token,storage.spreadsheetId,table,fields);
  const confirmed = (await getRows(token,storage.spreadsheetId,table)).slice(1).filter(row=>row[0]===fields[key]);
  if (confirmed.length !== 1 || TABLE_HEADERS[table].some((name,index)=>String(confirmed[0][index] || '') !== (fields[name] || '')))
    throw new Error(table+'への書き込み結果を確認できません。');
}
export async function saveRecord(
  token: string, storage: StorageInfo, entry: RecordEntry, knownBrands: Brand[], photo: File | null,
  attempt: SaveAttempt = {reviewId: crypto.randomUUID()}
): Promise<string> {
  const key = storage.spreadsheetId+':'+attempt.reviewId;
  if (activeSaves.has(key)) throw new Error('この記録は保存処理中です。');
  activeSaves.add(key);
  let stage = '入力確認';
  try {
    validateRecordInput(entry);
    if (photo) await verifyPhoto(photo);
    stage = '保存先の列確認';
    for (const table of ['Brands','Bottles','Reviews','Photos']) {
      const current = (await getRows(token,storage.spreadsheetId,table,'A1:AZ1'))[0] || [];
      if (TABLE_HEADERS[table].some((name,index) => current[index] !== name))
        throw new Error('保存先の「'+table+'」の列構造が変わっています。データ保護のため書き込みを中止しました。');
    }
    const now = attempt.startedAt ||= new Date().toISOString();
    const brandId = attempt.brandId ||= entry.brandId ||
      knownBrands.find(b => b.brandName === entry.brandName && b.breweryName === entry.breweryName)?.brandId ||
      'manual-'+attempt.reviewId;
    stage = '銘柄保存';
    if (brandId.startsWith('manual-') && !knownBrands.some(b => b.brandId === brandId)) {
      await ensureRow(token,storage,'Brands',{
        brandId,brandName:entry.brandName,breweryName:entry.breweryName,
        prefecture:entry.prefecture,municipality:entry.municipality,
        breweryAddress:entry.breweryAddress,source:'manual',createdAt:now,updatedAt:now
      });
    }
    // An immutable product snapshot per review also avoids conflating different brewing methods.
    const bottleId = attempt.reviewId+'-bottle';
    stage = '商品保存';
    const bottle = {bottleId,brandId,productName:entry.productName || entry.brandName,
      sakeType:entry.sakeType,sakeTypeOther:entry.sakeTypeOther,
      processingStyle:entry.processingStyles,brewingMethod:entry.brewingMethod,
      heatTreatment:entry.heatTreatment,riceVariety:entry.riceVariety,
      polishingRatio:entry.polishingRatio,alcoholPercent:entry.alcoholPercent,
      vintage:entry.vintage,createdAt:now,updatedAt:now};
    await ensureRow(token,storage,'Bottles',bottle);
    let photoId = '';
    if (photo) {
      stage = '写真IDの予約';
      if (!attempt.photoFileId) {
        const reserved = await api<{ids:string[]}>(token,'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');
        if (!reserved.ids?.[0]) throw new Error('写真IDを予約できませんでした。');
        attempt.photoFileId = reserved.ids[0];
      }
      photoId = attempt.photoFileId;
      stage = '写真アップロード';
      // Only an explicit 404 permits creating the reserved ID; auth/network errors stop safely.
      const url = 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(photoId)+'?fields=id,parents,appProperties';
      const response = await fetch(url,{signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token}})
        .catch(() => { throw new Error('写真確認中の通信エラー。再試行してください。'); });
      if (response.status === 404) await uploadPhoto(token,storage.photoFolderId,photo,photoId,attempt.reviewId);
      else {
        if (!response.ok) throw extractError(undefined,response.status);
        const found = await response.json() as {parents?:string[];appProperties?:Record<string,string>};
        if (!found.parents?.includes(storage.photoFolderId) ||
          found.appProperties?.sakefolioApp!==APP_MARKER||found.appProperties?.sakefolioKind!=='photo'||
          found.appProperties?.reviewId !== attempt.reviewId)
          throw new Error('写真の保存先または記録IDが一致しません。');
      }
      stage = '写真の再取得確認';
      await getPhotoBlob(token,photoId);
      stage = '写真情報保存';
      await ensureRow(token,storage,'Photos',{
        photoId:attempt.reviewId+'-photo',reviewId:attempt.reviewId,imageFile:photoId,
        photoType:'表ラベル',capturedAt:now,aiStatus:'未解析'
      });
    }
    const review = {...entry,reviewId:attempt.reviewId,brandId,bottleId,photoId,comment:entry.notes,createdAt:now,updatedAt:now};
    stage = '飲酒記録保存';
    await ensureRow(token,storage,'Reviews',review);
    stage = '書き込み結果の再取得確認';
    for (const [table,fields] of [['Bottles',bottle],['Reviews',review]] as const) {
      const rows = await getRows(token,storage.spreadsheetId,table);
      const found = rows.slice(1).filter(row=>row[0] === fields[TABLE_HEADERS[table][0] as keyof typeof fields]);
      if (found.length !== 1 || TABLE_HEADERS[table].some((name,index)=>String(found[0][index] || '') !== (fields[name as keyof typeof fields] || '')))
        throw new Error(table+'への書き込み結果を確認できません。');
    }
    return attempt.reviewId;
  } catch (error) {
    // Do not include upstream response bodies, credentials, filenames or user text.
    throw new Error(stage+'：'+(error instanceof Error ? error.message : '保存に失敗しました。')+
      ' 完了は未確認です。同じ画面の保存ボタンで再確認・再開できます。');
  } finally { activeSaves.delete(key); }
}

/** Read-only diagnostics. Never delete/overwrite existing data to repair a partial save. */
export async function inspectStorage(token: string, storage: StorageInfo): Promise<string> {
  const [reviews,photos,bottles] = await Promise.all(['Reviews','Photos','Bottles'].map(table=>getRows(token,storage.spreadsheetId,table)));
  const reviewIds = new Set(reviews.slice(1).map(r=>r[0]).filter(Boolean));
  const usedBottles = new Set(reviews.slice(1).map(r=>r[2]));
  const photoLinks = photos.slice(1).filter(r=>r[0]);
  const photoIds = new Set(photoLinks.map(r=>r[2]));
  const files: {id:string}[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({q:"trashed = false and '"+storage.photoFolderId.replace(/'/g,"\\'")+"' in parents",fields:'nextPageToken,files(id)',pageSize:'1000',...(pageToken ? {pageToken} : {})});
    const page = await api<{files:{id:string}[];nextPageToken?:string}>(token,'https://www.googleapis.com/drive/v3/files?'+query);
    files.push(...(page.files || []));pageToken = page.nextPageToken || '';
  } while (pageToken);
  const fileIds = new Set(files.map(f=>f.id));
  const missing = photoLinks.filter(r=>!fileIds.has(r[2])).length;
  const orphan = files.filter(f=>!photoIds.has(f.id)).length;
  const incomplete = photoLinks.filter(r=>!reviewIds.has(r[1])).length;
  const missingLinks = reviews.slice(1).filter(r=>r[31] && !photoLinks.some(p=>p[1]===r[0] && p[2]===r[31])).length;
  const unusedBottles = bottles.slice(1).filter(r=>r[0] && !usedBottles.has(r[0])).length;
  return '保存先確認：記録 '+reviewIds.size+'件、写真情報 '+photoLinks.length+'件。写真ファイル不足 '+missing+'件、未紐付け画像 '+orphan+'件、記録未完了の写真情報 '+incomplete+'件、写真情報不足 '+missingLinks+'件、未紐付け商品 '+unusedBottles+'件。データは変更していません。';
}
