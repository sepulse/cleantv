import { h, heading, button } from '../dom.js';
import { t, registryText } from '../i18n.js';
import { icon } from '../icons.js';
import { appName, resultRow } from './progress.js';

export function doneScreen(state, actions) {
  const summary = state.summary;
  const launcher = state.operation.startsWith('launcher');
  const skipped = summary.results.filter(item => item.result === 'skipped').length;
  const stock = state.packages.find(entry => entry.package === summary.manualHomePackage);
  return h('section', { className: 'screen' },
    heading(t(state.operation === 'dns' ? summary.failed ? 'dns.failedTitle' : 'dns.doneTitle' : launcher ? summary.failed ? 'launcher.failedTitle' : state.operation === 'launcherSwap' ? 'launcher.doneTitle' : 'launcher.restoredTitle'
      : summary.failed ? 'done.partialTitle' : state.operation === 'restore' ? 'done.restoreTitle' : 'done.title',
      { name: appName(state, summary.results.find(item => item.result === 'switched')?.package) }), t('done.intro')),
    h('div', { className: 'card stack' }, icon(summary.failed ? 'optional' : 'check', 'hero-icon success-icon'),
      h('div', { className: 'totals' }, [['succeeded', summary.succeeded], ['skipped', skipped], ['failed', summary.failed]].map(([key, value]) =>
        h('div', { className: 'total' }, h('strong', {}, t('common.number', { n: value })), h('span', {}, t(`done.${key}`))))),
      h('p', {}, t(state.operation === 'dns' ? 'dns.warning' : launcher ? 'launcher.doneTip' : 'done.tip'))),
    summary.journalWarning && h('p', { role: 'status' }, t('launcher.journalWarning')),
    summary.manualHomePackage && h('div', { className: 'card stack', role: 'status' },
      h('p', {}, t('launcher.manualHome', { stock: stock ? registryText(stock) : t('launcher.stockName') })),
      button(t('launcher.check'), () => actions.startJob('launcherRestore'), { id: 'launcher-check-restore', disabled: state.busy })),
    h('ul', { className: 'results' }, summary.results.map(item => resultRow(state, item))),
    h('div', { className: 'actions' }, button(t('done.back'), actions.backToList, { primary: true, id: 'back-list' }),
      button(t('common.restore'), actions.confirmRestore, { id: 'restore-done', disabled: state.busy }),
      button(t('closeAdb.button'), actions.confirmCloseAdb, { id: 'close-adb', disabled: state.busy })),
    launcher && button(t('launcher.restore'), actions.confirmLauncherRestore, { id: 'launcher-restore-done', disabled: state.busy }),
    button(t('done.history'), actions.history, { className: 'link', id: 'history' }));
}
