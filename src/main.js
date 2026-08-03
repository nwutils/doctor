import fs from "node:fs";
import path from "node:path";

import { downloadNode, identifyNodeVersionManager } from "./node.js";
import { downloadPackageManager } from "./packageManager.js";
import { getDevEngines, toArray } from "./utils.js";

/**
 * @typedef {object} Options
 * @property {string | "latest" | "stable" | "lts"} version                    Runtime version
 * @property {"normal" | "sdk"}                     flavor                     Build flavor
 * @property {"linux" | "osx" | "win"}              platform                   Target platform
 * @property {"ia32" | "x64" | "arm64"}             arch                       Target architecture
 * @property {"https://dl.nwjs.io"}                 downloadUrl                Download server, accepts http and https
 * @property {"https://nwjs.io/versions.json"}      manifestUrl                Manifest URI, accepts file, http and https
 * @property {string}                               srcDir                     Directory containing the application's package.json
 * @property {string}                               cacheDir                   Cache directory
 * @property {boolean}                              cache                      If false, remove cache and redownload.
 * @property {boolean}                              ffmpeg                     If true, ffmpeg is not downloaded.
 * @property {boolean}                              nativeAddon                If true, download node headers.
 * @property {boolean}                              shaSum                     If true shasum is enabled, otherwise disabled.
 */

/**
 * Handle a devEngines install failure according to its `onFail` policy.
 * @param {"error" | "warn" | "ignore"} onFail
 * @param {unknown}                     cause
 * @returns {void}
 */
function handleFail(onFail, cause) {
  const err = cause instanceof Error ? cause : new Error(String(cause));

  if (onFail === "error") {
    throw err;
  }

  if (onFail !== "ignore") {
    console.warn(`[doctor] ${err.message}`);
  }
}

/**
 * Remove a cached install directory when `cache` is disabled.
 * @param {string}  installDir
 * @param {boolean} cache
 * @returns {Promise<void>}
 */
async function evictStaleCache(installDir, cache) {
  if (cache === false && fs.existsSync(installDir)) {
    await fs.promises.rm(installDir, { force: true, recursive: true });
  }
}

/**
 * Downloads and installs the runtime and package manager declared in the
 * application's `devEngines` field, if no external Node.js version manager
 * is already managing them.
 * @param  {Options} options
 * @returns {Promise<void>}
 */
async function installDevEngines(options) {
  const { cache, cacheDir, srcDir } = options;
  const devEngines = getDevEngines(srcDir);

  for (const runtime of toArray(devEngines.runtime)) {
    const onFail = runtime.onFail ?? "warn";

    try {
      if (runtime.name !== "node") {
        throw new Error(
          `Unsupported devEngines.runtime "${runtime.name}". Only "node" can be installed automatically.`,
        );
      }

      await evictStaleCache(
        path.resolve(cacheDir, "node", `v${runtime.version}`),
        cache,
      );
      await downloadNode(cacheDir, runtime.version);
    } catch (err) {
      handleFail(onFail, err);
    }
  }

  for (const packageManager of toArray(devEngines.packageManager)) {
    const onFail = packageManager.onFail ?? "warn";

    try {
      await evictStaleCache(
        path.resolve(
          cacheDir,
          packageManager.name,
          `v${packageManager.version}`,
        ),
        cache,
      );
      await downloadPackageManager(
        cacheDir,
        packageManager.name,
        packageManager.version,
      );
    } catch (err) {
      handleFail(onFail, err);
    }
  }
}

/**
 * Get NW.js and related binaries for Linux, MacOS and Windows.
 * @async
 * @function
 * @param  {Options}    options  Get mode options
 * @returns {Promise<void>}
 */
async function doctor(options) {
  if (identifyNodeVersionManager() !== "none") {
    return;
  }

  await installDevEngines(options);
}

export default doctor;
