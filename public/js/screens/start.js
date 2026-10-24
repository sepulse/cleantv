import { h, heading, button } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';

export function startScreen(state, actions) {
  const ready = state.health?.adb.found;
  return h('section', { className: 'screen' },
    h('div', { className: 'card stack' }, icon('tv', 'hero-icon'), heading(t('start.title'), t('app.promise')),
      !state.health ? h('p', { role: 'status' }, t('start.checking')) : ready
        ? button(t('start.begin'), () => actions.go('setup'), { primary: true, id: 'begin' })
        : h('div', { className: 'stack' }, h('h2', {}, t('start.missingTitle')), h('p', {}, t('start.missingBody')),
          button(t('start.checkAgain'), actions.health, { id: 'check-health' }))));
}
