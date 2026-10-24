import { h, button } from './dom.js';
import { api, jobEvents } from './api.js';
import { initI18n, t, getLanguage, setLanguage, errorText } from './i18n.js';
import { startScreen } from './screens/start.js';
import { setupScreen } from './screens/setup.js';
import { connectScreen } from './screens/connect.js';
import { chooseScreen } from './screens/choose.js';
import { progressScreen, updateProgress } from './screens/progress.js';
import { doneScreen } from './screens/done.js';
import { confirmScreen } from './screens/confirm.js';

const state = {
  screen: 'start', health: null, brand: 'google', prepared: false, connection: 'idle',
  candidates: null, manualIP: '', candidate: null, serial: null, info: null, packages: [],
  selected: new Set(), collapsed: new Set(), showAbsent: false, busy: false, error: null,
  modal: null, historyEntries: [], operation: 'disable', results: [], total: 0, current: null, summary: null,
};
const screens = { start: startScreen, setup: setupScreen, connect: connectScreen, choose: chooseScreen, progress: progressScreen, done: doneScreen };
const flow = ['setup', 'connect', 'choose', 'progress', 'done'];
const flowKeys = ['flow.setup', 'flow.connect', 'flow.choose', 'flow.clean', 'flow.done'];
const root = document.getElementById('app');
const header = document.getElementById('header');
let lastScreen;
let pollTimer;
let connectionGeneration = 0;
let permissionDeadline = 0;
let source;
let modalOpener;

