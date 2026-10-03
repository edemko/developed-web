// Shared DevelopED report entry point. Keep distributed copies identical.
(() => {
  const script = document.currentScript || document.querySelector('script[data-developed-app]');
  const app = script?.dataset.developedApp || 'developed';
  const labels = { en: 'Report a problem', sk: 'Nahlásiť problém', cs: 'Nahlásit problém', uk: 'Повідомити про проблему' };
  const href = () => {
    const url = new URL(app === 'developed' ? '/report-bug' : `/report-bug/${app}`, 'https://www.developed.sk');
    url.searchParams.set('platform', 'web');
    url.searchParams.set('sourceUrl', location.origin + location.pathname);
    return url.href;
  };
  function mount() {
    let button = document.getElementById('developed-report-problem');
    const slot = innerWidth >= 1100 ? document.querySelector('[data-developed-support-slot]') : null;
    if (!button) {
      button = document.createElement('a'); button.id = 'developed-report-problem';
      button.target = '_blank'; button.rel = 'noopener noreferrer'; button.referrerPolicy = 'no-referrer';
      (slot || document.body).append(button);
    } else if (button.parentNode !== (slot || document.body)) (slot || document.body).append(button);
    const label = labels[document.documentElement.lang.slice(0, 2)] || labels.en;
    if (button.textContent !== label) button.textContent = label;
    button.classList.toggle('developed-report-floating', !slot);
    if (button.href !== href()) button.href = href();
  }
  // Capture the current SPA route at activation, including existing footer links.
  for (const event of ['click', 'auxclick', 'contextmenu']) document.addEventListener(event, e => {
    const link = e.target.closest?.('a');
    if (link?.href.startsWith('https://www.developed.sk/report-bug')) link.href = href();
  }, true);
  const start = () => {
    mount();
    window.addEventListener('resize', mount);
    let pending = false;
    new MutationObserver(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; mount(); }); })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
