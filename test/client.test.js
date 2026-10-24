import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdbClient, parseFocusedPackage } from '../src/core/adb/client.js';
import { CleanTvError } from '../src/core/errors.js';
import { fakeRunner } from './helpers/fake-runner.js';

const serial = '192.168.1.20:5555';
const pkg = 'com.example.app';
const prefix = `-s ${serial} shell`;

test('client exposes only the named methods', () => {
  assert.deepEqual(Object.keys(createAdbClient(fakeRunner({}))).sort(), [
    'connect', 'disconnect', 'devices', 'getprops', 'listPackages', 'disableUser', 'enableUser', 'resolveHomeActivity', 'openPlayStore', 'listHomeCandidates',
    'listHomeCandidateComponents', 'resolveHomeComponent', 'setHomeActivity', 'pressHome', 'focusedPackage',
  ].sort());
});

test('devices parser handles CRLF, model, unauthorized, offline and daemon noise', async () => {
  const run = fakeRunner({ 'devices -l': { stdout: `* daemon started successfully *\r\nList of devices attached\r\n${serial}\tdevice product:tv model:Living_Room device:x transport_id:1\r\n10.0.0.2:5555 unauthorized\r\n10.0.0.3:5555 offline\r\nusb-serial device model:USB\r\n\r\n` } });
  assert.deepEqual(await createAdbClient(run).devices(), [
    { serial, state: 'device', model: 'Living_Room' },
    { serial: '10.0.0.2:5555', state: 'unauthorized' },
    { serial: '10.0.0.3:5555', state: 'offline' },
  ]);
});

test('connect reads actual devices state even after connected message', async () => {
  for (const state of ['device', 'unauthorized', 'offline']) {
    const run = fakeRunner({ [`connect ${serial}`]: { stdout: `connected to ${serial}` },
      'devices -l': { stdout: `List of devices attached\r\n${serial}\t${state}\r\n` } });
    assert.deepEqual(await createAdbClient(run).connect('192.168.1.20'), { serial, state });
    assert.deepEqual(run.calls, [['connect', serial], ['devices', '-l']]);
  }
});

test('connect reports failed, cannot connect, nonzero and timeout as unreachable', async () => {
  for (const response of [{ stdout: 'failed to connect' }, { stderr: 'cannot connect to host' }, { code: 1 }, new CleanTvError('TIMEOUT')]) {
    const run = fakeRunner({ [`connect ${serial}`]: response });
    assert.deepEqual(await createAdbClient(run).connect('192.168.1.20'), { serial, state: 'unreachable' });
    assert.equal(run.calls.length, 1);
  }
  const run = fakeRunner({ [`connect ${serial}`]: { stdout: 'connected' }, 'devices -l': { stdout: '' } });
  assert.deepEqual(await createAdbClient(run).connect('192.168.1.20'), { serial, state: 'unreachable' });
});

test('connect supports a custom port and preserves missing-binary errors', async () => {
  const run = fakeRunner({ 'connect 10.1.1.5:1234': {}, 'devices -l': { stdout: '10.1.1.5:1234 device' } });
  assert.deepEqual(await createAdbClient(run).connect('10.1.1.5', 1234), { serial: '10.1.1.5:1234', state: 'device' });
  await assert.rejects(createAdbClient(fakeRunner({ [`connect ${serial}`]: new CleanTvError('ADB_NOT_FOUND') })).connect('192.168.1.20'), { code: 'ADB_NOT_FOUND' });
});

test('disconnect checks command status', async () => {
  const run = fakeRunner({ [`disconnect ${serial}`]: {} });
  await createAdbClient(run).disconnect(serial);
  assert.deepEqual(run.calls, [['disconnect', serial]]);
  await assert.rejects(createAdbClient(fakeRunner({ [`disconnect ${serial}`]: { code: 1, stderr: 'bad' } })).disconnect(serial), { code: 'COMMAND_FAILED' });
});

test('getprop parser handles CRLF, empty and bracketed values', async () => {
  const client = createAdbClient(fakeRunner({ [`${prefix} getprop`]: {
    stdout: '[ro.product.model]: [Room TV]\r\n[empty]: []\r\n[bracket]: [a [b] c]\r\nnoise\r\n',
  } }));
  assert.deepEqual(await client.getprops(serial), { 'ro.product.model': 'Room TV', empty: '', bracket: 'a [b] c' });
});

test('package lists use user 0 and optional disabled flag', async () => {
  const run = fakeRunner({ [`${prefix} pm list packages --user 0`]: { stdout: `package:${pkg}\r\npackage:com.example.other\r\nnoise\r\n` },
    [`${prefix} pm list packages --user 0 -d`]: { stdout: `package:${pkg}\r\n` } });
  const client = createAdbClient(run);
  assert.deepEqual(await client.listPackages(serial), [pkg, 'com.example.other']);
  assert.deepEqual(await client.listPackages(serial, { disabledOnly: true }), [pkg]);
});

