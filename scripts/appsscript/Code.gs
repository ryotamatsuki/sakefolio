/**
 * Sakefolio - さけのわ銘柄マスター更新
 *
 * このコードは、各利用者が所有する Sakefolio Google Spreadsheet の
 * 「拡張機能 > Apps Script」に貼り付けて使用する（バインド型スクリプト）。
 *
 * 公開APIを取得し Brands の公式銘柄だけを追加・更新する。
 * 手入力した銘柄と Reviews / Bottles / Photos / Tags は変更しない。
 *
 * 出典: https://muro.sakenowa.com/sakenowa-data/
 * 帰属表示: https://sakenowa.com
 */
const SAKEFOLIO = Object.freeze({
  BASE_URL: 'https://muro.sakenowa.com/sakenowa-data/api',
  SHEET: 'Brands',
  HEADERS: [
    'brandId', 'brandName', 'breweryName', 'prefecture', 'breweryId',
    'areaId', 'source', 'sakenowaBrandId', 'createdAt', 'updatedAt'
  ],
  CHUNK_ROWS: 500
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sakefolio')
    .addItem('テンプレート構造を確認', 'validateSakefolioTemplate')
    .addItem('さけのわ銘柄マスターを更新', 'refreshSakenowaBrands')
    .addToUi();
}

/** 実行前に5テーブルと列名が存在するかを確認する。 */
function validateSakefolioTemplate() {
  const ss = getSpreadsheet_();
  ['Brands', 'Bottles', 'Reviews', 'Photos', 'Tags'].forEach(name => {
    if (!ss.getSheetByName(name)) throw new Error('Missing sheet: ' + name);
  });
  const sheet = ss.getSheetByName(SAKEFOLIO.SHEET);
  const actual = sheet.getRange(1, 1, 1, SAKEFOLIO.HEADERS.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(SAKEFOLIO.HEADERS)) {
    throw new Error('Brands のヘッダーが違います。既存の列は勝手に変更しないでください。');
  }
  const tagSheet = ss.getSheetByName('Tags');
  if (tagSheet.getLastRow() < 2) throw new Error('Tags が空です');
  const msg = 'Sakefolio: 5テーブル、Brandsヘッダー、タグの存在を確認しました。';
  Logger.log(msg);
  return msg;
}

/**
 * ブランドIDは sw-<さけのわのブランドID>。
 * 既存の手入力銘柄と、参照中の旧ブランドIDは削除しない。
 * すべての取得・検証に成功してから Brands シートに反映する。
 */
function refreshSakenowaBrands() {
  validateSakefolioTemplate();
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SAKEFOLIO.SHEET);

    // 完全なAPIレスポンスを検証してからシートの書換えを開始。
    const areasResponse = fetchSakenowa_('areas');
    const breweriesResponse = fetchSakenowa_('breweries');
    const brandsResponse = fetchSakenowa_('brands');
    const areas = checkArray_(areasResponse, 'areas');
    const breweries = checkArray_(breweriesResponse, 'breweries');
    const brands = checkArray_(brandsResponse, 'brands');
    if (brands.length < 1) throw new Error('銘柄が0件。シートを変更せず終了します。');

    const areaNames = new Map(areas.map(x => [String(x.id), String(x.name || '')]));
    const breweryMap = new Map(breweries.map(x => [String(x.id), x]));
    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, SAKEFOLIO.HEADERS.length).getValues()
      : [];
    const existingById = new Map();
    const manualRows = [];
    const oldOfficialRows = new Map();

    for (const row of existing) {
      const id = String(row[0] || '').trim();
      if (!id) continue;
      if (existingById.has(id)) throw new Error('重複キー検出: ' + id);
      existingById.set(id, row);
      const isOfficial = String(row[6] || '') === 'sakenowa' || /^sw-\d+$/.test(id);
      if (isOfficial) oldOfficialRows.set(id, row);
      else manualRows.push(row);
    }

    const now = new Date();
    const refreshed = new Map();
    for (const brand of brands) {
      const originalId = String(brand.id == null ? '' : brand.id);
      const name = String(brand.name || '').trim();
      if (!/^\d+$/.test(originalId) || !name) {
        throw new Error('不正な銘柄APIレコード: ' + JSON.stringify(brand));
      }
      const key = 'sw-' + originalId;
      if (refreshed.has(key)) throw new Error('APIに重複銘柄ID: ' + key);
      const breweryId = brand.breweryId == null ? '' : String(brand.breweryId);
      const brewery = breweryId ? breweryMap.get(breweryId) : null;
      const areaId = brewery && brewery.areaId != null ? String(brewery.areaId) : '';
      const old = existingById.get(key);
      refreshed.set(key, [
        key,
        name,
        brewery ? String(brewery.name || '') : '',
        areaId ? (areaNames.get(areaId) || '') : '',
        breweryId,
        areaId,
        'sakenowa',
        originalId,
        old && old[8] ? old[8] : now,
        now
      ]);
    }

    // APIから消えた旧銘柄も残して、既存レビューのRefを壊さない。
    for (const [key, row] of oldOfficialRows) {
      if (!refreshed.has(key)) refreshed.set(key, row);
    }
    const officialRows = Array.from(refreshed.values())
      .sort((a,b) => String(a[1]).localeCompare(String(b[1]), 'ja'));
    const allRows = officialRows.concat(manualRows);
    if (allRows.length === 0) throw new Error('空データの書込みは禁止です');

    // 事前に全データを構築してから Brands のみ置換。
    // 他の4テーブルは変更しない。
    if (sheet.getMaxRows() < allRows.length + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), allRows.length + 1 - sheet.getMaxRows());
    }
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, SAKEFOLIO.HEADERS.length).clearContent();
    }
    for (let i = 0; i < allRows.length; i += SAKEFOLIO.CHUNK_ROWS) {
      const chunk = allRows.slice(i, i + SAKEFOLIO.CHUNK_ROWS);
      sheet.getRange(i + 2, 1, chunk.length, SAKEFOLIO.HEADERS.length).setValues(chunk);
    }
    SpreadsheetApp.flush();
    const result = {
      official: officialRows.length,
      manual: manualRows.length,
      written: allRows.length,
      updatedAt: now.toISOString()
    };
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('必ずGoogle Sheetsの拡張機能 > Apps Scriptから実行してください。');
  return ss;
}

function fetchSakenowa_(path) {
  const response = UrlFetchApp.fetch(SAKEFOLIO.BASE_URL + '/' + path, {
    method: 'get', muteHttpExceptions: true, followRedirects: true,
    headers: { Accept: 'application/json' }
  });
  const status = response.getResponseCode();
  if (status !== 200) throw new Error(path + ': HTTP ' + status);
  let parsed;
  try { parsed = JSON.parse(response.getContentText('UTF-8')); }
  catch (err) { throw new Error(path + ': JSON parse failed: ' + err.message); }
  return parsed;
}

function checkArray_(obj, key) {
  if (!obj || !Array.isArray(obj[key])) throw new Error('API構造が不正: ' + key);
  return obj[key];
}
