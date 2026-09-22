import {readFileSync} from 'node:fs';
/** First-party transactional mail. No remote images, web fonts or tracking. */
export interface Mail { to: string; subject: string; text: string; html?: string; brand?: 'mega-music'; inlineLogo?: string }
export interface MailOptions { origin?: string; supportEmail?: string; insecureLocal?: boolean; mailBrand?: 'mega-music' }
type Purpose = 'verification' | 'recovery' | 'email_change' | 'invitation';
const lifetimes: Record<Purpose, number> = { verification: 86400, recovery: 1800, email_change: 1800, invitation: 604800 };
export function credentialLifetime(purpose: string): number {
  if (!Object.hasOwn(lifetimes, purpose)) throw new Error('Unknown mail purpose');
  return lifetimes[purpose as Purpose];
}
const copy = {
  en: {
    verification: ['Confirm your DevelopED email', 'Confirm your email to finish creating your account and access the available DevelopED apps.', 'Confirm email'],
    recovery: ['Reset your DevelopED password', 'Choose a new password for your DevelopED account. This password is shared by your connected apps.', 'Reset password'],
    email_change: ['Confirm your new DevelopED email', 'Confirm this new email address. Your current address stays active until you confirm the change.', 'Confirm new email'],
    invitation: ['Your invitation to DevelopED', 'You have been invited to create a DevelopED account. Register using the email address that received this invitation.', 'Create account'],
    expiry: ['This link expires in 30 minutes.', 'This link expires in 24 hours.', 'This invitation expires in 7 days.'],
    ignore: 'If you did not request this, you can safely ignore this email. Do not share this link.',
    fallback: 'If the button does not work, copy this full link into your browser:',
    support: 'Need help? Contact', automated: 'An automatic message from your DevelopED account. Replies reach our support team.',
    security: ['DevelopED — Account security', 'Your DevelopED account security settings changed. If this was not you, contact our support team immediately.', 'Review account security'],
    verified: ['Your DevelopED email is confirmed', 'Your email is confirmed. Sign in to open your available DevelopED apps.', 'Sign in'],
    report: ['Bug report received', 'We saved your bug report. Keep this reference when contacting our support team.'],
    alert: ['New bug report', 'A new bug report is waiting. Sign in to read its details.', 'Open bug reports'],
    registration: ['New user registration', 'A new user registered for the DevelopED ecosystem.', 'Open users'],
    user: 'User', name: 'Name', reference: 'Reference', app: 'Application',
  },
  sk: {
    verification: ['Potvrďte svoj e-mail DevelopED', 'Potvrďte e-mail, dokončite vytvorenie účtu a získajte prístup k dostupným aplikáciám DevelopED.', 'Potvrdiť e-mail'],
    recovery: ['Obnovenie hesla DevelopED', 'Vyberte si nové heslo účtu DevelopED. Rovnaké heslo platí aj pre vaše prepojené aplikácie.', 'Obnoviť heslo'],
    email_change: ['Potvrďte nový e-mail DevelopED', 'Potvrďte túto novú e-mailovú adresu. Aktuálna adresa zostane platná až do potvrdenia zmeny.', 'Potvrdiť nový e-mail'],
    invitation: ['Pozvánka do DevelopED', 'Pozývame vás vytvoriť si účet DevelopED. Pri registrácii použite adresu, na ktorú prišla táto pozvánka.', 'Vytvoriť účet'],
    expiry: ['Odkaz je platný 30 minút.', 'Odkaz je platný 24 hodín.', 'Pozvánka je platná 7 dní.'],
    ignore: 'Ak ste o túto akciu nežiadali, správu môžete ignorovať. Tento odkaz nezdieľajte.',
    fallback: 'Ak tlačidlo nefunguje, skopírujte do prehliadača celý tento odkaz:',
    support: 'Potrebujete pomoc? Kontaktujte', automated: 'Automatická správa vášho účtu DevelopED. Odpoveď dostane náš tím podpory.',
    security: ['DevelopED — Zabezpečenie účtu', 'Bezpečnostné nastavenia vášho účtu DevelopED sa zmenili. Ak ste zmenu nevykonali vy, ihneď kontaktujte podporu.', 'Skontrolovať zabezpečenie'],
    verified: ['Váš e-mail DevelopED je potvrdený', 'Váš e-mail je potvrdený. Prihláste sa a otvorte dostupné aplikácie DevelopED.', 'Prihlásiť sa'],
    report: ['Hlásenie chyby bolo prijaté', 'Vaše hlásenie chyby sme uložili. Pri komunikácii s podporou uveďte toto referenčné číslo.'],
    alert: ['Nové hlásenie chyby', 'Čaká na vás nové hlásenie chyby. Podrobnosti si prečítate po prihlásení.', 'Otvoriť hlásenia chýb'],
    registration: ['Nová registrácia používateľa', 'V ekosystéme DevelopED sa zaregistroval nový používateľ.', 'Otvoriť používateľov'],
    user: 'Používateľ', name: 'Meno', reference: 'Referencia', app: 'Aplikácia',
  },
  cs: {
    verification: ['Potvrďte svůj e-mail DevelopED', 'Potvrďte e-mail, dokončete vytvoření účtu a získejte přístup k dostupným aplikacím DevelopED.', 'Potvrdit e-mail'],
    recovery: ['Obnovení hesla DevelopED', 'Vyberte si nové heslo účtu DevelopED. Stejné heslo platí i pro vaše propojené aplikace.', 'Obnovit heslo'],
    email_change: ['Potvrďte nový e-mail DevelopED', 'Potvrďte tuto novou e-mailovou adresu. Aktuální adresa zůstane platná až do potvrzení změny.', 'Potvrdit nový e-mail'],
    invitation: ['Pozvánka do DevelopED', 'Zveme vás k vytvoření účtu DevelopED. Při registraci použijte adresu, na kterou přišla tato pozvánka.', 'Vytvořit účet'],
    expiry: ['Odkaz je platný 30 minut.', 'Odkaz je platný 24 hodin.', 'Pozvánka je platná 7 dní.'],
    ignore: 'Pokud jste o tuto akci nežádali, zprávu můžete ignorovat. Tento odkaz nesdílejte.',
    fallback: 'Pokud tlačítko nefunguje, zkopírujte do prohlížeče celý tento odkaz:',
    support: 'Potřebujete pomoc? Kontaktujte', automated: 'Automatická zpráva vašeho účtu DevelopED. Odpověď obdrží náš tým podpory.',
    security: ['DevelopED — Zabezpečení účtu', 'Bezpečnostní nastavení vašeho účtu DevelopED se změnila. Pokud jste změnu neprovedli vy, ihned kontaktujte podporu.', 'Zkontrolovat zabezpečení'],
    verified: ['Váš e-mail DevelopED je potvrzen', 'Váš e-mail je potvrzen. Přihlaste se a otevřete dostupné aplikace DevelopED.', 'Přihlásit se'],
    report: ['Hlášení chyby bylo přijato', 'Vaše hlášení chyby jsme uložili. Při komunikaci s podporou uveďte toto referenční číslo.'],
    alert: ['Nové hlášení chyby', 'Čeká na vás nové hlášení chyby. Podrobnosti si přečtete po přihlášení.', 'Otevřít hlášení chyb'],
    registration: ['Nová registrace uživatele', 'V ekosystému DevelopED se zaregistroval nový uživatel.', 'Otevřít uživatele'],
    user: 'Uživatel', name: 'Jméno', reference: 'Reference', app: 'Aplikace',
  },
  uk: {
    verification: ['Підтвердьте електронну адресу DevelopED', 'Підтвердьте електронну адресу, щоб завершити створення облікового запису й отримати доступ до доступних застосунків DevelopED.', 'Підтвердити адресу'],
    recovery: ['Відновлення пароля DevelopED', 'Виберіть новий пароль облікового запису DevelopED. Він також діятиме у ваших підключених застосунках.', 'Відновити пароль'],
    email_change: ['Підтвердьте нову електронну адресу DevelopED', 'Підтвердьте цю нову електронну адресу. Поточна адреса залишається активною до підтвердження зміни.', 'Підтвердити нову адресу'],
    invitation: ['Ваше запрошення до DevelopED', 'Вас запрошено створити обліковий запис DevelopED. Зареєструйтеся з адресою, на яку надійшло це запрошення.', 'Створити обліковий запис'],
    expiry: ['Посилання дійсне протягом 30 хвилин.', 'Посилання дійсне протягом 24 годин.', 'Запрошення дійсне протягом 7 днів.'],
    ignore: 'Якщо ви цього не запитували, можете проігнорувати лист. Не передавайте це посилання іншим.',
    fallback: 'Якщо кнопка не працює, скопіюйте це повне посилання у браузер:',
    support: 'Потрібна допомога? Напишіть', automated: 'Автоматичний лист вашого облікового запису DevelopED. Відповідь отримає наша служба підтримки.',
    security: ['DevelopED — Безпека облікового запису', 'Налаштування безпеки вашого облікового запису DevelopED змінено. Якщо це були не ви, негайно зверніться до служби підтримки.', 'Перевірити безпеку'],
    verified: ['Вашу електронну адресу DevelopED підтверджено', 'Вашу електронну адресу підтверджено. Увійдіть, щоб відкрити доступні застосунки DevelopED.', 'Увійти'],
    report: ['Повідомлення про помилку отримано', 'Ми зберегли ваше повідомлення про помилку. Збережіть цей номер для листування зі службою підтримки.'],
    alert: ['Нове повідомлення про помилку', 'Надійшло нове повідомлення про помилку. Увійдіть, щоб прочитати подробиці.', 'Відкрити повідомлення'],
    registration: ['Нова реєстрація користувача', 'В екосистемі DevelopED зареєструвався новий користувач.', 'Відкрити користувачів'],
    user: 'Користувач', name: "Ім'я", reference: 'Номер', app: 'Застосунок',
  },
} as const;
type Language = keyof typeof copy;
function locale(lang: string): Language { return Object.hasOwn(copy, lang) ? lang as Language : 'en'; }
function escape(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function settings(options: MailOptions) {
  const origin = new URL(options.origin || 'https://www.developed.sk');
  if ((origin.protocol !== 'https:' && !(options.insecureLocal && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Unsafe mail origin');
  const supportEmail = options.supportEmail || 'info@developed.sk';
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(supportEmail)) throw new Error('Unsafe support address');
  return { origin: origin.origin, supportEmail };
}
function render(to: string, subject: string, paragraphs: readonly string[], lang: string, options: MailOptions, action?: { label: string; url: string }): Mail {
  if (/[\r\n]/.test(subject)) throw new Error('Unsafe mail subject');
  const language = locale(lang), local = copy[language], { supportEmail } = settings(options);
  const footer = `${local.support} ${supportEmail}`;
  const text = [subject, ...paragraphs, ...(action ? [action.label, action.url] : []), footer, `DevelopED · ${local.automated}`].join('\n\n');
  let html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#090e1b;color:#e8eefc;font-family:Inter,Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(paragraphs[0] || subject)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090e1b"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#142038;border:1px solid #30415e;border-radius:18px"><tr><td style="padding:32px"><div style="font-size:26px;font-weight:700;letter-spacing:-1px;color:#ffffff">Develop<span style="color:#70b6ff">ED</span></div><h1 style="font-size:25px;line-height:1.35;margin:28px 0 20px;color:#ffffff">${escape(subject)}</h1>${paragraphs.map(p => `<p style="font-size:16px;line-height:1.65;margin:0 0 18px;white-space:pre-line">${escape(p)}</p>`).join('')}${action ? `<p style="margin:28px 0"><a href="${escape(action.url)}" style="display:inline-block;padding:14px 22px;background:#76baff;color:#061326;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px">${escape(action.label)}</a></p><p style="font-size:13px;line-height:1.6;color:#b7c8e2">${escape(local.fallback)}<br><a href="${escape(action.url)}" style="color:#91c7ff;word-break:break-all">${escape(action.url)}</a></p>` : ''}<hr style="border:0;border-top:1px solid #30415e;margin:28px 0"><p style="font-size:14px;line-height:1.6;color:#b7c8e2">${escape(local.support)} <a href="mailto:${escape(supportEmail)}" style="color:#91c7ff">${escape(supportEmail)}</a></p><p style="font-size:12px;line-height:1.6;color:#b7c8e2">DevelopED · ${escape(local.automated)}</p></td></tr></table></td></tr></table></body></html>`;
  if (options.mailBrand === 'mega-music') {
    const note = {en:'Your DevelopED ecosystem account also works with other participating apps. Learn more at developed.sk.',
      sk:'Tvoj účet v ekosystéme DevelopED funguje aj v ďalších zapojených aplikáciách. Viac na developed.sk.',
      cs:'Tvůj účet v ekosystému DevelopED funguje také v dalších zapojených aplikacích. Více na developed.sk.',
      uk:'Ваш обліковий запис екосистеми DevelopED також працює в інших її застосунках. Докладніше на developed.sk.'}[language];
    html = html.replace('Develop<span style="color:#70b6ff">ED</span>','<img src="cid:mega-music-logo" alt="Mega Music" width="96" height="96">')
      .replaceAll('#090e1b','#121212').replaceAll('#142038','#1f1f1f').replaceAll('#30415e','#671d28')
      .replaceAll('#76baff','#d90007').replaceAll('#061326','#ffffff').replaceAll('#91c7ff','#ff737c')
      .replace('</h1>',`</h1><p style="line-height:1.6">${escape(note)}</p>`);
    return {to,subject,text:`Mega Music\n\n${note}\n\n${text}`,html,brand:'mega-music',
      inlineLogo:readFileSync(new URL('../public/music-logo.png',import.meta.url)).toString('base64')};
  }
  return { to, subject, text, html };
}
export function credentialMail(to: string, purpose: string, link: string, lang: string, options: MailOptions = {}): Mail {
  const lifetime = credentialLifetime(purpose), key = purpose as Purpose, local = copy[locale(lang)];
  const url = new URL(link), expectedOrigin = settings(options).origin;
  const route = key === 'invitation' ? '/register' : key === 'recovery' ? '/reset-password' : '/verify-email';
  const fragment = key === 'invitation' ? 'invitation' : 'token';
  if (url.origin !== expectedOrigin || url.username || url.password || url.pathname !== route || url.search || !new RegExp(`^#${fragment}=[A-Za-z0-9_-]{8,100}$`).test(url.hash) || url.href !== link) throw new Error('Unsafe credential link');
  const [subject, intro, label] = local[key];
  return render(to, subject, [intro, local.expiry[lifetime === 604800 ? 2 : lifetime === 86400 ? 1 : 0], local.ignore], lang, options, { label, url: link });
}
export function securityMail(to: string, lang: string, options: MailOptions = {}, action = ''): Mail {
  const local = copy[locale(lang)], confirmed = action === 'verification';
  const [subject, intro, label] = confirmed ? local.verified : local.security;
  return render(to, subject, [intro], lang, options, { label, url: `${settings(options).origin}${confirmed ? '/login' : '/security'}` });
}
export function reportMail(to: string, reference: string, appName: string, lang: string, operator: boolean, options: MailOptions = {}): Mail {
  if (!/^DEV-[0-9]+$/.test(reference)) throw new Error('Invalid report reference');
  const local = copy[locale(lang)], message = operator ? local.alert : local.report;
  // App names are body text only; never incorporate user-controlled text in headers.
  return render(to, `${message[0]} — ${reference}`, [message[1], `${local.reference}: ${reference}`, `${local.app}: ${appName}`], lang, options,
    operator ? { label: local.alert[2], url: `${settings(options).origin}/admin/reports` } : undefined);
}
export function registrationMail(to: string, userEmail: string, displayName: string, appName: string, lang: string, options: MailOptions = {}): Mail {
  const local = copy[locale(lang)];
  return render(to, local.registration[0], [local.registration[1], `${local.user}: ${userEmail}`, `${local.name}: ${displayName}`, `${local.app}: ${appName}`], lang, options,
    { label: local.registration[2], url: `${settings(options).origin}/admin/users` });
}
/** Safely render older encrypted outbox entries during a rolling upgrade. */
export function legacyMailHtml(mail: Mail, options: MailOptions = {}): string {
  return render(mail.to, mail.subject, [mail.text], 'en', options).html!;
}
