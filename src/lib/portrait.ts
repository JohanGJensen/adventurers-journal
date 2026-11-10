// Character portraits: an image file scaled to a small square data URL. The app's content security policy only
// shows local and data: images, and a small image keeps the character row (and backups) light.

const PORTRAIT_SIZE = 320;

/** Reads an image file, centre-crops it to a square (biased up so faces stay in frame) and scales it down. */
export async function portraitFrom(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  // A data: URL, not a blob: one: the app's content security policy only allows 'self' and data: images.
  const source = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result));
    reader.onerror = () => rej(new Error(`Couldn't read ${file.name}`));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error(`Couldn't read ${file.name} as an image`));
    img.src = source;
  });
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(PORTRAIT_SIZE, side);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, (img.width - side) / 2, Math.max(0, (img.height - side) * 0.2), side, side, 0, 0, canvas.width, canvas.height);
  // WebP keeps transparency; browsers without a WebP encoder return PNG, so fall back to JPEG then.
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}
