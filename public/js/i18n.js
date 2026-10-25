let language = 'ms';
let messages = {};
const unavailable = 'CleanTV could not load its language files. Reload this page. / CleanTV tidak dapat memuatkan fail bahasa. Muat semula halaman ini.';
export async function initI18n() {
  const [en, ms] = await Promise.all(['en', 'ms'].map(async code => {
    const response = await fetch(`/i18n/${code}.json`);
    if (!response.ok) throw new Error('I18N_UNAVAILABLE');
    return response.json();
  }));
  messages = { en, ms };
  try {
    const saved = localStorage.getItem('cleantv-language');
    if (saved === 'en' || saved === 'ms') language = saved;
  } catch { /* Storage may be unavailable. */ }
  document.documentElement.lang = language;
}
export function t(key, vars = {}) {
  const n = vars.n ?? vars.total;
  const selected = n === 1 && (messages[language]?.[`${key}.one`] ?? messages.en?.[`${key}.one`]) ? `${key}.one` : key;
  const message = messages[language]?.[selected] || messages.en?.[selected]
    || (key === 'error.I18N_UNAVAILABLE' ? unavailable : key);
  return message.replace(/\{(\w+)\}/g, (match, name) => vars[name] === undefined ? match : String(vars[name]));
}
export function getLanguage() { return language; }
export function setLanguage(value) {
  if (!['ms', 'en'].includes(value)) return;
  language = value;
  document.documentElement.lang = value;
  try { localStorage.setItem('cleantv-language', value); } catch { /* Best effort. */ }
}
export function registryText(entry, field = 'label') {
  return entry[field]?.[language] || entry[field]?.en || t('apps.unknown');
}
export function errorText(code) {
  return t(Object.hasOwn(messages.en, `error.${code}`) ? `error.${code}` : 'error.INTERNAL');
}
