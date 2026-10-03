import sharp from 'sharp';
import { fail, text } from './security.js';

// Decode and re-encode, rather than trusting a MIME label or retaining metadata.
export async function prepareImage(input: unknown, avatar = false): Promise<Buffer> {
  if (typeof input !== 'string' || input.length > 1_500_000) return fail(400, 'invalid_image');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) return fail(400, 'invalid_image');
  try {
    const bytes = Buffer.from(match[2]!, 'base64');
    if (!bytes.length || bytes.toString('base64') !== match[2]) return fail(400, 'invalid_image');
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: 'warning' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1) return fail(400, 'invalid_image');
    const output = await image.rotate().resize(avatar ? 256 : 1920, avatar ? 256 : 1920,
      { fit: avatar ? 'cover' : 'inside', position: 'centre', withoutEnlargement: !avatar })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (output.length > (avatar ? 131072 : 1048576)) return fail(400, 'image_too_large');
    return output;
  } catch { return fail(400, 'invalid_image'); }
}

// Keep the page path but never persist OAuth codes, reset tokens or URL credentials.
export function reportSourceUrl(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  try {
    const url = new URL(text(input, 4096, true));
    if (url.protocol !== 'https:' || url.username || url.password) return fail(400, 'invalid_source_url');
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return fail(400, 'invalid_source_url'); }
}
