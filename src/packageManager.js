import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extractTarGz, request } from "./utils.js";

const NPM_REGISTRY_URL = "https://registry.npmjs.org";

export const SUPPORTED_PACKAGE_MANAGERS = ["npm", "yarn", "pnpm"];

/**
 * @param   {string} name devEngines.packageManager name
 * @returns {boolean}
 */
export function isSupportedPackageManager(name) {
  return SUPPORTED_PACKAGE_MANAGERS.includes(name);
}

/**
 * Downloads and installs a package manager into `cacheDir/<name>/v<version>`.
 * Package managers are pure JS npm packages, so the same tarball works on
 * every platform.
 * @param   {string} cacheDir Cache directory
 * @param   {string} name     Package manager name, e.g. "npm", "yarn", "pnpm"
 * @param   {string} version  Package manager version, e.g. "12.0.1"
 * @returns {Promise<string>} Path to the installed package manager directory
 */
export async function downloadPackageManager(cacheDir, name, version) {
  if (!isSupportedPackageManager(name)) {
    throw new Error(
      `Unsupported devEngines.packageManager "${name}". Supported: ${SUPPORTED_PACKAGE_MANAGERS.join(", ")}`,
    );
  }

  const installDir = path.resolve(cacheDir, name, `v${version}`);
  if (fs.existsSync(installDir)) {
    return installDir;
  }

  const url = `${NPM_REGISTRY_URL}/${name}/-/${name}-${version}.tgz`;
  const archivePath = path.resolve(
    os.tmpdir(),
    `doctor-${name}-${version}.tgz`,
  );

  await request(url, archivePath);

  try {
    await extractTarGz(archivePath, installDir, { strip: 1 });
  } finally {
    await fs.promises.rm(archivePath, { force: true });
  }

  return installDir;
}
