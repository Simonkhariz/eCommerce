/**
 * Shrink admin photo uploads in the browser before they are sent: resize to at most
 * MAX_EDGE pixels on the longest side and re-encode as WebP. A 4–8 MB phone photo usually
 * becomes 150–400 KB, so product, category and banner images load fast for customers.
 * Re-encoding also drops camera metadata (location, device) from the file.
 *
 * Falls back to the original file whenever conversion is not possible or not smaller, so an
 * upload never fails because of this step (the server still checks type and size).
 */

const MAX_EDGE = 1800;
const WEBP_QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Applies the photo's EXIF rotation, so portrait phone shots stay upright.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img> decoding.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function optimizeImageForUpload(file: File): Promise<File> {
  if (typeof document === 'undefined' || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  try {
    const source = await decode(file);
    const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ('close' in source) source.close();

    const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
    // Some browsers cannot encode WebP and silently return PNG instead: keep the original then.
    if (!blob || blob.type !== 'image/webp') return file;
    if (blob.size >= file.size && scale === 1) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}
