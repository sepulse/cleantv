import { h, button } from '../dom.js';
import { t, getLanguage } from '../i18n.js';
import { appName } from './progress.js';

export function confirmScreen(state, actions) {
  const history = state.modal === 'history';
  const restore = state.modal === 'restore';
  const launcher = ['launcherSwap', 'launcherRestore'].includes(state.modal);
  const prefix = launcher ? `launcher.${state.modal === 'launcherSwap' ? 'confirm' : 'restoreConfirm'}` : restore ? 'restore' : 'confirm';
  const name = state.launcher?.replacements.find(entry => entry.package === state.launcherPackage)?.name;
  const title = t(history ? 'history.title' : `${prefix}.title`, { name });
  const dialog = h('dialog', { id: 'confirm-dialog', 'aria-labelledby': 'dialog-title', 'aria-describedby': history ? null : 'dialog-body',
    oncancel: event => { event.preventDefault(); actions.closeModal(); } },
  h('div', { className: 'stack' }, h('h2', { id: 'dialog-title' }, title), history
    ? state.historyEntries.length ? h('ul', { className: 'journal' }, state.historyEntries.map(item => {
      const date = new Date(item.at);
      return h('li', {}, h('strong', {}, appName(state, item.package)),
        h('p', {}, t('history.entry', { action: t(`history.${item.action}`), result: t(`result.${item.result}`) })),
        h('p', { className: 'small' }, t('history.at', { date: Number.isNaN(date.getTime()) ? t('common.loading') : date.toLocaleString(getLanguage() === 'ms' ? 'ms-MY' : 'en-MY') })));
    })) : h('p', {}, t('history.empty'))
    : h('p', { id: 'dialog-body' }, t(`${prefix}.body`, { n: state.selected.size, name })),
  h('div', { className: 'actions' }, button(t(history ? 'common.close' : 'common.cancel'), actions.closeModal, { id: 'modal-cancel', autofocus: true }),
    !history && button(t(`${prefix}.accept`), () => actions.startJob(launcher ? state.modal : restore ? 'restore' : 'disable'), { primary: true, id: 'modal-confirm' }))));
  return dialog;
}