test('state changes require the expected marker as well as successful command exit', async () => {
  for (const [method, command, marker] of [['disableUser', 'disable-user', 'disabled-user'], ['enableUser', 'enable', 'enabled']]) {
    const args = `${prefix} pm ${command} --user 0 ${pkg}`;
    for (const [stdout, expected] of [[`Package ${pkg} new state: ${marker}\r\nextra line\r\n`, true], ['Success', false], [`new state: ${marker}-other`, false]]) {
      assert.equal(await createAdbClient(fakeRunner({ [args]: { stdout } }))[method](serial, pkg), expected);
    }
    await assert.rejects(createAdbClient(fakeRunner({ [args]: { stdout: `new state: ${marker}`, code: 1 } }))[method](serial, pkg), { code: 'COMMAND_FAILED' });
  }
});

test('HOME parser chooses the last valid component or returns null', async () => {
  const args = `${prefix} cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME`;
  for (const [stdout, expected] of [['priority=0\r\ncom.old.home/.Main\r\ncom.new.home/com.new.home.Main\r\n', 'com.new.home'], ['No activity found\r\n', null]]) {
    assert.equal(await createAdbClient(fakeRunner({ [args]: { stdout } })).resolveHomeActivity(serial), expected);
  }
});

test('HOME keyevent and focused activity parser use actual activity state', async () => {
  const keyevent = `${prefix} input keyevent KEYCODE_HOME`;
  const dump = `${prefix} dumpsys activity activities`;
  const cases = [
    ['mFocusedApp=ActivityRecord{aa u0 com.spocky.projengmenu/.Main t7}\r\n  ResumedActivity: ActivityRecord{bb u0 com.other.app/.Main t8}', null],
    ['mFocusedApp=null\r\n  ResumedActivity: ActivityRecord{bb u0 com.google.android.tvlauncher/.Main t8}', 'com.google.android.tvlauncher'],
    ['mFocusedApp=null\r\n  mResumedActivity: ActivityRecord{bb u0 com.google.android.tvlauncher/.Main t8}', 'com.google.android.tvlauncher'],
    ['topResumedActivity=ActivityRecord{bb u0 com.google.android.tvlauncher/.Main t8}', 'com.google.android.tvlauncher'],
    ['mFocusedApp=null\r\nResumedActivity: null', null],
    ['mFocusedApp=ActivityRecord{aa u0 com.bad;input/.Main t7}', null],
  ];
  for (const [output, expected] of cases) {
    const run = fakeRunner({ [keyevent]: {}, [dump]: { stdout: output } });
    const client = createAdbClient(run);
    await client.pressHome(serial);
    assert.equal(await client.focusedPackage(serial), expected);
    assert.deepEqual(run.calls, [['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_HOME'],
      ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']]);
    assert.equal(parseFocusedPackage(output), expected);
  }
  await assert.rejects(createAdbClient(fakeRunner({ [keyevent]: { code: 1 } })).pressHome(serial), { code: 'COMMAND_FAILED' });
  await assert.rejects(createAdbClient(fakeRunner({ [dump]: { code: 1 } })).focusedPackage(serial), { code: 'COMMAND_FAILED' });
});

test('focused activity preserves android and rejects conflicting focus and resumed markers', () => {
  const chooser = 'mFocusedApp=ActivityRecord{aa u0 android/com.android.internal.app.ResolverActivity t7}';
  const projectivy = 'ResumedActivity: ActivityRecord{bb u0 com.spocky.projengmenu/.Main t8}';
  assert.equal(parseFocusedPackage(chooser), 'android');
  for (const marker of ['ResumedActivity:', 'mResumedActivity:', 'topResumedActivity=']) {
    const resumed = projectivy.replace('ResumedActivity:', marker);
    assert.equal(parseFocusedPackage(`${chooser}\n${resumed}`), null);
    assert.equal(parseFocusedPackage(`${resumed}\n${chooser}`), null);
  }
  assert.equal(parseFocusedPackage(`${projectivy}\nmFocusedApp=ActivityRecord{aa u0 com.spocky.projengmenu/.Main t7}`), 'com.spocky.projengmenu');
});

test('all argument-taking methods reject unsafe inputs before any runner call', async () => {
  const run = fakeRunner({});
  const client = createAdbClient(run);
  for (const method of ['disconnect', 'getprops', 'listPackages', 'disableUser', 'enableUser', 'resolveHomeActivity', 'openPlayStore', 'listHomeCandidates',
    'listHomeCandidateComponents', 'resolveHomeComponent', 'setHomeActivity', 'pressHome', 'focusedPackage']) {
    await assert.rejects(client[method]('host;id:5555', pkg), { code: 'INVALID_INPUT' });
  }
  for (const method of ['disableUser', 'enableUser', 'openPlayStore']) {
    for (const bad of [undefined, null, 'com.app;id', 'com.app\n', 'com.app && id']) await assert.rejects(client[method](serial, bad), { code: 'INVALID_INPUT' });
  }
  for (const [ip, port] of [['host', 5555], ['1.2.3.4', 0], ['256.2.3.4', 5555]]) await assert.rejects(client.connect(ip, port), { code: 'INVALID_INPUT' });
  assert.deepEqual(run.calls, []);
});

test('store command is limited to Projectivy and detects unresolved intents', async () => {
  const pkg = 'com.spocky.projengmenu';
  const args = `${prefix} am start -a android.intent.action.VIEW -d market://details?id=${pkg}`;
  const run = fakeRunner({ [args]: { stdout: 'Starting: Intent' } });
  await createAdbClient(run).openPlayStore(serial, pkg);
  assert.deepEqual(run.calls[0], ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `market://details?id=${pkg}`]);
  await assert.rejects(createAdbClient(run).openPlayStore(serial, 'com.example.other'), { code: 'INVALID_INPUT' });
  assert.equal(run.calls.length, 1);
  for (const response of [{ stdout: 'Error: Activity not started, unable to resolve Intent' }, { code: 1 }]) {
    await assert.rejects(createAdbClient(fakeRunner({ [args]: response })).openPlayStore(serial, pkg), { code: 'COMMAND_FAILED' });
  }
});

test('HOME candidates parse unique valid components and reject command failures', async () => {
  const args = `${prefix} cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME`;
  const run = fakeRunner({ [args]: { stdout: '2 activities found:\r\ncom.spocky.projengmenu/.Main\r\ncom.spocky.projengmenu/.Other\r\ncom.google.android.tvlauncher/.Main\r\ncom.vendor.factorytest/.Main\r\ncom.example.test.launcher/.Main\r\nbad;input/.Main\r\nnoise\r\n' } });
  assert.deepEqual(await createAdbClient(run).listHomeCandidates(serial), ['com.spocky.projengmenu', 'com.google.android.tvlauncher']);
  assert.deepEqual(await createAdbClient(fakeRunner({ [args]: { stdout: 'No activities found' } })).listHomeCandidates(serial), []);
  await assert.rejects(createAdbClient(fakeRunner({ [args]: { code: 1 } })).listHomeCandidates(serial), { code: 'COMMAND_FAILED' });
});

test('read commands do not parse failed output as real state', async () => {
  await assert.rejects(createAdbClient(fakeRunner({ 'devices -l': { code: 1, stderr: 'error' } })).devices(), { code: 'COMMAND_FAILED' });
  const run = fakeRunner({ known: {} });
  await assert.rejects(run(['unknown']), /Unknown args/);
  assert.deepEqual(run.calls, [['unknown']]);
});

test('HOME components preserve candidate activities and set HOME with strictly validated arguments', async () => {
  const query = `${prefix} cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME`;
  const component = 'com.google.android.tvlauncher/.Main';
  const run = fakeRunner({ [query]: { stdout: `${component}\ncom.good.home/com.good.home.Main$Inner\ncom.bad.home/.Main;id\ncom.bad.home/.Main&&id\ncom.bad.home/.\n` },
    [`${prefix} cmd package set-home-activity ${component}`]: {} });
  const client = createAdbClient(run);
  assert.deepEqual(await client.listHomeCandidateComponents(serial), [component]);
  await client.setHomeActivity(serial, component);
  assert.deepEqual(run.calls.at(-1), ['-s', serial, 'shell', 'cmd', 'package', 'set-home-activity', component]);
  const before = run.calls.length;
  for (const bad of [undefined, null, 'com.good.home', 'com.good.home/', 'com.good.home/.Main;id',
    'com.good.home/.Main\n', 'com.good.home/.Main && id', 'com.good.home/$(id)', 'com.good.home/.Main$Inner', 'com.good.home/.Main/Other', 'android/.Main']) {
    await assert.rejects(client.setHomeActivity(serial, bad), { code: 'INVALID_INPUT' });
  }
  assert.equal(run.calls.length, before);
  for (const response of [{ code: 1 }, { stdout: 'Error: unsupported' }]) {
    await assert.rejects(createAdbClient(fakeRunner({ [`${prefix} cmd package set-home-activity ${component}`]: response }))
      .setHomeActivity(serial, component), { code: 'COMMAND_FAILED' });
  }
});

test('system resolver components remain distinguishable from missing HOME', async () => {
  const args = `${prefix} cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME`;
  const component = 'android/com.android.internal.app.ResolverActivity';
  const client = createAdbClient(fakeRunner({ [args]: { stdout: component } }));
  assert.equal(await client.resolveHomeComponent(serial), component);
  assert.equal(await client.resolveHomeActivity(serial), 'android');
});
