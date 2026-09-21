import { languages, normaliseLanguage, translate } from './i18n.js';

// First-party interface icons; SK/GB reuse the marketing header's flag artwork.
const languageFlags = {
  sk: '<rect width="60" height="40" fill="#fff"/><rect y="13.333" width="60" height="13.333" fill="#0b4ea2"/><rect y="26.667" width="60" height="13.333" fill="#ee1c25"/><path d="M20 7.5c-5.2 0-9 1.6-9 1.6v12.4c0 6.6 4.6 9.9 9 12.5 4.4-2.6 9-5.9 9-12.5V9.1s-3.8-1.6-9-1.6z" fill="#fff"/><path d="M20 9.8c-4.3 0-7.3 1.3-7.3 1.3v10.4c0 5.5 3.7 8.3 7.3 10.5 3.6-2.2 7.3-5 7.3-10.5V11.1S24.3 9.8 20 9.8z" fill="#ee1c25"/><path d="M18.9 13.2h2.2v2.6h2.9v2.2h-2.9v2.6h3.6v2.2h-3.6v3.4h-2.2v-3.4h-3.6v-2.2h3.6v-2.6h-2.9v-2.2h2.9z" fill="#fff"/><path d="M13 29.4c1.6-2.6 3.3-3.4 4.6-3.4 1.4 0 2 .8 2.4 1.5.4-.7 1-1.5 2.4-1.5 1.3 0 3 .8 4.6 3.4-1.6 1.6-3.7 2.9-7 4.8-3.3-1.9-5.4-3.2-7-4.8z" fill="#0b4ea2"/>',
  en: '<clipPath id="quarters"><path d="M30 20h30v20zv20H30zH0V20zV0h30z"/></clipPath><rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40m0-40L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40m0-40L0 40" stroke="#c8102e" stroke-width="4.8" clip-path="url(#quarters)"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="13.3"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="8"/>',
  cs: '<rect width="60" height="40" fill="#fff"/><rect y="20" width="60" height="20" fill="#d7141a"/><path d="M0 0L30 20 0 40z" fill="#11457e"/>',
  uk: '<rect width="60" height="40" fill="#0057b7"/><rect y="20" width="60" height="20" fill="#ffd700"/>',
};

export function safeContinuation(value, origin) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/apps';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.hash) return '/apps';
    if (url.pathname === '/account/authorize') {
      const id = url.searchParams.get('authorization_id');
      return id && /^[a-zA-Z0-9_-]{1,160}$/.test(id)
        ? `/account/authorize?authorization_id=${encodeURIComponent(id)}` : '/apps';
    }
    return /^\/report-bug(?:\/[a-z0-9-]{1,64})?$/.test(url.pathname) ? url.pathname : '/apps';
  } catch { return '/apps'; }
}

export function safeHttpsUrl(value, origin) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Registry images are first-party only, matching the account page's strict CSP.
// Relative URLs also work in the isolated loopback browser test environment.
export function safeIconUrl(value, origin) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.username && !url.password
      && /^\/assets\/projects\/[a-z0-9.-]+\.(svg|webp|png)$/.test(url.pathname)
      && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

// Only authorization responses may open the registered native KešTrek callback.
// Tiles, login continuations, avatars and every other link remain HTTPS-only.
export function safeAuthorizationUrl(value, origin) {
  const https = safeHttpsUrl(value, origin);
  if (https) return https;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'sk.kestrek:' || url.hostname !== 'oauth' || url.pathname !== '/callback'
      || url.port || url.username || url.password || url.hash || url.href !== value) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => !['code', 'state', 'error'].includes(key)) || new Set(keys).size !== keys.length) return null;
    const state = url.searchParams.get('state'), code = url.searchParams.get('code'), error = url.searchParams.get('error');
    if (!state || state.length > 1024 || Boolean(code) === Boolean(error)) return null;
    if ([...url.searchParams.values()].some(item => !item || item.length > 2048 || /[\u0000-\u0020\u007f]/.test(item))) return null;
    return url.href;
  } catch { return null; }
}

export function diagnosticHints(search, language) {
  const params = new URLSearchParams(search);
  const result = { locale: normaliseLanguage(language) };
  for (const key of ['version', 'platform', 'screen', 'errorId']) {
    const value = params.get(key);
    // Never ingest a full URL, filename, token, query string or arbitrary log blob.
    if (value && /^[\p{L}\p{N} ._+-]{1,80}$/u.test(value)) result[key] = value;
  }
  return result;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/u).slice(0, 2).map(part => [...part][0] || '').join('').toUpperCase();
}

export function takeFragmentToken(location, history) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return token;
}

// Importing this module in a Node test does not start a browser application.
if (typeof document !== 'undefined') start();

