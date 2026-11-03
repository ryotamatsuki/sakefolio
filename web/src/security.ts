/** Security checks deliberately independent of Google and React, suitable for Node tests. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 4000;
export type PhotoKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/avif';
export interface VerifiedPhoto { mime: PhotoKind; extension: 'jpg' | 'png' | 'webp' | 'heic' | 'heif' | 'avif' }

const knownMimes: Record<PhotoKind,string> = {
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
  'image/heic':'heic','image/heif':'heif','image/avif':'avif'
};
const text = (bytes: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...bytes.slice(start,start+len));
/** Trust magic bytes, never filename suffix or the browser-reported MIME alone. */
export function detectPhotoType(bytes: Uint8Array): VerifiedPhoto | null {
  if (bytes.length < 12) return null;
  const b = bytes;
  let mime: PhotoKind | null = null;
  if (b[0]===0xff && b[1]===0xd8 && b[2]===0xff) mime='image/jpeg';
  else if (b[0]===0x89 && text(b,1,3)==='PNG' && b[4]===13 && b[5]===10 && b[6]===26 && b[7]===10) mime='image/png';
  else if (text(b,0,4)==='RIFF' && text(b,8,4)==='WEBP') mime='image/webp';
  else if (text(b,4,4)==='ftyp') {
    const brand = text(b,8,4);
    if (brand==='avif' || brand==='avis') mime='image/avif';
    else if (['heic','heix','hevc','hevx'].includes(brand)) mime='image/heic';
    else if (['mif1','msf1'].includes(brand)) mime='image/heif';
  }
  return mime ? {mime,extension:knownMimes[mime] as VerifiedPhoto['extension']} : null;
}
export async function verifyPhoto(file: File): Promise<VerifiedPhoto> {
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) throw new Error('写真は10MB以下の画像を選んでください。');
  const header = new Uint8Array(await file.slice(0,32).arrayBuffer());
  const verified = detectPhotoType(header);
  if (!verified) throw new Error('写真の形式を確認できません。JPEG、PNG、WebP、HEIC、HEIF、AVIFを選んでください。');
  const claimed = file.type.toLowerCase().trim();
  if (claimed && claimed !== verified.mime &&
    !(verified.mime==='image/heic' && claimed==='image/heif') &&
    !(verified.mime==='image/heif' && claimed==='image/heic')) {
    throw new Error('画像の内容とファイル形式の表示が一致しません。');
  }
  return verified;
}
export function validateRecordInput(data: {
  brandName:string;breweryName:string;drinkingDate:string;rating:string;
}): void {
  if (!data.brandName.trim() || !data.breweryName.trim()) throw new Error('酒蔵名と銘柄名を入力してください。');
  for (const [field,value] of Object.entries(data as Record<string,string>)) {
    if (typeof value !== 'string') throw new Error('記録形式が不正です。');
    if (value.length > MAX_TEXT_LENGTH) throw new Error(field+'が長すぎます（最大4000文字）。');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new Error('入力に利用できない制御文字が含まれています。');
  }
  if (!/^[1-5]$/.test(data.rating)) throw new Error('評価は1～5を選択してください。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.drinkingDate)) throw new Error('飲酒日が正しくありません。');
  const date = new Date(data.drinkingDate+'T12:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==data.drinkingDate)
    throw new Error('存在しない飲酒日です。');
}
