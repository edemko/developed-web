import type { Mail } from './mail-templates.js';

export type AmpWatchAlert = {
  id: string; listing_id: string; listing_title: string;
  kind: 'price' | 'status' | 'condition' | 'functional_state';
  old_value: string; new_value: string; locale: string;
};
const wording = {
  sk: { subject: "Zmena sledovanej ponuky", price: "Cena", status: "Dostupnosť", condition: "Stav", functional_state: "Funkčný stav", view: "Zobraziť ponuku", settings: "Sledovanie môžete vypnúť na stránke ponuky." },
  cs: { subject: "Změna sledované nabídky", price: "Cena", status: "Dostupnost", condition: "Stav", functional_state: "Funkční stav", view: "Zobrazit nabídku", settings: "Sledování můžete vypnout na stránce nabídky." },
  uk: { subject: "Зміна відстежуваного оголошення", price: "Ціна", status: "Доступність", condition: "Стан", functional_state: "Функціональний стан", view: "Переглянути оголошення", settings: "Відстеження можна вимкнути на сторінці оголошення." },
};
const values: Record<keyof typeof wording, Record<string, string>> = {
  sk: { "": "Neuvedené", active: "Dostupné", reserved: "Rezervované", sold: "Predané", traded: "Vymenené", removed: "Odstránené", new: "Nové", like_new: "Ako nové", good: "Dobrý stav", fair: "Opotrebované", for_parts: "Na náhradné diely", working: "Plne funkčné", issues: "Funkčné s nedostatkami", broken: "Nefunkčné", untested: "Neodskúšané" },
  cs: { "": "Neuvedeno", active: "Dostupné", reserved: "Rezervováno", sold: "Prodáno", traded: "Vyměněno", removed: "Odstraněno", new: "Nové", like_new: "Jako nové", good: "Dobrý stav", fair: "Opotřebené", for_parts: "Na náhradní díly", working: "Plně funkční", issues: "Funkční s nedostatky", broken: "Nefunkční", untested: "Nevyzkoušené" },
  uk: { "": "Не вказано", active: "Доступне", reserved: "Зарезервовано", sold: "Продано", traded: "Обміняно", removed: "Видалено", new: "Нове", like_new: "Майже нове", good: "Добрий стан", fair: "Зношене", for_parts: "На запчастини", working: "Повністю справний", issues: "Працює з недоліками", broken: "Несправний", untested: "Не перевірено" },
};


const details = {
  sk: { intro: 'V ponuke, ktorú sledujete na AMP, nastala zmena.', before: 'Predtým', after: 'Teraz', support: 'Potrebujete pomoc?', reason: 'Tento e-mail dostávate, pretože ste si zapli sledovanie tejto ponuky na AMP.' },
  cs: { intro: 'V nabídce, kterou sledujete na AMP, došlo ke změně.', before: 'Předtím', after: 'Nyní', support: 'Potřebujete pomoc?', reason: 'Tento e-mail dostáváte, protože jste si zapnuli sledování této nabídky na AMP.' },
  uk: { intro: 'Оголошення, яке ви відстежуєте на AMP, змінилося.', before: 'Раніше', after: 'Тепер', support: 'Потрібна допомога?', reason: 'Ви отримали цей лист, оскільки ввімкнули відстеження цього оголошення на AMP.' },
};
function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function ampWatchMail(to: string, alert: AmpWatchAlert): Mail {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alert.listing_id)) throw new Error('Invalid AMP listing ID');
  const locale = alert.locale === 'cs' || alert.locale === 'uk' ? alert.locale : 'sk';
  const t = wording[locale], d = details[locale];
  if (!['price', 'status', 'condition', 'functional_state'].includes(alert.kind)) throw new Error('Invalid AMP change');
  const value = (raw: string) => alert.kind === 'price'
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(Number(raw) / 100)
    : values[locale][raw] ?? raw;
  const before = value(alert.old_value), after = value(alert.new_value);
  const title = alert.listing_title.replace(/[\r\n]+/g, ' ');
  const subject = `AMP — ${t.subject}: ${title}`.slice(0, 180);
  const url = `https://amp.developed.sk/${locale}/listings/${alert.listing_id}`;
  const text = `AMP · Airsoft Marketplace\n\n${t.subject}\n${d.intro}\n\n${title}\n${t[alert.kind]}: ${before} → ${after}\n\n${t.view}: ${url}\n\n${d.reason} ${t.settings}\n${d.support} info@developed.sk`;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#dedbc8;color:#22271d;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#dedbc8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#efeddf;border:1px solid #92927e;border-top:6px solid #e87524">
<tr><td style="padding:28px;background:#293d26;color:#f4f2e7"><a href="https://amp.developed.sk/${locale}" style="color:#f4f2e7;text-decoration:none;font-size:36px;font-weight:900;letter-spacing:3px">AMP</a><div style="font-size:12px;letter-spacing:2px;margin-top:6px">AIRSOFT MARKETPLACE</div></td></tr>
<tr><td style="padding:28px"><h1 style="font-size:24px;line-height:1.3;text-transform:uppercase;margin:0 0 16px">${escape(t.subject)}</h1><p style="line-height:1.6">${escape(d.intro)}</p><h2 style="font-size:20px;line-height:1.4;overflow-wrap:anywhere">${escape(title)}</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="12" style="background:#dedbc8;border-left:4px solid #e87524"><tr><td colspan="2" style="font-weight:bold">${escape(t[alert.kind])}</td></tr><tr><td>${escape(d.before)}<br><span style="font-size:18px">${escape(before)}</span></td><td>${escape(d.after)}<br><strong style="font-size:18px">${escape(after)}</strong></td></tr></table>
<p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#293d26;color:#ffffff;padding:14px 22px;text-decoration:none;font-weight:bold">${escape(t.view)}</a></p>
<p style="font-size:12px;word-break:break-all"><a href="${url}" style="color:#293d26">${url}</a></p>
<hr style="border:0;border-top:1px solid #92927e;margin:28px 0"><p style="font-size:13px;line-height:1.6">${escape(d.reason)} ${escape(t.settings)}</p><p style="font-size:13px">${escape(d.support)} <a href="mailto:info@developed.sk" style="color:#293d26">info@developed.sk</a></p><p style="font-size:12px">AMP · Airsoft Marketplace</p>
</td></tr></table></td></tr></table></body></html>`;
  return { to, subject, text, html, brand: 'amp' };
}
