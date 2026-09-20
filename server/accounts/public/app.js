import { languages, normaliseLanguage, translate } from './i18n.js';

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
  const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('invitation') || '';
  const token = takeFragmentToken(window.location, window.history);
  let language = normaliseLanguage(new URLSearchParams(location.search).get('lang') || navigator.language);
  let session = null;
  let pageVersion = 0;
  let chromeController = new AbortController();
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
    const langSelect = el('select', undefined, 'language');
    langSelect.setAttribute('aria-label', t('language'));
    for (const [id, name] of Object.entries(languages)) {
      const option = el('option', name);
      option.value = id;
      langSelect.append(option);
    }
    langSelect.value = language;
    langSelect.addEventListener('change', () => { language = langSelect.value; renderChrome(); render(); });
    navigation.append(langSelect);
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
    } else navigation.append(link(t('login'), '/login'));
    footer.replaceChildren(link('DevelopED', '/'), link(t('reportBug'), '/report-bug'), link('info@developed.sk', 'mailto:info@developed.sk'));
  }

  async function logout() {
    if (!await confirmDialog(t('logoutConfirm'), t('deviceNote'))) return;
    try { await api('/logout', 'POST', {}); location.assign('/login'); }
    catch (error) { const notice = el('div'); feedback(notice, errorMessage(error), 'error'); main.prepend(notice); }
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
      const password = await confirmDialog(t('reauth'), t('reauthIntro'), form => {
        const input = field(form, 'password', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
        return () => input.value;
      });
      if (!password) throw error;
      await api('/reauthenticate', 'POST', { password });
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

  function registerPage() {
    heading(t('register'), t('registerIntro'), true);
    if (session.registrationMode === 'closed') { main.append(el('p', t('registrationClosed'), 'notice')); return; }
    const form = el('form');
    if (session.registrationMode === 'invitation') form.append(el('p', t('invitationOnly'), 'notice'));
    const name = field(form, 'name', { required: true, autocomplete: 'name', maxLength: 100 });
    const email = field(form, 'email', { type: 'email', required: true, autocomplete: 'email', maxLength: 254 });
    const password = field(form, 'password', { type: 'password', required: true, autocomplete: 'new-password', minLength: 15, maxLength: 128 });
    form.append(el('small', t('passwordHelp')));
    const invitation = field(form, 'invitation', { required: session.registrationMode === 'invitation', value: invitationToken, maxLength: 100 });
    bindForm(form, t('register'), async notice => {
      const continuation = safeContinuation(new URLSearchParams(location.search).get('next'), location.origin);
      await api('/register', 'POST', { email: email.value.trim(), password: password.value, displayName: name.value.trim(), language, ...(invitation.value.trim() ? { invitation: invitation.value.trim() } : {}), ...(continuation.startsWith('/account/authorize?') ? { continuation } : {}) });
      password.value = '';
      feedback(notice, t('mailbox'));
    });
    panel().append(form);
    main.append(link(t('login'), '/login'));
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
    const { apps } = await api('/apps');
    const grid = el('div', undefined, 'app-grid');
    for (const app of apps) {
      const launch = safeHttpsUrl(app.launchUrl, location.origin);
      const tile = button('', () => { if (launch) location.assign(launch); }, 'app-tile');
      tile.disabled = !app.available || !launch;
      const iconUrl = safeHttpsUrl(app.icon, location.origin);
      const icon = iconUrl ? el('img', undefined, 'app-icon') : el('span', initials(app.name), 'app-icon');
      if (iconUrl) { icon.src = iconUrl; icon.alt = ''; icon.loading = 'lazy'; icon.referrerPolicy = 'no-referrer'; }
      tile.append(icon, el('strong', app.name), el('p', app.description || ''), el('span', !app.available ? t('unavailable') : app.plan === 'free' ? t('free') : app.plan || t('continue'), 'badge'));
      grid.append(tile);
    }
    main.append(apps.length ? grid : el('p', t('noApps'), 'empty'));
  }

  function profilePage() {
    heading(t('profile'));
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
    bindForm(emailForm, t('changeEmail'), async notice => {
      await api('/profile/email', 'POST', { email: email.value.trim(), currentPassword: emailPassword.value });
      emailPassword.value = '';
      feedback(notice, t('pendingEmail'));
    });
    panel(t('changeEmail'), columns).append(emailForm);
    const passwordForm = el('form');
    const current = field(passwordForm, 'currentPassword', { type: 'password', required: true, autocomplete: 'current-password', maxLength: 128 });
    const password = newPasswordFields(passwordForm);
    bindForm(passwordForm, t('changePassword'), async notice => {
      await api('/profile/password', 'POST', { currentPassword: current.value, password: password.value });
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
    const { sessions } = await api('/security');
    const section = panel(t('sessions'));
    const table = tableShell(['created', 'expires', 'state']);
    for (const item of sessions) table.body.append(row([date(item.createdAt), date(item.expiresAt), item.current ? t('current') : '—']));
    section.append(sessions.length ? table.container : el('p', t('noSessions'), 'empty'), button(t('logout'), logout, 'danger'));
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
      const url = safeHttpsUrl(result.redirectUrl, location.origin);
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
