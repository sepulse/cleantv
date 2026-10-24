import { h, button } from '../dom.js';
import { t, errorText } from '../i18n.js';

export function launcherCard(state, actions) {
  const status = state.launcher;
  const replacement = status?.replacement;
  const ready = replacement?.installed && replacement.enabled && replacement.isHomeCandidate;
  const active = ready && status.home === replacement.package;
  const message = active ? 'launcher.active' : ready ? 'launcher.ready' : !replacement ? 'launcher.unknown'
    : !replacement.installed ? 'launcher.notInstalled' : !replacement.enabled ? 'launcher.notEnabled' : 'launcher.notCandidate';
  return h('section', { className: 'card stack', 'aria-labelledby': 'launcher-title' },
    h('h2', { id: 'launcher-title' }, t('launcher.title')),
    button(t(state.launcherExpanded ? 'launcher.hideSteps' : 'launcher.showSteps'), () => {
      state.launcherExpanded = !state.launcherExpanded; actions.render();
    }, { id: 'launcher-disclosure', 'aria-expanded': String(Boolean(state.launcherExpanded)), 'aria-controls': 'launcher-steps' }),
    state.launcherExpanded && h('div', { className: 'stack', id: 'launcher-steps' },
    h('p', {}, t('launcher.intro')),
    h('ol', { className: 'launcher-steps' },
      h('li', {}, button(t('launcher.openStore'), actions.openLauncherStore, { id: 'launcher-store', disabled: state.busy })),
      h('li', {}, h('p', {}, t('launcher.install'))),
      h('li', {}, button(t('launcher.check'), actions.checkLauncher, { id: 'launcher-check', disabled: state.busy })),
      h('li', {}, button(t('launcher.switch'), actions.confirmLauncherSwap,
        { id: 'launcher-switch', primary: true, disabled: state.busy || !ready || active }))),
    h('p', { role: 'status', 'aria-live': 'polite' }, state.launcherError ? errorText(state.launcherError) : t(message)),
    state.storeOpened && h('p', { className: 'small' }, t('launcher.storeOpened')),
    button(t('launcher.restore'), actions.confirmLauncherRestore, { id: 'launcher-restore', disabled: state.busy })));
}
