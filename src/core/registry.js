import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidPackageName, NEVER_TOUCH } from './safety.js';
import { CleanTvError, ErrorCode } from './errors.js';

/** @typedef {{ en: string, ms: string }} Text */
/** @typedef {{ package: string, risk: 'green' | 'yellow' | 'red', category: string, label: Text, description: Text, effect: Text, sources: string[], verified: boolean }} Entry */
/** @typedef {{ id: string, match: { any?: boolean, brand?: string[], manufacturer?: string[], feature?: string }, packages: Entry[] }} Preset */
const risks = { green: 0, yellow: 1, red: 2 };
const categories = ['ads', 'telemetry', 'bloat', 'store', 'launcher', 'assistant', 'system'];

/** @param {unknown} obj @returns {{ ok: boolean, errors: string[] }} */
export function validatePreset(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Expected a preset object'] };
  if (typeof obj.id !== 'string' || !obj.id.trim()) errors.push('Missing id');
  const match = obj.match;
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    errors.push('Missing match object');
  } else {
    if (match.any !== true && !match.brand && !match.manufacturer && !match.feature) errors.push('Empty match');
    if (match.any !== undefined && match.any !== true) errors.push('match.any must be true');
    for (const field of ['brand', 'manufacturer']) {
      if (match[field] !== undefined && (!Array.isArray(match[field]) || !match[field].length
        || match[field].some(value => typeof value !== 'string' || !value.trim()))) errors.push(`Invalid match.${field}`);
    }
    if (match.feature !== undefined && match.feature !== 'google-tv') errors.push('Unknown match.feature');
  }
  if (!Array.isArray(obj.packages)) return { ok: false, errors: [...errors, 'Missing packages array'] };
  const seen = new Set();
  for (const [i, entry] of obj.packages.entries()) {
    const prefix = `packages[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`${prefix}: expected object`); continue; }
    if (!isValidPackageName(entry.package)) errors.push(`${prefix}: invalid package`);
    if (seen.has(entry.package)) errors.push(`${prefix}: duplicate package ${entry.package}`);
    seen.add(entry.package);
    if (!Object.hasOwn(risks, entry.risk)) errors.push(`${prefix}: unknown risk`);
    if (!categories.includes(entry.category)) errors.push(`${prefix}: unknown category`);
    if ((NEVER_TOUCH.has(entry.package) || entry.package?.startsWith?.('com.android.providers.')) && entry.risk !== 'red') {
      errors.push(`${prefix}: protected package must be red`);
    }
    for (const field of ['label', 'description', 'effect']) {
      if (typeof entry[field]?.en !== 'string' || !entry[field].en.trim()) errors.push(`${prefix}: missing ${field}.en text`);
      if (typeof entry[field]?.ms !== 'string') errors.push(`${prefix}: missing ${field}.ms string`);
    }
    if (typeof entry.verified !== 'boolean') errors.push(`${prefix}: verified must be boolean`);
    if (!Array.isArray(entry.sources) || !entry.sources.length || entry.sources.some(source => {
      try { return !['https:', 'http:'].includes(new URL(source).protocol); } catch { return true; }
    })) errors.push(`${prefix}: sources must contain HTTP(S) URLs`);
  }
  return { ok: errors.length === 0, errors };
}

/** @param {string} dir @returns {Promise<Preset[]>} */
export async function loadPresets(dir) {
  const presets = [];
  for (const name of (await readdir(dir)).filter(name => name.endsWith('.json')).sort()) {
    try {
      const preset = JSON.parse(await readFile(join(dir, name), 'utf8'));
      const { ok, errors } = validatePreset(preset);
      if (!ok) throw new Error(errors.join('; '));
      presets.push(preset);
    } catch (error) {
      throw new CleanTvError(ErrorCode.INVALID_INPUT, `${name}: ${error.message}`);
    }
  }
  return presets;
}

/** @param {Preset[]} presets @param {{ brand: string, manufacturer: string, isGoogleTv: boolean }} deviceInfo @returns {Preset[]} */
export function matchPresets(presets, deviceInfo) {
  return presets.filter(({ match }) => match.any === true || (
    (!match.brand || match.brand.some(value => value.toLowerCase() === deviceInfo.brand.toLowerCase()))
    && (!match.manufacturer || match.manufacturer.some(value => value.toLowerCase() === deviceInfo.manufacturer.toLowerCase()))
    && (!match.feature || (match.feature === 'google-tv' && deviceInfo.isGoogleTv))
  ));
}

/** @param {Preset[]} matched @returns {Map<string, Entry>} */
export function buildEntryIndex(matched) {
  const index = new Map();
  for (const { packages } of matched) {
    for (const entry of packages) {
      if (!index.has(entry.package) || risks[entry.risk] > risks[index.get(entry.package).risk]) index.set(entry.package, entry);
    }
  }
  return index;
}
