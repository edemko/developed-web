// Informational only: no optional trackers, storage writes or consent to collect.
// Keep the account-service copy identical; each release serves its own assets.
(() => {
  'use strict';
  const copy = {
    en: {
      title: 'Cookies and your privacy',
      intro: 'These pages use no analytics or advertising cookies. Account features use essential cookies to keep sign-in and security checks working.',
      essential: 'Essential cookies',
      detail: 'The account service uses a session cookie. If you choose “Remember this browser”, it also stores a security cookie for 14 days. These cookies are not used for advertising.',
      optional: 'No optional cookies',
      explanation: 'There are no optional cookies to accept or reject. This dialog does not store a preference or change your sign-in. Linked applications may use different technologies; check their own notices.',
      policy: 'Read the cookie policy', close: 'Close', path: '/en/cookies/',
    },
    sk: {
      title: 'Cookies a vaše súkromie',
      intro: 'Tieto stránky nepoužívajú analytické ani reklamné cookies. Funkcie účtu používajú nevyhnutné cookies na prihlásenie a bezpečnostné kontroly.',
      essential: 'Nevyhnutné cookies',
      detail: 'Služba účtov používa cookie relácie. Ak zvolíte „Zapamätať tento prehliadač“, uloží aj bezpečnostnú cookie na 14 dní. Tieto cookies sa nepoužívajú na reklamu.',
      optional: 'Žiadne voliteľné cookies',
      explanation: 'Nie sú tu voliteľné cookies na prijatie ani odmietnutie. Tento dialóg neukladá voľbu ani nemení prihlásenie. Prepojené aplikácie môžu používať iné technológie; pozrite si ich vlastné informácie.',
      policy: 'Prečítať pravidlá cookies', close: 'Zavrieť', path: '/cookies/',
    },
    cs: {
      title: 'Cookies a vaše soukromí',
      intro: 'Tyto stránky nepoužívají analytické ani reklamní cookies. Funkce účtu používají nezbytné cookies pro přihlášení a bezpečnostní kontroly.',
      essential: 'Nezbytné cookies',
      detail: 'Služba účtů používá cookie relace. Pokud zvolíte „Zapamatovat tento prohlížeč“, uloží také bezpečnostní cookie na 14 dní. Tyto cookies se nepoužívají k reklamě.',
      optional: 'Žádné volitelné cookies',
      explanation: 'Nejsou zde volitelné cookies k přijetí ani odmítnutí. Tento dialog neukládá volbu ani nemění přihlášení. Propojené aplikace mohou používat jiné technologie; přečtěte si jejich vlastní informace.',
      policy: 'Přečíst pravidla cookies (slovensky)', close: 'Zavřít', path: '/cookies/',
    },
    uk: {
      title: 'Cookies і ваша приватність',
      intro: 'Ці сторінки не використовують аналітичні чи рекламні cookies. Функції облікового запису використовують необхідні cookies для входу та перевірок безпеки.',
      essential: 'Необхідні cookies',
      detail: 'Служба облікових записів використовує cookie сеансу. Якщо вибрати «Запам’ятати цей браузер», вона також зберігає cookie безпеки на 14 днів. Ці cookies не використовуються для реклами.',
      optional: 'Без необов’язкових cookies',
      explanation: 'Тут немає необов’язкових cookies для прийняття чи відхилення. Це вікно не зберігає вибір і не змінює стан входу. Пов’язані застосунки можуть використовувати інші технології; перегляньте їхні власні повідомлення.',
      policy: 'Прочитати політику cookies (англійською)', close: 'Закрити', path: '/en/cookies/',
    },
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-cookie-info]');
    // Keep normal link behaviour for modified clicks and older browsers.
    if (!trigger || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
    event.preventDefault();
    if (document.getElementById('developed-cookie-dialog')) return;
    const language = document.documentElement.lang.split('-')[0];
    const text = copy[language] || copy.en;
    const dialog = element('dialog');
    dialog.id = 'developed-cookie-dialog';
    dialog.setAttribute('aria-labelledby', 'developed-cookie-title');
    dialog.setAttribute('aria-describedby', 'developed-cookie-intro');
    const title = element('h2', text.title);
    title.id = 'developed-cookie-title';
    title.tabIndex = -1;
    title.autofocus = true;
    const intro = element('p', text.intro);
    intro.id = 'developed-cookie-intro';
    const actions = element('div');
    actions.className = 'developed-cookie-actions';
    const policy = element('a', text.policy);
    policy.href = document.documentElement.dataset.product === 'mega-music' ? `https://www.developed.sk${text.path}` : text.path;
    const close = element('button', text.close);
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    actions.append(policy, close);
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      if (event.shiftKey && (document.activeElement === policy || document.activeElement === title)) {
        event.preventDefault();
        close.focus();
      } else if (!event.shiftKey && document.activeElement === close) {
        event.preventDefault();
        policy.focus();
      }
    });
    dialog.append(title, intro, element('h3', text.essential), element('p', text.detail), element('h3', text.optional), element('p', text.explanation), actions);
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (trigger.isConnected) trigger.focus();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
})();
