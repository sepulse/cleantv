import { h, heading, button } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { resultRow } from './progress.js';

export function doneScreen(state, actions) {
  const summary = state.summary;
  const skipped = summary.results.filter(item => item.result === 'skipped').length;
  return h('section', { className: 'screen' },
    heading(t(summary.failed ? 'done.partialTitle' : state.operation === 'restore' ? 'done.restoreTitle' : 'done.title'), t('done.intro')),
    h('div', { className: 'card stack' }, icon(summary.failed ? 'optional' : 'check', 'hero-icon success-icon'),
      h('div', { className: 'totals' }, [['succeeded', summary.succeeded], ['skipped', skipped], ['failed', summary.failed]].map(([key, value]) =>
        h('div', { className: 'total' }, h('strong', {}, t('common.number', { n: value })), h('span', {}, t(`done.${key}`))))),
      h('p', {}, t('done.tip'))),
    h('ul', { className: 'results' }, summary.results.map(item => resultRow(state, item))),
    h('div', { className: 'actions' }, button(t('done.back'), actions.backToList, { primary: true, id: 'back-list' }),
      button(t('common.restore'), actions.confirmRestore, { id: 'restore-done', disabled: state.busy })),
    button(t('done.history'), actions.history, { className: 'link', id: 'history' }));
}
