// Registry icon values predate the portal and include component names such as
// "Wallet", not image URLs. Keep reviewed first-party assets separate from that
// shared product metadata; publication remains exclusively a database decision.
export const appIcons: Readonly<Record<string, string>> = Object.freeze({
  app_mega_music: '/assets/projects/mega-music-square-192.b19ee4800c84.webp',
  app_kestrek: '/assets/projects/kestrek.svg',
  app_screentime: '/assets/projects/screentime.svg',
  app_airsoft: '/assets/projects/airsoft.svg',
  app_voc_builder: '/assets/projects/vocabulum.svg',
  app_odonto: '/assets/projects/odonto.svg',
  app_otazkomat: '/assets/projects/otazkomat.svg',
});

export function catalogApp<T extends Record<string, any>>(app: T) {
  // Unknown apps may use a curated project asset, never a remote URL, arbitrary
  // path or symbolic component name that a browser treats as a relative URL.
  const icon = (Object.hasOwn(appIcons, app.id) ? appIcons[app.id] : undefined) || (typeof app.icon === 'string'
    && /^\/assets\/projects\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:svg|webp|png|jpg)$/.test(app.icon) ? app.icon : null);
  return { ...app, icon };
}
