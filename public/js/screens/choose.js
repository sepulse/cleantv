import { h, heading, button } from '../dom.js';
import { t, registryText, errorText } from '../i18n.js';
import { icon } from '../icons.js';

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
export function chooseScreen(state, actions) {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const entry of state.packages.filter(entry => entry.installed)) counts[protectedApp(entry) ? 'red' : entry.risk]++;
  return h('section', { className: 'screen' }, heading(t('choose.title'), t('choose.intro')),
    h('div', { className: 'card stack' }, h('div', { className: 'tv-card' }, icon('tv'), h('div', { className: 'tv-info' },
      h('h2', {}, t('choose.device', state.info)), h('p', {}, t('choose.android', { version: state.info.androidVersion }))),
      h('span', { className: 'pill connected' }, icon('check'), t('choose.connected'))),
    h('div', { className: 'chips' }, h('span', { className: 'pill safe' }, icon('check'), t('choose.safeCount', { n: counts.green })),
      h('span', { className: 'pill optional' }, icon('optional'), t('choose.optionalCount', { n: counts.yellow })),
      h('span', { className: 'pill protected' }, icon('lock'), t('choose.protectedCount', { n: counts.red })))),
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
    h('div', { className: 'bottom-bar' }, button(t('common.restore'), actions.confirmRestore, { id: 'restore-bottom', disabled: state.busy }),
      button(t('choose.clean', { n: state.selected.size }), actions.confirmClean, { id: 'clean', primary: true, disabled: !state.selected.size || state.busy })));
}
