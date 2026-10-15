import { verifyPhoto } from './security';

/** Preview only decoder-produced pixels; never render an arbitrary uploaded document. */
export async function createPhotoPreview(file: File): Promise<Blob> {
  await verifyPhoto(file);
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('プレビューできる画像サイズを超えています。');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('写真のプレビューを作成できません。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve,reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('写真を変換できません。')), 'image/png');
    });
  } finally { bitmap.close(); }
}
