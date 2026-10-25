import { h, button } from '../dom.js';
import { t } from '../i18n.js';

export function dnsCard(state, actions) {
  return h('section', { className: 'card stack', 'aria-labelledby': 'dns-title' },
    h('h2', { id: 'dns-title' }, t('dns.title')),
    h('p', {}, t('dns.intro')),
    h('p', { id: 'dns-warning' }, t('dns.warning')),
    h('fieldset', { className: 'launcher-choices stack', disabled: state.busy, 'aria-describedby': 'dns-warning' },
      h('legend', {}, t('dns.choice')),
      [{ id: 'off', name: t('dns.off') }, ...(state.info.dnsProviders ?? [])].map(entry =>
        h('label', { className: 'check-label', for: `dns-${entry.id}` },
          h('input', { type: 'radio', name: 'dns', id: `dns-${entry.id}`, value: entry.id,
            checked: state.dnsProvider === entry.id, onchange: () => actions.selectDns(entry.id) }), entry.name))),
    button(t('dns.apply'), actions.confirmDns, { id: 'dns-apply', disabled: state.busy }));
}
