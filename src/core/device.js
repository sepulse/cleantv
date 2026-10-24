/**
 * @param {ReturnType<typeof import('./adb/client.js').createAdbClient>} client
 * @param {string} serial
 * @param {string[]} [installedPackages] Already fetched package list, if available.
 */
export async function getDeviceInfo(client, serial, installedPackages) {
  const props = await client.getprops(serial);
  const packages = installedPackages ?? await client.listPackages(serial);
  const manufacturer = props['ro.product.manufacturer'] ?? '';
  const model = props['ro.product.model'] ?? '';
  const identity = [props['ro.serialno'], props['ro.boot.serialno']]
    .find(value => value?.trim() && !/^(unknown|0123456789abcdef|null|0+)$/i.test(value.trim()))
    ?? `${manufacturer}-${model}-${serial}`;
  return {
    serial,
    deviceId: identity.replace(/[^A-Za-z0-9._-]/g, '_'),
    brand: props['ro.product.brand'] ?? '',
    manufacturer,
    model,
    androidVersion: props['ro.build.version.release'] ?? '',
    sdk: Number(props['ro.build.version.sdk']) || 0,
    isGoogleTv: packages.includes('com.google.android.apps.tv.launcherx'),
    homePackage: await client.resolveHomeActivity(serial),
  };
}
