import { verifyPhoto, MAX_PHOTO_BYTES } from './security.ts';

/** Decode verified raster input, then persist the same portable pixels shown in preview. */
export async function createPhotoPreview(file: File): Promise<Blob> {
  await verifyPhoto(file);
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let close = () => {};
  try {
    const bitmap = await createImageBitmap(file);
    source = bitmap; width = bitmap.width; height = bitmap.height;
    close = () => bitmap.close();
  } catch {
    // Safari may decode HEIC in <img> but not in createImageBitmap.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      source = image; width = image.naturalWidth; height = image.naturalHeight;
      close = () => URL.revokeObjectURL(url);
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('このブラウザで写真を展開できません。JPEGまたはPNGにして選び直してください。');
    }
  }
  try {
    if (!width || !height || width * height > 40_000_000)
      throw new Error('写真は4000万画素以下を選んでください。');
    const scale = Math.min(1, 1600 / Math.max(width,height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('写真のプレビューを作成できません。');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve,reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('写真を変換できません。')), 'image/png');
    });
    if (blob.size > MAX_PHOTO_BYTES) throw new Error('変換後の写真が10MBを超えています。小さい写真を選んでください。');
    return blob;
  } finally { close(); }
}

/** Re-encode before persistence so embedded EXIF/XMP metadata is not retained. */
export async function sanitizePhotoForStorage(file: File): Promise<File> {
  const pixels = await createPhotoPreview(file);
  return new File([pixels], 'sakefolio-label.png', {type:'image/png'});
}
