import type { Brand, RecordEntry, StorageInfo, TokenResponse } from './types';

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

function extractError(json: unknown, status: number): Error {
  const body = json as { error?: { message?: string } } | undefined;
  if (status === 401) return new Error('Google認証の有効期限が切れました。再度接続してください。');
  if (status === 403) return new Error('権限が不足しています。Google CloudのDrive API・Sheets APIと認可設定を確認してください。');
  return new Error(body?.error?.message || 'Google APIエラー (HTTP ' + status + ')');
}
async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(init.body && !(init.body instanceof Blob) ? {'Content-Type': 'application/json'} : {}),
      ...(init.headers || {})
    }
  });
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
export function revokeAccess(token: string) {
  window.google?.accounts.oauth2.revoke(token, () => undefined);
}
interface DriveFile { id: string; name?: string; mimeType?: string }
async function findFile(token: string, name: string, parentId?: string, mimeType?: string): Promise<DriveFile | undefined> {
  const safe = (x: string) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = [
    "name = '" + safe(name) + "'",
    "trashed = false",
    parentId ? "'" + safe(parentId) + "' in parents" : '',
    mimeType ? "mimeType = '" + safe(mimeType) + "'" : ''
  ].filter(Boolean).join(' and ');
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q, fields: 'nextPageToken,files(id,name,mimeType)', pageSize: '100'
  }).toString();
  const result = await api<{files: DriveFile[]}>(token, url);
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
  const data = names.map(name => ({range: "'" + name + "'!A1", values: [TABLE_HEADERS[name]]}));
  await api(token, 'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values:batchUpdate',
    {method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
}
/** Creates/reuses only files available to drive.file. Never overwrites old data. */
export async function ensureStorage(token: string): Promise<StorageInfo> {
  const folderMime = 'application/vnd.google-apps.folder';
  const sheetMime = 'application/vnd.google-apps.spreadsheet';
  let folder = await findFile(token, 'Sakefolio', undefined, folderMime);
  if (!folder) folder = await createFile(token, {name:'Sakefolio',mimeType:folderMime});
  let photos = await findFile(token,'Photos',folder.id,folderMime);
  if (!photos) photos = await createFile(token,{name:'Photos',mimeType:folderMime,parents:[folder.id]});
  let spreadsheet = await findFile(token,'Sakefolio_Data',folder.id,sheetMime);
  if (!spreadsheet) {
    spreadsheet = await createFile(token,{name:'Sakefolio_Data',mimeType:sheetMime,parents:[folder.id]});
    await initializeSpreadsheet(token,spreadsheet.id);
  }
  // A failed initialization can leave an empty file; re-check basic headers.
  const preview = await getRows(token,spreadsheet.id,'Reviews', 'A1:B2');
  if (!preview.length || preview[0]?.[0] !== 'reviewId') {
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
    prefecture: String(row[headers.indexOf('prefecture')] || '')
  }));
}
export async function uploadPhoto(token: string, folderId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルのみ保存できます。');
  if (file.size > 10 * 1024 * 1024) throw new Error('写真は10MB以下にしてください。');
  const boundary = 'sakefolio_' + crypto.randomUUID().replace(/-/g,'');
  const name = crypto.randomUUID() + '.' + (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0,8);
  const metadata = {name,parents:[folderId],description:'Sakefolio private label photo'};
  const delimiter = '\r\n--' + boundary + '\r\n';
  const body = new Blob([
    '--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    'Content-Type: ' + file.type + '\r\n\r\n',
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
export async function getPhotoBlob(token: string, id: string): Promise<Blob> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media',
    {headers: {Authorization:'Bearer ' + token}});
  if (!response.ok) throw new Error('写真の読み込みに失敗しました。');
  return response.blob();
}
export async function saveRecord(
  token: string, storage: StorageInfo, entry: RecordEntry, knownBrands: Brand[], photo: File | null
): Promise<void> {
  const now = new Date().toISOString();
  let brandId = entry.brandId;
  if (!brandId) {
    const same = knownBrands.find(b => b.brandName === entry.brandName && b.breweryName === entry.breweryName);
    brandId = same?.brandId || 'manual-' + crypto.randomUUID();
  }
  if (brandId.startsWith('manual-') && !knownBrands.some(b => b.brandId === brandId)) {
    await appendRow(token,storage.spreadsheetId,'Brands',{
      brandId,brandName:entry.brandName,breweryName:entry.breweryName,
      prefecture:entry.prefecture,municipality:entry.municipality,
      breweryAddress:entry.breweryAddress,source:'manual',createdAt:now,updatedAt:now
    });
  }
  const bottleRows = await getRows(token,storage.spreadsheetId,'Bottles','A1:O');
  const bottleHeader = bottleRows[0] || [];
  const matches = bottleRows.slice(1).find(r =>
    r[bottleHeader.indexOf('brandId')] === brandId &&
    r[bottleHeader.indexOf('productName')] === (entry.productName || entry.brandName) &&
    r[bottleHeader.indexOf('sakeType')] === entry.sakeType &&
    r[bottleHeader.indexOf('sakeTypeOther')] === entry.sakeTypeOther &&
    r[bottleHeader.indexOf('processingStyle')] === entry.processingStyles &&
    r[bottleHeader.indexOf('heatTreatment')] === entry.heatTreatment
  );
  const bottleId = matches?.[bottleHeader.indexOf('bottleId')] || crypto.randomUUID();
  if (!matches) await appendRow(token,storage.spreadsheetId,'Bottles',{
    bottleId,brandId,productName:entry.productName || entry.brandName,
    sakeType:entry.sakeType,sakeTypeOther:entry.sakeTypeOther,
    processingStyle:entry.processingStyles,brewingMethod:entry.brewingMethod,
    heatTreatment:entry.heatTreatment,riceVariety:entry.riceVariety,
    polishingRatio:entry.polishingRatio,alcoholPercent:entry.alcoholPercent,
    vintage:entry.vintage,createdAt:now,updatedAt:now
  });
  const photoId = photo ? await uploadPhoto(token,storage.photoFolderId,photo) : '';
  const reviewId = crypto.randomUUID();
  if (photoId) await appendRow(token,storage.spreadsheetId,'Photos',{
    photoId:crypto.randomUUID(),reviewId,imageFile:photoId,photoType:'表ラベル',capturedAt:now,aiStatus:'未解析'
  });
  await appendRow(token,storage.spreadsheetId,'Reviews',{
    ...entry,reviewId,brandId,bottleId,photoId,comment:entry.notes,createdAt:now,updatedAt:now
  });
}
