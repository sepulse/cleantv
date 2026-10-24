import { h, heading } from '../dom.js';
import { t, registryText, errorText } from '../i18n.js';
import { icon } from '../icons.js';

export function appName(state, pkg) {
  const entry = state.packages.find(entry => entry.package === pkg);
  return entry ? registryText(entry) : t('apps.unknown');
}
export function resultRow(state, item) {
  const result = t(`result.${item.result}`);
  return h('li', { className: `result ${item.result}` }, icon(item.result === 'failed' ? 'error' : item.result === 'skipped' ? 'skip' : 'check'),
    h('div', {}, h('strong', {}, appName(state, item.package)), h('p', { className: 'small' }, item.reason
      ? t('result.reason', { result, reason: errorText(item.reason) }) : result)));
}
export function progressScreen(state) {
  const percentage = state.total ? Math.round(state.results.length / state.total * 100) : 0;
  return h('section', { className: 'screen' }, heading(t(state.operation === 'restore' ? 'progress.restoreTitle' : 'progress.title')),
    h('div', { className: 'card stack' }, h('div', { id: 'percentage', className: 'percentage' }, t('common.percent', { n: percentage })),
      h('progress', { id: 'job-progress', max: state.total || 1, value: state.results.length, 'aria-label': t('progress.label') }),
      h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
        h('p', { id: 'progress-count' }, t('progress.count', { done: state.results.length, total: state.total })),
        h('p', { id: 'current-app' }, state.current ? t('progress.current', { app: appName(state, state.current) }) : t('progress.starting'))),
      h('p', {}, t('progress.note'))),
    h('ul', { className: 'results', id: 'job-results', 'aria-live': 'polite', 'aria-relevant': 'additions' }, state.results.map(item => resultRow(state, item))));
}

// Update the existing bar so its CSS width transition remains smooth.
export function updateProgress(state) {
  const bar = document.getElementById('job-progress');
  if (!bar) return;
  bar.max = state.total || 1;
  bar.value = state.results.length;
  document.getElementById('percentage').textContent = t('common.percent', { n: state.total ? Math.round(state.results.length / state.total * 100) : 0 });
  document.getElementById('progress-count').textContent = t('progress.count', { done: state.results.length, total: state.total });
  document.getElementById('current-app').textContent = t('progress.current', { app: appName(state, state.current) });
  const list = document.getElementById('job-results');
  for (const item of state.results.slice(list.children.length)) list.append(resultRow(state, item));
}
