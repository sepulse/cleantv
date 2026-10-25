import { h } from '../dom.js';
import { t, registryText } from '../i18n.js';
import { icon } from '../icons.js';

export function privacyAudit(packages) {
  return packages.filter(entry => ['telemetry', 'ads'].includes(entry.category) && entry.installed && entry.enabled);
}

export function privacyCard(state, compact = false) {
  const entries = privacyAudit(state.packages);
  const count = t(entries.length ? 'privacy.count' : 'privacy.empty', { n: entries.length });
  if (compact || !entries.length) return h('section', { className: 'card stack', id: 'privacy-audit', 'aria-labelledby': 'privacy-title' },
    h('h2', { id: 'privacy-title' }, t('privacy.title')), h('p', {}, count));
  return h('details', { className: 'category', id: 'privacy-audit', open: !state.collapsed.has('privacy'), ontoggle: event => {
    event.target.open ? state.collapsed.delete('privacy') : state.collapsed.add('privacy');
  } }, h('summary', {}, t('privacy.title'), h('span', { className: 'micro' }, ' · ', count)),
  h('div', { className: 'app-list' }, h('p', {}, t('privacy.intro')),
    h('ul', { className: 'results' }, entries.map(entry => h('li', { className: 'chips' },
      h('span', { className: 'app-copy' }, registryText(entry)),
      h('span', { className: `pill ${{ green: 'safe', yellow: 'optional', red: 'protected' }[entry.risk]}` },
        icon(entry.risk === 'red' ? 'lock' : entry.risk === 'green' ? 'check' : 'optional'), t(`risk.${entry.risk}`)))))));
}