async function start() {
  const main = document.querySelector('#main');
  const navigation = document.querySelector('#navigation');
  const footer = document.querySelector('#footer');
  let invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('invitation') || '';
  const token = takeFragmentToken(window.location, window.history);
  let language = normaliseLanguage(new URLSearchParams(location.search).get('lang') || navigator.language);
  let session = null;
  let pageVersion = 0;
  let chromeController = new AbortController();
  let appCatalog = null;
  const t = key => translate(language, key);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const link = (text, href, className) => {
    const node = el('a', text, className);
    node.href = href;
    return node;
  };
  const button = (text, action, className) => {
    const node = el('button', text, className);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  };
  const date = value => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(language);
  };
  const feedback = (node, message, kind = 'success') => {
    node.className = `notice ${kind}`;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.textContent = message;
  };
  const errorMessage = error => {
    if (error?.code === 'invalid_invitation') return t('invalidInvitation');
    if (error?.code === 'account_exists') return t('accountExists');
    if (error?.code === 'invalid_mfa_code') return t('mfaInvalid');
    if (error?.code === 'mfa_operation_pending') return t('mfaPending');
    if (error?.code === 'mfa_enrollment_pending') return t('mfaResume');
    if (error?.code === 'mfa_required') return t('mfaIntro');
    if (error?.status === 401) return t('sessionExpired');
    if (error?.status === 403) return t('denied');
    return t('error');
  };

  async function api(path, method = 'GET', body) {
    const response = await fetch(`/api/account${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(method === 'GET' ? {} : {
        'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrfToken || ''
      }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result?.error?.message || t('error'));
      error.code = result?.error?.code;
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function bootstrap() {
    session = await api('/session');
    appCatalog = null;
    if (session.user?.language) language = normaliseLanguage(session.user.language);
    renderChrome();
  }

  function field(form, key, { type = 'text', value = '', required = false, maxLength, autocomplete, minLength } = {}) {
    const label = el('label', t(key));
    const input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.name = key;
    input.value = value;
    input.required = required;
    if (maxLength) input.maxLength = maxLength;
    if (minLength) input.minLength = minLength;
    if (autocomplete) input.autocomplete = autocomplete;
    label.append(input);
    form.append(label);
    return input;
  }

  function select(form, key, options, value) {
    const label = el('label', t(key));
    const input = el('select');
    input.name = key;
    for (const [id, text] of options) {
      const option = el('option', text);
      option.value = id;
      input.append(option);
    }
    input.value = value;
    label.append(input);
    form.append(label);
    return input;
  }

  function checkbox(form, key, checked = false) {
    const label = el('label', undefined, 'checkbox');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    label.append(input, el('span', t(key)));
    form.append(label);
    return input;
  }

  function bindForm(form, submitText, callback) {
    const notice = el('div', '', 'notice');
    notice.setAttribute('aria-live', 'polite');
    const submit = button(submitText);
    submit.type = 'submit';
    form.append(notice, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.busy === 'true' || !form.reportValidity()) return;
      form.dataset.busy = 'true';
      submit.disabled = true;
      submit.textContent = t('working');
      notice.textContent = '';
      try { await callback(notice); }
      catch (error) {
        feedback(notice, errorMessage(error), 'error');
        if (error?.status === 401) {
          notice.append(' ', link(t('signInAgain'), `/login?next=${encodeURIComponent(safeContinuation(location.pathname + location.search, location.origin))}`));
        }
      } finally {
        form.dataset.busy = 'false';
        submit.disabled = false;
        submit.textContent = submitText;
      }
    });
    return notice;
  }

  function heading(title, intro, narrow = false) {
    main.classList.toggle('narrow', narrow);
    main.replaceChildren(el('p', t('account'), 'eyebrow'), el('h1', title));
    if (intro) main.append(el('p', intro, 'lede'));
    document.title = `${title} — DevelopED`;
  }

  function panel(title, parent = main) {
    const section = el('section', undefined, 'panel');
    if (title) section.append(el('h2', title));
    parent.append(section);
    return section;
  }

  function renderChrome() {
    chromeController.abort();
    chromeController = new AbortController();
    document.documentElement.lang = language;
    navigation.replaceChildren();
    navigation.setAttribute('aria-label', t('account'));
    navigation.append(languageMenu());
    if (session?.user) {
      const menu = el('details', undefined, 'avatar-menu');
      const summary = el('summary');
      summary.setAttribute('aria-label', t('profile'));
      const avatarUrl = safeHttpsUrl(session.user.avatarUrl, location.origin);
      const avatar = avatarUrl ? el('img', undefined, 'avatar') : el('span', initials(session.user.displayName || session.user.email), 'avatar');
      if (avatarUrl) { avatar.src = avatarUrl; avatar.alt = ''; avatar.referrerPolicy = 'no-referrer'; }
      summary.append(avatar);
      const items = el('div', undefined, 'menu-items');
      items.append(link(t('apps'), '/apps'), link(t('profile'), '/profile'), link(t('security'), '/security'));
      if (session.user.role === 'SUPERADMIN') items.append(link(t('adminApps'), '/admin/apps'), link(t('adminUsers'), '/admin/users'), link(t('adminReports'), '/admin/reports'));
      items.append(button(t('logout'), () => logout()));
      menu.append(summary, items);
      menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; summary.focus(); } });
      document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; }, { signal: chromeController?.signal });
      navigation.append(menu);
    } else navigation.append(link(t('login'), '/login', 'login-link'), link(t('register'), '/register', 'button register-link'));
    renderAppMenu();
    footer.replaceChildren(link('DevelopED', '/'), link(t('reportBug'), '/report-bug'), link('info@developed.sk', 'mailto:info@developed.sk'));
  }

  function languageMenu() {
    const menu = el('details', undefined, 'apps-menu language-menu');
    const summary = el('summary');
    summary.setAttribute('aria-label', `${t('language')}: ${languages[language]}`);
    const flag = id => {
      const icon = el('img', undefined, 'language-flag');
      icon.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">${languageFlags[id]}</svg>`)}`;
      icon.alt = ''; icon.width = 27; icon.height = 18;
      return icon;
    };
    summary.append(flag(language), el('span', language.toUpperCase()));
    const items = el('div', undefined, 'apps-menu-items language-options');
    for (const [id, name] of Object.entries(languages)) {
      const option = button('', () => {
        if (id !== language) { language = id; renderChrome(); render(); }
        menu.open = false;
        navigation.querySelector('.language-menu > summary')?.focus();
      });
      option.lang = id;
      option.setAttribute('aria-pressed', String(id === language));
      option.append(flag(id), el('span', name));
      if (id === language) {
        const check = el('span', '✓', 'language-check');
        check.setAttribute('aria-hidden', 'true'); option.append(check);
      }
      items.append(option);
    }
    menu.append(summary, items);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { menu.open = false; summary.focus(); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); menu.open = true;
        const options = [...items.querySelectorAll('button')];
        const current = options.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % options.length
          : (current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length);
        options[next].focus();
      }
    });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; }, { signal: chromeController.signal });
    return menu;
  }

  async function logout(all = false) {
    if (!await confirmDialog(t(all ? 'logoutAllConfirm' : 'logoutConfirm'), t(all ? 'deviceNote' : 'logoutLocalNote'))) return;
    try { await api(all ? '/logout-all' : '/logout', 'POST', {}); location.assign('/login'); }
    catch (error) { const notice = el('div'); feedback(notice, errorMessage(error), 'error'); main.prepend(notice); }
  }

  function appIcon(app, className = 'app-icon') {
    const fallback = el('span', initials(app.name), className);
    fallback.setAttribute('aria-hidden', 'true');
    const url = safeIconUrl(app.icon, location.origin);
    if (!url) return fallback;
    const icon = el('img', undefined, className);
    icon.src = url; icon.alt = ''; icon.width = 56; icon.height = 56;
    icon.referrerPolicy = 'no-referrer';
    icon.addEventListener('error', () => icon.replaceWith(fallback), { once: true });
    return icon;
  }

  async function availableApps() {
    if (!appCatalog) appCatalog = api(session?.user ? '/apps' : '/catalog').catch(error => { appCatalog = null; throw error; });
    return (await appCatalog).apps;
  }

  function renderAppMenu() {
    const host = document.querySelector('#app-navigation');
    if (!host) return;
    const menu = el('details', undefined, 'apps-menu');
    const summary = el('summary', t('appsMenu'));
    const items = el('div', undefined, 'apps-menu-items');
    items.append(el('p', t('loading'), 'muted'));
    menu.append(summary, items); host.replaceChildren(menu);
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; summary.focus(); } });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; }, { signal: chromeController.signal });
    availableApps().then(apps => {
      if (!menu.isConnected) return;
      items.replaceChildren();
      for (const app of apps) {
        const launch = safeHttpsUrl(app.launchUrl, location.origin);
        if (!launch) continue;
        const item = link('', session?.user && app.available === false ? '/apps' : launch);
        item.append(appIcon(app), el('span', app.name)); items.append(item);
      }
      items.append(link(t('apps'), '/apps', 'all-apps'));
    }).catch(() => { if (menu.isConnected) items.replaceChildren(link(t('apps'), '/apps')); });
  }

  function confirmDialog(title, description, configure) {
    return new Promise(resolve => {
      const dialog = el('dialog');
      const titleNode = el('h2', title);
      titleNode.id = 'account-dialog-title';
      dialog.setAttribute('aria-labelledby', titleNode.id);
      dialog.append(titleNode, el('p', description, 'muted'));
      const form = el('form');
      const getValue = configure?.(form) || (() => true);
      const actions = el('div', undefined, 'actions');
      const cancel = button(t('cancel'), () => dialog.close());
      const confirm = button(t('confirm'));
      confirm.type = 'submit';
      actions.append(cancel, confirm);
      form.append(actions);
      dialog.append(form);
      let result = false;
      form.addEventListener('submit', event => { event.preventDefault(); result = getValue(); dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
      (form.querySelector('input') || cancel).focus();
    });
  }

  async function sensitive(path, method, body) {
    try { return await api(path, method, body); }
    catch (error) {
      if (error.code !== 'reauthentication_required') throw error;
      const factors = session.user?.hasMfa ? (await api('/mfa')).factors : [];
      const credentials = await confirmDialog(t('reauth'), t('reauthIntro'), form => {
        const input = field(form, 'password', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
        const code = session.user?.hasMfa ? mfaCode(form) : null;
        const factor = factorPicker(form, factors);
        return () => ({ password: input.value, ...(code ? { code: code.value, factorId: factor?.value || factors[0]?.id } : {}) });
      });
      if (!credentials) throw error;
      await api('/reauthenticate', 'POST', credentials);
      await bootstrap();
      return api(path, method, body);
    }
  }

  function loginPage() {
    heading(t('login'), t('loginIntro'), true);
    const form = el('form');
    const email = field(form, 'email', { type: 'email', required: true, autocomplete: 'username', maxLength: 254 });
    const password = field(form, 'password', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
    bindForm(form, t('login'), async () => {
      const appSlug = new URLSearchParams(location.search).get('app');
      const result = await api('/login', 'POST', { email: email.value.trim(), password: password.value, ...(appSlug && /^[a-z0-9-]{1,64}$/.test(appSlug) ? { appSlug } : {}) });
      password.value = '';
      if (result.mfa) { await bootstrap(); await mfaPage(); return; }
      if (result.user?.requirePasswordChange) { location.assign('/profile'); return; }
      if (result.redirectUrl) {
        const redirect = safeHttpsUrl(result.redirectUrl, location.origin);
        if (!redirect) throw new Error('Invalid redirect');
        location.assign(redirect);
        return;
      }
      const next = new URLSearchParams(location.search).get('next');
      location.assign(safeContinuation(next, location.origin));
    });
    panel().append(form);
    const links = el('div', undefined, 'links');
    const next = safeContinuation(new URLSearchParams(location.search).get('next'), location.origin);
    links.append(link(t('forgot'), '/forgot-password'), link(t('register'), `/register?next=${encodeURIComponent(next)}`));
    main.append(links);
  }

  async function registerPage() {
    heading(t('register'), t(invitationToken ? 'invitedIntro' : 'registerIntro'), true);
    const continuation = safeContinuation(new URLSearchParams(location.search).get('next'), location.origin);
    const loginUrl = `/login?next=${encodeURIComponent(continuation)}`;
    if (session.registrationMode === 'closed') { main.append(el('p', t('registrationClosed'), 'notice'), link(t('login'), loginUrl)); return; }
    if (session.registrationMode === 'invitation' && !invitationToken) {
      main.append(el('p', t('invitationOnly'), 'notice'), link(t('login'), loginUrl)); return;
    }
    const invitationEmail = invitationToken ? (await api('/invitation/preview', 'POST', { token: invitationToken })).email : null;
    const form = el('form');
    if (session.registrationMode === 'invitation') form.append(el('p', t('invitationOnly'), 'notice'));
    const name = field(form, 'name', { required: true, autocomplete: 'name', maxLength: 100 });
    const email = field(form, 'email', { type: 'email', required: true, autocomplete: 'email', maxLength: 254, value: invitationEmail || '' });
    if (invitationEmail) { email.readOnly = true; email.setAttribute('aria-readonly', 'true'); form.append(el('small', t('invitedEmailHelp'))); }
    const password = field(form, 'password', { type: 'password', required: true, autocomplete: 'new-password', minLength: 15, maxLength: 128 });
    form.append(el('small', t('passwordHelp')));
    const card = panel();
    bindForm(form, t('register'), async () => {
      // The preview binds display and request to the invited mailbox. The server
      // independently checks the invitation; DOM/readOnly is not authorization.
      const address = invitationEmail || email.value.trim();
      const result = await api('/register', 'POST', { email: address, password: password.value, displayName: name.value.trim(), language, ...(invitationToken ? { invitation: invitationToken } : {}), ...(continuation.startsWith('/account/authorize?') ? { continuation } : {}) });
      password.value = '';
      invitationToken = '';
      if (result.emailVerified === true) {
        const title = el('h2', t('accountCreated')); title.tabIndex = -1;
        card.replaceChildren(title, el('p', t('invitedComplete'), 'notice success'), link(t('login'), loginUrl, 'button'));
        title.focus(); return;
      }
      const title = el('h2', t('checkInbox'));
      title.tabIndex = -1;
      const notice = el('p', t('mailbox'), 'notice');
      notice.setAttribute('role', 'status');
      const resend = el('form');
      bindForm(resend, t('resend'), async status => {
        await api('/resend-verification', 'POST', { email: address });
        feedback(status, t('mailbox'));
      });
      card.replaceChildren(title, notice, el('p', t('registrationNext')), resend);
      title.focus();
    });
    card.append(form);
    main.append(link(t('login'), loginUrl));
  }

  function emailRequestPage() {
    heading(t('recover'), t('recoveryIntro'), true);
    const form = el('form');
    const email = field(form, 'email', { type: 'email', required: true, autocomplete: 'email', maxLength: 254 });
    bindForm(form, t('recover'), async notice => {
      await api('/forgot-password', 'POST', { email: email.value.trim() });
      feedback(notice, t('mailbox'));
    });
    panel().append(form);
  }

  function verificationPage() {
    heading(t('verify'), t('verifyIntro'), true);
    if (token) {
      const form = el('form');
      bindForm(form, t('verify'), async notice => {
        const result = await api('/verify-email', 'POST', { token });
        feedback(notice, t('confirmed'));
        form.querySelector('button[type=submit]').hidden = true;
        const loginUrl = typeof result.loginUrl === 'string' && /^\/login(?:\?app=[a-z0-9-]{1,64})?$/.test(result.loginUrl) ? result.loginUrl : '/login';
        form.append(link(t('login'), loginUrl, 'button'));
      });
      panel().append(form);
    } else main.append(el('p', t('invalidToken'), 'notice'));
    const resend = el('form');
    const email = field(resend, 'email', { type: 'email', required: true, autocomplete: 'email', maxLength: 254 });
    bindForm(resend, t('resend'), async notice => {
      await api('/resend-verification', 'POST', { email: email.value.trim() });
      feedback(notice, t('mailbox'));
    });
    panel(t('resend')).append(resend);
  }

  function newPasswordFields(form) {
    const password = field(form, 'newPassword', { type: 'password', required: true, minLength: 15, maxLength: 128, autocomplete: 'new-password' });
    form.append(el('small', t('passwordHelp')));
    const repeat = field(form, 'repeatPassword', { type: 'password', required: true, maxLength: 128, autocomplete: 'new-password' });
    const validate = () => repeat.setCustomValidity(password.value === repeat.value ? '' : t('passwordMismatch'));
    password.addEventListener('input', validate);
    repeat.addEventListener('input', validate);
    return password;
  }

  function resetPage() {
    heading(t('recover'), null, true);
    if (!token) { main.append(el('p', t('invalidToken'), 'notice'), link(t('recover'), '/forgot-password')); return; }
    const form = el('form');
    const password = newPasswordFields(form);
    bindForm(form, t('changePassword'), async notice => {
      await api('/reset-password', 'POST', { token, password: password.value });
      form.reset();
      feedback(notice, t('passwordChanged'));
      form.querySelector('button[type=submit]').hidden = true;
      form.append(link(t('login'), '/login', 'button'));
    });
    panel().append(form);
  }

  async function appsPage() {
    heading(t('apps'), t('appsIntro'));
    if (session.user.requirePasswordChange) {
      main.append(el('p', t('requiredPassword'), 'notice'), link(t('changePassword'), '/profile', 'button'));
      return;
    }
    const apps = await availableApps();
    const grid = el('div', undefined, 'app-grid');
    for (const app of apps) {
      const launch = safeHttpsUrl(app.launchUrl, location.origin);
      const tile = button('', () => { if (launch) location.assign(launch); }, 'app-tile');
      tile.disabled = !app.available || !launch;
      tile.append(appIcon(app), el('strong', app.name), el('p', app.description || ''), el('span', !app.available ? t('unavailable') : app.plan === 'free' ? t('free') : app.plan || t('continue'), 'badge'));
      grid.append(tile);
    }
    main.append(apps.length ? grid : el('p', t('noApps'), 'empty'));
  }

  async function profilePage() {
    heading(t('profile'));
    const factors = session.user.hasMfa ? (await api('/mfa')).factors : [];
    if (session.user.requirePasswordChange) main.append(el('p', t('requiredPassword'), 'notice'));
    const columns = el('div', undefined, 'two-column');
    main.append(columns);
    const form = el('form');
    const name = field(form, 'name', { value: session.user.displayName, required: true, maxLength: 100, autocomplete: 'name' });
    const lang = select(form, 'language', Object.entries(languages), language);
    bindForm(form, t('save'), async notice => {
      const { user } = await api('/profile', 'PATCH', { displayName: name.value.trim(), language: lang.value });
      session.user = user;
      language = normaliseLanguage(user.language);
      renderChrome();
      feedback(notice, t('saved'));
    });
    panel(t('profile'), columns).append(form);
    const emailForm = el('form');
    emailForm.append(el('p', session.user.email), el('span', t(session.user.emailVerified ? 'verified' : 'unverified'), 'badge'), el('p', t('emailHelp'), 'muted'));
    const email = field(emailForm, 'email', { type: 'email', required: true, autocomplete: 'email', maxLength: 254 });
    const emailPassword = field(emailForm, 'currentPassword', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
    const emailCode = session.user.hasMfa ? mfaCode(emailForm) : null;
    const emailFactor = factorPicker(emailForm, factors);
    bindForm(emailForm, t('changeEmail'), async notice => {
      await api('/profile/email', 'POST', { email: email.value.trim(), currentPassword: emailPassword.value, ...(emailCode ? { code: emailCode.value, factorId: emailFactor?.value || factors[0]?.id } : {}) });
      emailPassword.value = '';
      if (emailCode) emailCode.value = '';
      feedback(notice, t('pendingEmail'));
    });
    panel(t('changeEmail'), columns).append(emailForm);
    const passwordForm = el('form');
    const current = field(passwordForm, 'currentPassword', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
    const passwordCode = session.user.hasMfa ? mfaCode(passwordForm) : null;
    const passwordFactor = factorPicker(passwordForm, factors);
    const password = newPasswordFields(passwordForm);
    bindForm(passwordForm, t('changePassword'), async notice => {
      await api('/profile/password', 'POST', { currentPassword: current.value, password: password.value, ...(passwordCode ? { code: passwordCode.value, factorId: passwordFactor?.value || factors[0]?.id } : {}) });
      passwordForm.reset();
      feedback(notice, t('passwordChanged'));
      passwordForm.querySelector('button[type=submit]').hidden = true;
      passwordForm.append(link(t('login'), '/login', 'button'));
    });
    panel(t('changePassword')).append(passwordForm);
  }

  async function securityPage() {
    heading(t('security'), t('securityIntro'));
    main.append(el('p', t('deviceNote'), 'muted'));
    await mfaSection(panel(t('mfaTitle')));
    const { sessions } = await api('/security');
    const section = panel(t('sessions'));
    const table = tableShell(['created', 'expires', 'state']);
    for (const item of sessions) table.body.append(row([date(item.createdAt), date(item.expiresAt), item.current ? t('current') : '—']));
    const actions = el('div', undefined, 'actions');
    actions.append(button(t('logout'), () => logout()), button(t('logoutAll'), () => logout(true), 'danger'));
    section.append(sessions.length ? table.container : el('p', t('noSessions'), 'empty'), actions);
  }

  function mfaCode(form) {
    const input = field(form, 'mfaCode', { required: true, autocomplete: 'one-time-code', minLength: 6, maxLength: 6 });
    input.inputMode = 'numeric'; input.pattern = '[0-9]{6}';
    return input;
  }
  function factorPicker(form, factors = []) {
    return factors.length > 1 ? select(form, 'mfaFactor', factors.map((factor, index) => [factor.id, `${t('mfaFactor')} ${index + 1}`]), factors[0].id) : null;
  }

  async function mfaPage() {
    heading(t('mfaTitle'), t('mfaIntro'), true);
    await mfaSection(panel());
    main.append(mfaCancel());
  }

  function mfaCancel() {
    return button(t('cancel'), async () => {
      try { await api('/logout', 'POST', {}); main.replaceChildren(); location.assign('/login'); }
      catch (error) { const notice = el('div'); feedback(notice, errorMessage(error), 'error'); main.prepend(notice); }
    }, 'secondary');
  }

  async function mfaSection(section) {
    const state = await api('/mfa');
    if (state.required) section.append(el('p', t('mfaAdmin'), 'notice'));
    section.append(el('p', t('mfaRecovery'), 'muted'));
    if (state.enabled && !state.mode) { section.append(el('p', t('mfaEnabled'), 'notice')); return; }
    const verifyForm = factorId => {
      const form = el('form');
      const factors = state.factors || [];
      const factor = !factorId ? factorPicker(form, factors) : null;
      const code = mfaCode(form);
      const remember = checkbox(form, 'mfaRemember');
      form.append(el('p', t('mfaRememberHint'), 'muted'));
      bindForm(form, t('confirm'), async () => {
        const appSlug = new URLSearchParams(location.search).get('app');
        const result = await api('/mfa/verify', 'POST', { factorId: factorId || factor?.value || factors[0]?.id, code: code.value, rememberBrowser: remember.checked, ...(appSlug && /^[a-z0-9-]{1,64}$/.test(appSlug) ? { appSlug } : {}) });
        code.value = ''; section.replaceChildren(el('p', t('working')));
        if (result.user?.requirePasswordChange) { location.assign('/profile'); return; }
        if (result.redirectUrl) {
          const target = safeHttpsUrl(result.redirectUrl, location.origin);
          if (!target) throw new Error('Invalid redirect');
          location.assign(target); return;
        }
        location.assign(safeContinuation(new URLSearchParams(location.search).get('next'), location.origin));
      });
      section.append(form);
    };
    if (state.mode === 'challenge') {
      if (!state.factors?.length) { section.append(el('p', t('mfaUnsupported'), 'notice')); return; }
      verifyForm(); return;
    }
    if (state.enrollmentId) { section.append(el('p', t('mfaResume'), 'notice')); verifyForm(state.enrollmentId); return; }
    const form = el('form');
    const password = !state.mode ? field(form, 'currentPassword', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 }) : null;
    bindForm(form, t('mfaSetup'), async () => {
      const result = await api('/mfa/enroll', 'POST', password ? { password: password.value } : {});
      if (password) password.value = '';
      await bootstrap();
      if (password) {
        heading(t('mfaTitle'), t('mfaIntro'), true);
        main.append(section, mfaCancel());
      }
      section.replaceChildren(el('p', t('mfaScan')));
      // Display the provider SVG as an isolated image, never as page markup.
      if (typeof result.qrCode === 'string' && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/.test(result.qrCode)) {
        const image = el('img', undefined, 'mfa-qr'); image.src = result.qrCode; image.alt = t('mfaScan'); image.width = 240; image.height = 240; section.append(image);
      }
      section.append(el('p', t('mfaSecret')), el('code', result.secret), el('p', t('mfaSecretWarning'), 'notice'));
      verifyForm(result.factorId);
    });
    section.append(form);
  }

  function tableShell(headers) {
    const container = el('div', undefined, 'table-scroll');
    const table = el('table');
    const head = el('thead');
    const headingRow = el('tr');
    for (const key of headers) { const th = el('th', t(key)); th.scope = 'col'; headingRow.append(th); }
    head.append(headingRow);
    const body = el('tbody');
    table.append(head, body);
    container.append(table);
    return { container, body };
  }

  function row(values) {
    const tr = el('tr');
    for (const value of values) {
      const td = el('td');
      td.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—')));
      tr.append(td);
    }
    return tr;
  }

  async function authorizePage() {
    heading(t('authorize'), t('authorizeIntro'), true);
    const authorizationId = new URLSearchParams(location.search).get('authorization_id');
    if (!authorizationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(authorizationId)) throw new Error('Invalid authorization');
    const result = await api(`/authorize?authorization_id=${encodeURIComponent(authorizationId)}`);
    const section = panel(result.app.name);
    section.append(el('p', t('requestedScopes'), 'muted'), el('p', Array.isArray(result.scopes) ? result.scopes.join(', ') : result.scopes));
    const form = el('form');
    const finish = async approve => {
      const result = await api('/authorize', 'POST', { authorizationId, approve });
      const url = safeAuthorizationUrl(result.redirectUrl, location.origin);
      if (!url) throw new Error('Invalid redirect');
      location.assign(url);
    };
    const notice = bindForm(form, t('continue'), () => finish(true));
    form.append(button(t('deny'), async event => {
      event.target.disabled = true;
      try { await finish(false); } catch (error) { feedback(notice, errorMessage(error), 'error'); }
      finally { event.target.disabled = false; }
    }, 'secondary'));
    section.append(form);
    // This is an operator-controlled first-party ecosystem. The backend has
    // resolved the client and checked current eligibility before auto-approval.
    form.requestSubmit();
  }

  async function reportPage() {
    const slug = location.pathname.split('/')[2] || 'developed';
    heading(t('reportBug'), t('reportIntro'), true);
    let source;
    try { source = await api(`/reports/source/${encodeURIComponent(slug)}`); }
    catch (error) {
      if (error.status !== 404) throw error;
      main.append(el('p', t('invalidSource'), 'notice'), link(t('generalReport'), '/report-bug', 'button secondary'));
      return;
    }
    main.append(el('h2', `${t('reportingFor')} ${source.app.name}`));
    main.append(el('p', t(session.user ? 'signedReporter' : 'anonymous'), 'muted'));
    if (!session.user) main.append(link(t('login'), `/login?next=${encodeURIComponent(location.pathname)}`));
    const form = el('form');
    const summary = field(form, 'summary', { maxLength: 160 });
    const description = field(form, 'description', { type: 'textarea', required: true, minLength: 10, maxLength: 10000 });
    const steps = field(form, 'steps', { type: 'textarea', maxLength: 4000 });
    const expected = field(form, 'expected', { maxLength: 2000 });
    const actual = field(form, 'actual', { maxLength: 2000 });
    const occurredAt = field(form, 'occurredAt', { type: 'datetime-local' });
    const contact = session.user ? null : field(form, 'contactEmail', { type: 'email', maxLength: 254, autocomplete: 'email' });
    const details = el('details', undefined, 'diagnostics');
    details.append(el('summary', t('technical')), el('p', t('technicalHelp'), 'muted'));
    const detailFields = el('div', undefined, 'stack');
    details.append(detailFields);
    const diagnostics = {};
    const hints = diagnosticHints(location.search, language);
    for (const key of ['version', 'platform', 'screen', 'locale', 'errorId']) diagnostics[key] = field(detailFields, key, { value: hints[key] || '', maxLength: 80 });
    form.append(details);
    const idempotencyKey = crypto.randomUUID();
    bindForm(form, t('submitReport'), async notice => {
      const payload = { appSlug: source.app.slug, description: description.value.trim(), idempotencyKey };
      for (const [key, input] of Object.entries({ summary, steps, expected, actual, contactEmail: contact })) if (input?.value.trim()) payload[key] = input.value.trim();
      if (occurredAt.value) payload.occurredAt = new Date(occurredAt.value).toISOString();
      payload.diagnostics = Object.fromEntries(Object.entries(diagnostics).filter(([, input]) => input.value.trim()).map(([key, input]) => [key, input.value.trim()]));
      const result = await api('/reports', 'POST', payload);
      form.replaceChildren(notice);
      feedback(notice, `${t('reportSent')} ${result.reference}`);
      form.append(el('p', t('keepReference')), link(`info@developed.sk — ${result.reference}`, `mailto:info@developed.sk?subject=${encodeURIComponent(result.reference)}`));
    });
    panel().append(form);
  }

  async function adminAppsPage() {
    heading(t('adminApps'));
    const [{ apps }, registration] = await Promise.all([api('/admin/apps'), api('/admin/registration')]);
    const policyForm = el('form');
    const mode = select(policyForm, 'registration', [['open', t('open')], ['invitation', t('invitationPolicy')], ['closed', t('closed')]], registration.mode);
    bindForm(policyForm, t('save'), async notice => { await sensitive('/admin/registration', 'PATCH', { mode: mode.value }); feedback(notice, t('saved')); });
    panel(t('registration')).append(policyForm);
    const inviteForm = el('form');
    const email = field(inviteForm, 'email', { type: 'email', required: true, maxLength: 254 });
    bindForm(inviteForm, t('sendInvitation'), async notice => { await sensitive('/admin/invitations', 'POST', { email: email.value.trim() }); feedback(notice, t('mailbox')); });
    panel(t('sendInvitation')).append(inviteForm);
    for (const app of apps) {
      const form = el('form');
      form.append(el('p', app.description || '', 'muted'));
      const published = checkbox(form, 'published', app.published);
      const reportable = checkbox(form, 'reportable', app.reportable);
      const policy = select(form, 'joinPolicy', [['free', t('free')], ['invitation', t('invitationPolicy')], ['closed', t('closed')]], app.joinPolicy);
      bindForm(form, t('save'), async notice => {
        await sensitive(`/admin/apps/${encodeURIComponent(app.id)}`, 'PATCH', { published: published.checked, reportable: reportable.checked, joinPolicy: policy.value });
        feedback(notice, t('saved'));
      });
      panel(app.name).append(form);
    }
  }

  async function adminUsersPage() {
    heading(t('adminUsers'));
    const filters = el('form', undefined, 'filters');
    const search = field(filters, 'search', { maxLength: 254 });
    const list = el('section');
    let offset = 0;
    const load = async () => {
      const { users } = await api(`/admin/users?${new URLSearchParams({ q: search.value.trim(), limit: '25', offset: String(offset) })}`);
      list.replaceChildren();
      const table = tableShell(['user', 'role', 'state', 'created', 'accountActions']);
      for (const user of users) {
        const identity = el('div', user.displayName || user.email);
        identity.append(el('p', user.email, 'muted'), el('small', user.id));
        const actions = el('details');
        actions.append(el('summary', t('accountActions')));
        const actionForm = el('form', undefined, 'stack');
        const actionOptions = [[user.locked ? 'unlock' : 'lock', t(user.locked ? 'unlock' : 'lock')], ['send-reset', t('sendReset')], ['revoke-sessions', t('revokeSessions')], ['set-password', t('setPassword')]];
        const selected = select(actionForm, 'accountActions', actionOptions, actionOptions[0][0]);
        const password = field(actionForm, 'newPassword', { type: 'password', minLength: 15, maxLength: 128, autocomplete: 'new-password' });
        const force = checkbox(actionForm, 'forcePassword', true);
        const update = () => { const set = selected.value === 'set-password'; password.parentElement.hidden = !set; force.parentElement.hidden = !set; password.required = set; };
        selected.addEventListener('change', update); update();
        bindForm(actionForm, t('confirmAction'), async notice => {
          if (!await confirmDialog(`${t('confirmAction')}: ${user.email}`, t('actionWarning'))) return;
          const payload = { action: selected.value };
          if (selected.value === 'set-password') { payload.password = password.value; payload.requirePasswordChange = force.checked; }
          await sensitive(`/admin/users/${encodeURIComponent(user.id)}/action`, 'POST', payload);
          password.value = '';
          feedback(notice, t('saved'));
          await load();
        });
        actions.append(actionForm);
        table.body.append(row([identity, user.role, t(user.locked ? 'locked' : 'active'), date(user.createdAt), actions]));
      }
      list.append(users.length ? table.container : el('p', t('noUsers'), 'empty'));
      paginate(list, offset, users.length, nextOffset => { offset = nextOffset; return load(); });
    };
    bindForm(filters, t('search'), async () => { offset = 0; await load(); });
    main.append(filters, list);
    await load();
  }

  function paginate(parent, offset, count, load) {
    const actions = el('div', undefined, 'actions');
    const notice = el('div');
    const run = async (event, next) => { event.target.disabled = true; try { await load(next); } catch (error) { feedback(notice, errorMessage(error), 'error'); event.target.disabled = false; } };
    const previous = button(t('previous'), event => run(event, Math.max(0, offset - 25)), 'secondary');
    const next = button(t('next'), event => run(event, offset + 25), 'secondary');
    previous.disabled = offset === 0; next.disabled = count < 25;
    actions.append(previous, next);
    parent.append(actions, notice);
  }

  async function adminReportsPage() {
    heading(t('adminReports'));
    const filters = el('form', undefined, 'filters');
    const app = field(filters, 'apps', { maxLength: 64 });
    const status = select(filters, 'status', [['', t('all')], ...['new', 'in_progress', 'resolved', 'closed'].map(id => [id, t(id)])], '');
    const user = field(filters, 'reporter', { maxLength: 36 });
    const from = field(filters, 'from', { type: 'date' });
    const to = field(filters, 'to', { type: 'date' });
    const list = el('section');
    let offset = 0;
    const load = async () => {
      const params = new URLSearchParams({ limit: '25', offset: String(offset) });
      for (const [key, input] of Object.entries({ app, status, user, from, to })) if (input.value) params.set(key, input.value);
      const { reports } = await api(`/admin/reports?${params}`);
      list.replaceChildren();
      for (const report of reports) {
        const section = panel(`${report.reference} · ${report.appName || report.appId}`, list);
        section.append(el('span', t(report.status), 'badge'), el('p', report.summary || report.description.slice(0, 160)), el('p', `${t('reportDate')}: ${date(report.createdAt)}`, 'muted'));
        const reporter = report.reporterId || (report.contactEmail ? `${report.contactEmail} (${t('unverified')})` : t('anonymous'));
        section.append(el('p', `${t('user')}: ${reporter}`, 'muted'));
        const details = el('details');
        details.append(el('summary', t('details')));
        for (const key of ['description', 'steps', 'expected', 'actual']) if (report[key]) details.append(el('h3', t(key)), el('p', report[key]));
        if (report.occurredAt) details.append(el('p', `${t('occurredAt')}: ${date(report.occurredAt)}`));
        for (const key of ['version', 'platform', 'screen', 'locale', 'errorId']) if (report.diagnostics?.[key]) details.append(el('p', `${t(key)}: ${report.diagnostics[key]}`));
        details.append(el('h3', t('notes')));
        if (!report.notes?.length) details.append(el('p', t('noNotes'), 'muted'));
        for (const note of report.notes || []) details.append(el('p', typeof note === 'string' ? note : `${date(note.createdAt)} · ${note.text || note.note || ''}`));
        const form = el('form');
        const selected = select(form, 'status', ['new', 'in_progress', 'resolved', 'closed'].map(id => [id, t(id)]), report.status);
        const note = field(form, 'addNote', { type: 'textarea', maxLength: 4000 });
        bindForm(form, t('save'), async notice => {
          await sensitive(`/admin/reports/${encodeURIComponent(report.id)}`, 'PATCH', { status: selected.value, ...(note.value.trim() ? { note: note.value.trim() } : {}) });
          feedback(notice, t('saved')); await load();
        });
        details.append(form); section.append(details);
      }
      if (!reports.length) list.append(el('p', t('noReports'), 'empty'));
      paginate(list, offset, reports.length, nextOffset => { offset = nextOffset; return load(); });
    };
    bindForm(filters, t('filter'), async () => { offset = 0; await load(); });
    main.append(filters, list);
    await load();
  }

  async function render() {
    const version = ++pageVersion;
    const path = location.pathname.replace(/\/$/, '') || '/apps';
    const protectedPage = ['/apps', '/profile', '/security', '/account/authorize'].includes(path) || path.startsWith('/admin/');
    if (session.mfa && (protectedPage || path === '/login')) { await mfaPage(); return; }
    if (protectedPage && !session.user) {
      location.replace(`/login?next=${encodeURIComponent(safeContinuation(path + location.search, location.origin))}`);
      return;
    }
    if (session.user?.requirePasswordChange && (path === '/apps' || path === '/account/authorize' || path.startsWith('/admin/'))) { location.replace('/profile'); return; }
    if (path.startsWith('/admin/') && session.user?.role !== 'SUPERADMIN') { heading(t('denied')); return; }
    try {
      const routes = { '/apps': appsPage, '/login': loginPage, '/register': registerPage, '/verify-email': verificationPage, '/forgot-password': emailRequestPage, '/reset-password': resetPage, '/profile': profilePage, '/security': securityPage, '/account/authorize': authorizePage, '/admin/apps': adminAppsPage, '/admin/users': adminUsersPage, '/admin/reports': adminReportsPage };
      if (path === '/report-bug' || /^\/report-bug\/[a-z0-9-]{1,64}$/.test(path)) await reportPage();
      else if (routes[path]) await routes[path]();
      else heading(t('notFound'));
    } catch (error) {
      if (version !== pageVersion) return;
      const notice = el('div'); feedback(notice, errorMessage(error), 'error');
      main.append(notice, button(t('retry'), render, 'secondary'));
    }
  }

  try { await bootstrap(); await render(); }
  catch {
    heading(t('error'));
    main.append(button(t('retry'), () => location.reload(), 'secondary'), el('p', 'info@developed.sk'));
    // Generic reporting and independent support remain reachable during an outage.
    renderChrome();
  }
}
