import { h, button } from '../dom.js';
import { t, errorText } from '../i18n.js';

export function launcherCard(state, actions) {
  const status = state.launcher;
  const replacement = status?.replacements.find(entry => entry.package === state.launcherPackage);
  const ready = replacement?.installed && replacement.enabled && replacement.isHomeCandidate;
  const active = ready && status.home === replacement.package;
  const message = !state.launcherPackage ? 'launcher.keepOriginal' : active ? 'launcher.active' : ready ? 'launcher.ready' : !replacement ? 'launcher.unknown'
    : !replacement.installed ? 'launcher.notInstalled' : !replacement.enabled ? 'launcher.notEnabled' : 'launcher.notCandidate';
  return h('section', { className: 'card stack', 'aria-labelledby': 'launcher-title' },
    h('h2', { id: 'launcher-title' }, t('launcher.title')),
    button(t(state.launcherExpanded ? 'launcher.hideSteps' : 'launcher.showSteps'), () => {
      state.launcherExpanded = !state.launcherExpanded; actions.render();
    }, { id: 'launcher-disclosure', 'aria-expanded': String(Boolean(state.launcherExpanded)), 'aria-controls': 'launcher-steps' }),
    state.launcherExpanded && h('div', { className: 'stack', id: 'launcher-steps' },
    h('p', {}, t('launcher.intro')),
    h('fieldset', { className: 'launcher-choices stack', disabled: state.busy },
      h('legend', {}, t('launcher.choice')),
      h('label', { className: 'check-label' }, h('input', { type: 'radio', name: 'launcher', id: 'launcher-original',
        value: '', checked: !state.launcherPackage, onchange: () => actions.selectLauncher('') }), t('launcher.keepOriginal')),
      status?.replacements.map(entry => h('label', { className: 'check-label' },
        h('input', { type: 'radio', name: 'launcher', id: `launcher-${entry.package}`, value: entry.package,
          checked: state.launcherPackage === entry.package, onchange: () => actions.selectLauncher(entry.package) }),
        h('span', { className: 'app-copy' }, h('strong', {}, entry.name), h('span', { className: 'small' },
          t(!entry.installed ? 'launcher.optionAbsent' : entry.enabled && entry.isHomeCandidate ? 'launcher.optionReady' : 'launcher.optionInstalled')))))),
    state.launcherPackage && h('ol', { className: 'launcher-steps' },
      h('li', {}, button(t('launcher.openStore'), actions.openLauncherStore, { id: 'launcher-store', disabled: state.busy || !replacement })),
      replacement && h('li', {}, h('p', {}, t('launcher.install', { name: replacement.name }))),
      h('li', {}, button(t('launcher.check'), actions.checkLauncher, { id: 'launcher-check', disabled: state.busy || !state.launcherPackage })),
      h('li', {}, button(t('launcher.switch'), actions.confirmLauncherSwap,
        { id: 'launcher-switch', primary: true, disabled: state.busy || !ready || active }))),
    h('p', { role: 'status', 'aria-live': 'polite' }, state.launcherError ? errorText(state.launcherError) : t(message, { name: replacement?.name })),
    state.launcherError && !state.launcherPackage && button(t('launcher.check'), actions.checkLauncher, { id: 'launcher-check', disabled: state.busy }),
    state.storeOpened && replacement && h('p', { className: 'small' }, t('launcher.storeOpened', { name: replacement.name })),
    button(t('launcher.restore'), actions.confirmLauncherRestore, { id: 'launcher-restore', disabled: state.busy })));
}
