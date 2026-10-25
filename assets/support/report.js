// Shared DevelopED report entry point. Keep distributed copies identical.
(() => {
  const script = document.currentScript || document.querySelector('script[data-developed-app]');
  const app = script?.dataset.developedApp || 'developed';
  const labels = { en: 'Report', sk: 'Nahlásiť', cs: 'Nahlásit', uk: 'Повідомити' };
  const href = () => {
    const url = new URL(app === 'developed' ? '/report-bug' : `/report-bug/${app}`, 'https://www.developed.sk');
    url.searchParams.set('platform', 'web');
    url.searchParams.set('sourceUrl', location.origin + location.pathname);
    return url.href;
  };
  function mount() {
    let button = document.getElementById('developed-report-problem');
    // Pages with an authored report link already have a deliberate place for this action.
    const existing = [...document.querySelectorAll('a[href]')].some(link =>
      link !== button && link.href.startsWith('https://www.developed.sk/report-bug'));
    if (existing) { button?.remove(); return; }
    const footer = [...document.querySelectorAll('footer')].findLast(node => !node.closest('dialog, article'));
    if (!footer) { button?.remove(); return; }
    const slot = footer.querySelector('[data-developed-support-slot], .footer-bottom') || footer;
    if (!button) {
      button = document.createElement('a'); button.id = 'developed-report-problem';
      button.className = 'developed-report-link';
      button.target = '_blank'; button.rel = 'noopener noreferrer'; button.referrerPolicy = 'no-referrer';
      // Fixed artwork and labels only; never interpolate page content into markup.
      button.innerHTML = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13V6a3 3 0 0 1 6 0v1.13M12 20v-9M6 13H2m20 0h-4M6 8H3L2 7m4 11H3l-1 1M18 8h3l1-1m-4 11h3l1 1\"/><path d=\"M18 9a6 6 0 0 0-12 0v5a6 6 0 0 0 12 0Z\"/></svg><span></span>";
      slot.append(button);
    } else if (button.parentNode !== slot) slot.append(button);
    const label = labels[document.documentElement.lang.slice(0, 2)] || labels.en;
    const text = button.querySelector('span');
    if (text.textContent !== label) text.textContent = label;
    if (button.href !== href()) button.href = href();
  }
  // Capture the current SPA route at activation, including existing footer links.
  for (const event of ['click', 'auxclick', 'contextmenu']) document.addEventListener(event, e => {
    const link = e.target.closest?.('a');
    if (link?.href.startsWith('https://www.developed.sk/report-bug')) link.href = href();
  }, true);
  const start = () => {
    mount();
    let pending = false;
    new MutationObserver(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; mount(); }); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
