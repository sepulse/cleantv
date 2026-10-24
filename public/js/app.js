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
  modal: null, historyEntries: [], operation: 'disable', results: [], total: 0, processed: 0, current: null, summary: null,
  launcher: null, launcherPackage: '', launcherError: null, storeOpened: false, launcherExpanded: false, recovered: false, manualHomePackage: null, journalWarning: false,
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
let bottomBarObserver;
const recoveries = new Map();

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
    state.error.retry && button(t(state.error.retryLabel ?? 'common.retry'), state.error.retry, { id: 'error-retry' }));
  const screen = screens[state.screen](state, actions);
  if (changed) screen.classList.add('enter');
  root.replaceChildren(...[indicator, error, screen].filter(Boolean));
  bottomBarObserver?.disconnect();
  const bottomBar = document.getElementById('bottom-bar');
  if (bottomBar && typeof ResizeObserver !== 'undefined') {
    bottomBarObserver = new ResizeObserver(() => {
      screen.style.setProperty('--bottom-bar-height', `${bottomBar.getBoundingClientRect().height}px`);
    });
    bottomBarObserver.observe(bottomBar);
  }
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
function selectedLauncher() { return state.launcher?.replacements.find(entry => entry.package === state.launcherPackage); }

function recoverLauncher() {
  const serial = state.serial;
  if (recoveries.has(serial)) return recoveries.get(serial);
  const wasBusy = state.busy;
  state.busy = true;
  const pending = (async () => {
    let jobId;
    for (;;) {
      try { ({ jobId } = await api(devicePath('/launcher/recover'), {})); break; }
      catch (error) {
        if (error.code !== 'DEVICE_BUSY') throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const summary = await new Promise((resolve, reject) => {
      source?.close();
      source = jobEvents(jobId, { progress() {}, complete: resolve, error: reject });
    });
    try { await loadDevice(false); }
    catch { /* Keep the initial snapshot so completed recovery guidance is still shown. */ }
    state.recovered ||= Boolean(summary.recovered);
    state.manualHomePackage = summary.manualHomePackage ?? null;
    state.journalWarning ||= Boolean(summary.journalWarning);
  })().finally(() => {
    recoveries.delete(serial);
    state.busy = wasBusy;
    render();
  });
  recoveries.set(serial, pending);
  render();
  return pending;
}

async function loadDevice(repair = true) {
  const [info, data] = await Promise.all([api(devicePath()), api(devicePath('/packages'))]);
  state.info = info;
  state.recovered = Boolean(info.recovered || data.recovered);
  state.manualHomePackage = info.manualHomePackage ?? data.manualHomePackage ?? null;
  state.journalWarning = Boolean(info.journalWarning || data.journalWarning);
  state.packages = data.packages;
  state.selected = new Set(state.packages.filter(entry => entry.risk === 'green' && entry.canDisable && entry.enabled).map(entry => entry.package));
  await loadLauncher(false);
  if (repair && (info.needsRecovery || data.needsRecovery || state.launcher?.needsRecovery)) await recoverLauncher();
}

async function loadLauncher(repair = true) {
  try {
    state.launcher = await api(devicePath('/launcher') + (state.launcherPackage ? `?package=${encodeURIComponent(state.launcherPackage)}` : '')); state.launcherError = null;
    state.recovered ||= Boolean(state.launcher.recovered);
    state.manualHomePackage ||= state.launcher.manualHomePackage ?? null;
    state.journalWarning ||= Boolean(state.launcher.journalWarning);
    if (repair && state.launcher.needsRecovery) await recoverLauncher();
  }
  catch (error) { state.launcher = null; state.launcherError = error.code ?? 'INTERNAL'; }
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
      if (state.connection !== 'unauthorized') {
        state.connection = 'unauthorized';
        render();
      }
      pollTimer = setTimeout(() => connectAttempt(generation), Math.min(2000, permissionDeadline - Date.now()));
      return;
    }
    if (connection.state !== 'device') throw { code: connection.state === 'offline' ? 'DEVICE_OFFLINE' : 'DEVICE_UNREACHABLE' };
    if (state.serial !== connection.serial) { state.launcherPackage = ''; state.storeOpened = false; }
    state.serial = connection.serial;
    state.connection = 'connecting';
    render();
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
    if (state.busy) return;
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
    if (state.busy || state.connection === 'scanning') return;
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
    if (state.busy || state.connection === 'connecting') return;
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
  selectLauncher(pkg) {
    if (state.busy || (pkg && !state.launcher?.replacements.some(entry => entry.package === pkg))) return;
    state.launcherPackage = pkg;
    state.storeOpened = false;
    render();
  },
  confirmLauncherSwap() { if (selectedLauncher()) openModal('launcherSwap'); },
  confirmLauncherRestore() { openModal('launcherRestore'); },
  async checkLauncher() {
    if (state.busy || (!state.launcherPackage && !state.launcherError)) return;
    state.busy = true;
    render();
    await loadLauncher();
    state.busy = false;
    render();
  },
  async openLauncherStore() {
    if (state.busy || !selectedLauncher()) return;
    state.busy = true;
    state.error = null;
    render();
    try {
      await api(devicePath('/launcher/open-store'), { package: state.launcherPackage });
      state.storeOpened = true;
      state.busy = false;
      render();
    } catch (error) { state.busy = false; fail(error); }
  },
  closeModal() {
    state.modal = null;
    render();
    document.getElementById(modalOpener)?.focus({ preventScroll: true });
  },
  async startJob(operation) {
    if (state.busy || (operation === 'launcherSwap' && !selectedLauncher())) return;
    const previousScreen = state.screen;
    state.modal = null;
    state.error = null;
    state.busy = true;
    render();
    try {
      const path = { disable: '/disable', restore: '/restore', launcherSwap: '/launcher/swap', launcherRestore: '/launcher/restore' }[operation];
      const body = operation === 'disable' ? { packages: [...state.selected] } : operation === 'restore' ? { all: true }
        : operation === 'launcherSwap' ? { package: state.launcherPackage } : {};
      const data = await api(devicePath(path), body);
      state.operation = operation;
      state.results = [];
      state.processed = 0;
      state.current = null;
      state.total = operation === 'disable' ? state.selected.size : operation.startsWith('launcher')
        ? state.launcher?.stock.filter(entry => entry.installed && (operation === 'launcherRestore' || entry.enabled)).length ?? 0
        : state.packages.filter(entry => entry.installed && !entry.enabled).length;
      state.screen = 'progress';
      render();
      source?.close();
      source = jobEvents(data.jobId, {
        progress(event) {
          state.total = event.total;
          state.processed = Math.min(event.done, event.total);
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
        error(error) {
          state.busy = false;
          state.error = { code: error.code, retry: actions.backToList,
            ...(error.code === 'JOB_CONNECTION_LOST' ? { retryLabel: 'progress.checkAgain' } : {}) };
          render();
        },
      });
    } catch (error) { state.busy = false; state.screen = previousScreen; fail(error); }
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

try {
  await initI18n();
  render();
  await actions.health();
} catch {
  root.replaceChildren(h('p', { role: 'alert' }, t('error.I18N_UNAVAILABLE')));
}
window.addEventListener('pagehide', () => { cancelPolling(); source?.close(); bottomBarObserver?.disconnect(); });
