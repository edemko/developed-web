// Resize before transport; the server independently decodes and normalizes images.
export async function imageData(file, avatar = false) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('invalid_image');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) throw new Error('invalid_image');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    canvas.width = avatar ? 256 : Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = avatar ? 256 : Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (avatar) {
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    } else ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < (avatar ? 170000 : 1400000)) return data;
    }
    throw new Error('image_too_large');
  } finally { bitmap.close(); }
}
export function sourcePage(value) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return ''; return url.origin + url.pathname; }
  catch { return ''; }
}
export function reportLink(app = 'developed') {
  const url = new URL(app === 'developed' ? '/report-bug' : `/report-bug/${app}`, 'https://www.developed.sk');
  url.searchParams.set('sourceUrl', sourcePage(location.href));
  url.searchParams.set('platform', 'web');
  return url.href;
}
