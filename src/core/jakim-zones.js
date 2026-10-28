import { readFileSync } from 'node:fs';
import { CleanTvError, ErrorCode } from './errors.js';

/** JAKIM e-Solat zones copied from the official site (see jakim-zones.json): [{ state, zones: [{ code, area }] }]. */
export const JAKIM_STATES = Object.freeze(JSON.parse(readFileSync(new URL('./jakim-zones.json', import.meta.url), 'utf8')).states);
const codes = new Set(JAKIM_STATES.flatMap(entry => entry.zones.map(zone => zone.code)));

/** @param {unknown} zone */
export const isValidZone = zone => typeof zone === 'string' && codes.has(zone);

/** Only a listed zone code ever reaches the TV. @param {unknown} zone */
export function assertZone(zone) {
  if (!isValidZone(zone)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
}
