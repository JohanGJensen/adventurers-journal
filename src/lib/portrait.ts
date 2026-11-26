// Character and note images: an image file scaled to a small data URL. The app's content security policy only
// shows local and data: images, and a small image keeps the character row (and backups) light.

export const PORTRAIT_SIZE = 320;

export async function loadImage(file: File): Promise<HTMLImageElement> {
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
  return img;
}

/** WebP keeps transparency; browsers without a WebP encoder return PNG, so fall back to JPEG then. */
function encode(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

/** A square of the source image, in its own pixels. */
export interface Crop {
  x: number;
  y: number;
  side: number;
}

/** The default framing: the largest centred square, biased up so faces stay in frame. */
export function defaultCrop(img: HTMLImageElement): Crop {
  const side = Math.min(img.width, img.height);
  return { x: (img.width - side) / 2, y: Math.max(0, (img.height - side) * 0.2), side };
}

/** Draws one square of the image onto a portrait-sized canvas. */
export function cropPortrait(img: HTMLImageElement, crop: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(Math.min(PORTRAIT_SIZE, crop.side));
  canvas.getContext('2d')!.drawImage(img, crop.x, crop.y, crop.side, crop.side, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

/** Reads an image file and scales it so its longer side is at most `max`, keeping its shape (places, items, maps). */
export async function pictureFrom(file: File, max = 640): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}
