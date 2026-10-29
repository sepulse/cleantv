import { h, heading, button } from '../dom.js';
import { t, registryText, errorText } from '../i18n.js';
import { icon } from '../icons.js';
import { launcherCard, prayerPromoCard } from './launcher.js';
import { dnsCard } from './dns.js';
import { privacyCard } from './privacy.js';

export const protectedApp = entry => Boolean(entry.blockedReason) || entry.risk === 'red';
const categories = ['ads', 'telemetry', 'bloat', 'store', 'assistant', 'system'];
function appRow(entry, index, state, actions) {
  const locked = protectedApp(entry);
  const id = `app-${index}`;
  const risk = locked ? 'red' : entry.risk;
  const reason = entry.blockedReason ? errorText(entry.blockedReason) : t('apps.protectedDefault');
  return h('div', { className: `app-row${entry.installed ? '' : ' absent'}` },
    locked ? h('span', { className: 'lock-control', tabindex: '0', role: 'img', 'aria-label': t('apps.protected', { reason }),
      'aria-describedby': `${id}-reason`, id }, icon('lock'), h('span', { className: 'tooltip', id: `${id}-reason`, role: 'tooltip' }, reason))
      : h('input', { type: 'checkbox', id, checked: state.selected.has(entry.package), disabled: !entry.canDisable || !entry.enabled,
        onchange: event => { event.target.checked ? state.selected.add(entry.package) : state.selected.delete(entry.package); actions.render(); } }),
    h('div', { className: 'app-copy' }, locked ? h('strong', {}, registryText(entry)) : h('label', { for: id }, registryText(entry)),
      h('p', {}, registryText(entry, 'description')),
      h('p', { className: 'effect' }, t('apps.effect', { effect: registryText(entry, 'effect') })),
      h('div', { className: 'chips' }, h('span', { className: `pill ${{ green: 'safe', yellow: 'optional', red: 'protected' }[risk]}` },
        icon(locked ? 'lock' : risk === 'green' ? 'check' : 'optional'), t(`risk.${risk}`)),
      entry.verified === false && h('span', { className: 'micro' }, t('apps.unverified')),
      !entry.installed ? h('span', { className: 'micro' }, t('apps.absent')) : !entry.enabled && h('span', { className: 'micro' }, t('apps.disabled')))));
}
function manualStock(state) {
  const stock = state.packages.find(entry => entry.package === state.manualHomePackage);
  return stock ? registryText(stock) : t('launcher.stockName');
}
export function chooseScreen(state, actions) {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const entry of state.packages.filter(entry => entry.installed)) counts[protectedApp(entry) ? 'red' : entry.risk]++;
  const reenabled = (state.reenabled ?? []).map(pkg => state.packages.find(entry => entry.package === pkg) ?? { package: pkg, label: { en: pkg } });
  const selectable = reenabled.filter(entry => entry.canDisable && entry.enabled);
  return h('section', { className: 'screen choose-screen' }, heading(t('choose.title'), t('choose.intro')),
    state.recovered && h('p', { role: 'status' }, t('launcher.recovered')),
    state.manualHomePackage && h('p', { role: 'status' }, t('launcher.manualHome', { stock: manualStock(state) })),
    state.journalWarning && h('p', { role: 'status' }, t('launcher.journalWarning')),
    h('div', { className: 'card stack' }, h('div', { className: 'tv-card' }, icon('tv'), h('div', { className: 'tv-info' },
      h('h2', {}, t('choose.device', { ...state.info, brand: state.info.brand.charAt(0).toUpperCase() + state.info.brand.slice(1) })), h('p', {}, t('choose.android', { version: state.info.androidVersion }))),
      h('span', { className: 'pill connected' }, icon('check'), t('choose.connected'))),
    h('div', { className: 'chips' }, h('span', { className: 'pill safe' }, icon('check'), t('choose.safeCount', { n: counts.green })),
      h('span', { className: 'pill optional' }, icon('optional'), t('choose.optionalCount', { n: counts.yellow })),
      h('span', { className: 'pill protected' }, icon('lock'), t('choose.protectedCount', { n: counts.red })))),
    prayerPromoCard(state, actions),
    reenabled.length > 0 && h('div', { className: 'card stack', role: 'status', id: 'reenabled-card', 'aria-labelledby': 'reenabled-title' },
      h('h2', { id: 'reenabled-title' }, t('choose.reenabledTitle')),
      h('ul', { className: 'results' }, reenabled.map(entry => h('li', {}, registryText(entry)))),
      button(t('choose.disableAgain'), () => {
        if (state.busy) return;
        state.selected = new Set(selectable.map(entry => entry.package));
        actions.confirmClean();
      }, { id: 'disable-again', disabled: state.busy || !selectable.length })),
    privacyCard(state),
    categories.map(category => {
      // Launchers stay in the approved System group, including their protection reason.
      const entries = state.packages.filter(entry => (entry.category === 'launcher' ? 'system' : entry.category) === category
        && (entry.installed || state.showAbsent));
      if (!entries.length) return null;
      return h('details', { className: 'category', open: !state.collapsed.has(category), ontoggle: event => {
        event.target.open ? state.collapsed.delete(category) : state.collapsed.add(category);
      } }, h('summary', { id: `category-${category}` }, t(`category.${category}`)),
      h('div', { className: 'app-list' }, entries.map(entry => appRow(entry, state.packages.indexOf(entry), state, actions))));
    }),
    h('label', { className: 'check-label', for: 'show-absent' }, h('input', { id: 'show-absent', type: 'checkbox', checked: state.showAbsent,
      onchange: event => { state.showAbsent = event.target.checked; actions.render(); } }), t('choose.absent')),
    launcherCard(state, actions),
    dnsCard(state, actions),
    h('div', { className: 'bottom-bar', id: 'bottom-bar' }, button(t('common.restore'), actions.confirmRestore, { id: 'restore-bottom', disabled: state.busy }),
      button(t('choose.clean', { n: state.selected.size }), actions.confirmClean, { id: 'clean', primary: true, disabled: !state.selected.size || state.busy })));
}
