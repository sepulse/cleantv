import { CleanTvError, ErrorCode } from './errors.js';

export const DNS_PROVIDERS = Object.freeze([
  // Official Android Private DNS hostname: https://adguard-dns.io/en/public-dns.html
  Object.freeze({ id: 'adguard', name: 'AdGuard DNS', host: 'dns.adguard-dns.com' }),
]);

const hostname = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

/** Only provider IDs reach this entry point; arbitrary hosts are never API input. */
export function privateDnsFor(provider) {
  if (provider === 'off') return { mode: 'off', specifier: null };
  const entry = DNS_PROVIDERS.find(entry => entry.id === provider);
  if (!entry) throw new CleanTvError(ErrorCode.INVALID_INPUT);
  return { mode: 'hostname', specifier: entry.host };
}

/** Baseline restoration alone may delete an originally absent mode. */
export function assertPrivateDns(settings, restoring = false) {
  const { mode, specifier } = settings ?? {};
  if ((!['off', 'opportunistic', 'hostname'].includes(mode) && !(restoring && mode === null))
    || (specifier !== null && (typeof specifier !== 'string' || specifier.trim() !== specifier || !hostname.test(specifier)))) {
    throw new CleanTvError(ErrorCode.INVALID_INPUT);
  }
}
