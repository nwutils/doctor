import { fetchJson } from "./utils.js";

/**
 * @typedef {object} NwjsVersionEntry
 * @property {string}                            version
 * @property {string}                            date
 * @property {string[]}                          files
 * @property {string[]}                          flavors
 * @property {{ node: string, chromium: string }} components
 */

/**
 * @typedef {object} NwjsManifest
 * @property {string}              latest
 * @property {string}              stable
 * @property {string}              lts
 * @property {NwjsVersionEntry[]}  versions
 */

/**
 * Fetch and parse the NW.js versions manifest.
 * @param   {string} manifestUrl
 * @returns {Promise<NwjsManifest>}
 */
export function fetchNwjsManifest(manifestUrl) {
  return /** @type {Promise<NwjsManifest>} */ (fetchJson(manifestUrl));
}

/**
 * Resolve a requested NW.js `version` (a literal version, with or without
 * the "v" prefix, or one of "latest" | "stable" | "lts") against a fetched
 * manifest, returning its version entry.
 * @param   {NwjsManifest} manifest
 * @param   {string}       version
 * @returns {NwjsVersionEntry}
 */
export function resolveNwjsVersion(manifest, version) {
  const resolved =
    version === "latest" || version === "stable" || version === "lts"
      ? manifest[version]
      : version;
  const normalized = resolved.startsWith("v") ? resolved : `v${resolved}`;

  const entry = manifest.versions.find((v) => v.version === normalized);
  if (entry === undefined) {
    throw new Error(
      `NW.js version "${version}" (resolved to "${normalized}") was not found in the manifest.`,
    );
  }

  return entry;
}

/**
 * Get the Node.js version bundled with a given NW.js version.
 * @param   {string} manifestUrl
 * @param   {string} version
 * @returns {Promise<string>}
 */
export async function getNodeVersionForNwjs(manifestUrl, version) {
  const manifest = await fetchNwjsManifest(manifestUrl);
  const entry = resolveNwjsVersion(manifest, version);

  return entry.components.node;
}