function render() {
  const focused = document.activeElement?.id;
  const changed = lastScreen !== state.screen;
  document.title = t('app.name');
  header.replaceChildren(h('div', { className: 'header-brand' }, h('span', { className: 'wordmark' }, t('app.name')),
    state.health?.demo && h('span', { className: 'pill demo' }, t('demo.label'))),
  h('div', { className: 'header-actions' }, state.info && button(t('common.restore'), actions.confirmRestore, { id: 'restore-header', disabled: state.busy }),
    h('div', { className: 'language', role: 'group', 'aria-label': t('language.label') },
      button(t('language.ms'), () => { setLanguage('ms'); render(); }, { id: 'language-ms', 'aria-pressed': String(getLanguage() === 'ms') }),
      h('span', { 'aria-hidden': 'true' }, t('language.separator')),
      button(t('language.en'), () => { setLanguage('en'); render(); }, { id: 'language-en', 'aria-pressed': String(getLanguage() === 'en') }))));
  const step = flow.indexOf(state.screen);
  const indicator = state.screen !== 'start' && h('nav', { 'aria-label': t('flow.label') },
    h('ol', { className: 'steps' }, flowKeys.map((key, i) => h('li', {
      'aria-current': i === step ? 'step' : null, className: i < step ? 'complete' : '',
    }, t(key)))));
  const error = state.error && h('div', { className: 'error-card stack', role: 'alert' },
    h('p', {}, state.error.key ? t(state.error.key) : errorText(state.error.code)),
    state.error.retry && button(t('common.retry'), state.error.retry, { id: 'error-retry' }));
  const screen = screens[state.screen](state, actions);
  if (changed) screen.classList.add('enter');
  root.replaceChildren(...[indicator, error, screen].filter(Boolean));
  if (state.modal) {
    const dialog = confirmScreen(state, actions);
    root.append(dialog);
    dialog.showModal();
    if (focused && document.getElementById(focused)?.closest('dialog')) document.getElementById(focused).focus();
  } else if (changed) {
    root.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  lastScreen = state.screen;
}

function fail(error, retry) {
  state.error = { code: error.code ?? 'INTERNAL', retry };
  render();
}
function cancelPolling() {
  clearTimeout(pollTimer);
  connectionGeneration++;
}
function devicePath(suffix = '') { return `/devices/${encodeURIComponent(state.serial)}${suffix}`; }

async function loadDevice() {
  const [info, data] = await Promise.all([api(devicePath()), api(devicePath('/packages'))]);
  state.info = info;
  state.packages = data.packages;
  state.selected = new Set(state.packages.filter(entry => entry.risk === 'green' && entry.canDisable && entry.enabled).map(entry => entry.package));
}

async function connectAttempt(generation) {
  try {
    const connection = await api('/devices/connect', state.candidate);
    if (generation !== connectionGeneration) return;
    if (connection.state === 'unauthorized') {
      if (Date.now() >= permissionDeadline) {
        state.connection = 'idle';
        state.error = { key: 'connect.authorizeTimeout', retry: actions.retryConnect };
        render();
        return;
      }
      state.connection = 'unauthorized';
      render();
      pollTimer = setTimeout(() => connectAttempt(generation), Math.min(2000, permissionDeadline - Date.now()));
      return;
    }
    if (connection.state !== 'device') throw { code: connection.state === 'offline' ? 'DEVICE_OFFLINE' : 'DEVICE_UNREACHABLE' };
    state.serial = connection.serial;
    await loadDevice();
    if (generation !== connectionGeneration) return;
    state.connection = 'connected';
    state.screen = 'choose';
    state.error = null;
    render();
  } catch (error) {
    if (generation !== connectionGeneration) return;
    state.connection = 'idle';
    fail(error, actions.retryConnect);
  }
}

function openModal(kind) {
  if (state.busy) return;
  modalOpener = document.activeElement?.id;
  state.modal = kind;
  render();
}

const actions = {
  render,
  go(screen) {
    cancelPolling();
    state.error = null;
    state.screen = screen;
    state.connection = 'idle';
    render();
  },
  async health() {
    state.error = null;
    try { state.health = await api('/health'); render(); }
    catch (error) { fail(error, actions.health); }
  },
  async discover() {
    if (state.connection === 'scanning') return;
    cancelPolling();
    state.error = null;
    state.connection = 'scanning';
    render();
    try {
      state.candidates = (await api('/discover', {})).candidates;
      state.connection = 'idle';
      render();
    } catch (error) { state.connection = 'idle'; fail(error, actions.discover); }
  },
  connect(candidate) {
    cancelPolling();
    state.candidate = candidate;
    state.error = null;
    state.connection = 'connecting';
    permissionDeadline = Date.now() + 120000;
    render();
    connectAttempt(connectionGeneration);
  },
  retryConnect() { if (state.candidate) actions.connect(state.candidate); },
  confirmClean() { if (state.selected.size) openModal('clean'); },
  confirmRestore() { openModal('restore'); },
  closeModal() {
    state.modal = null;
    render();
    document.getElementById(modalOpener)?.focus({ preventScroll: true });
  },
  async startJob(operation) {
    if (state.busy) return;
    state.modal = null;
    state.error = null;
    state.busy = true;
    state.operation = operation;
    state.results = [];
    state.current = null;
    state.total = operation === 'disable' ? state.selected.size : state.packages.filter(entry => entry.installed && !entry.enabled).length;
    state.screen = 'progress';
    render();
    try {
      const data = await api(devicePath(operation === 'restore' ? '/restore' : '/disable'), operation === 'restore' ? { all: true } : { packages: [...state.selected] });
      source?.close();
      source = jobEvents(data.jobId, {
        progress(event) {
          state.total = event.total;
          state.current = event.package;
          state.results.push(event);
          updateProgress(state);
        },
        complete(summary) {
          state.busy = false;
          state.summary = summary;
          state.results = summary.results;
          state.screen = 'done';
          render();
        },
        error(error) { state.busy = false; fail(error, actions.backToList); },
      });
    } catch (error) { state.busy = false; fail(error, actions.backToList); }
  },
  async backToList() {
    if (state.busy) return;
    state.error = null;
    state.busy = true;
    render();
    try { await loadDevice(); state.screen = 'choose'; state.busy = false; render(); }
    catch (error) { state.busy = false; fail(error, actions.backToList); }
  },
  async history() {
    if (state.busy) return;
    state.error = null;
    try { state.historyEntries = (await api(devicePath('/history'))).entries; openModal('history'); }
    catch (error) { fail(error, actions.history); }
  },
};

await initI18n();
render();
await actions.health();
window.addEventListener('pagehide', () => { cancelPolling(); source?.close(); });
