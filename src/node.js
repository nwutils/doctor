import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { extractTarGz, extractZip, request } from "./utils.js";

const NODE_DIST_URL = "https://nodejs.org/dist";

/** @type {Partial<Record<NodeJS.Platform, string>>} */
const NODE_PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
  win32: "win",
};

/** @type {Partial<Record<NodeJS.Architecture, string>>} */
const NODE_ARCH_MAP = {
  arm64: "arm64",
  ia32: "x86",
  x64: "x64",
};

/**
 * Resolves the binary path for a cached Node.js install.
 * @param   {string} cacheDir Cache directory
 * @param   {string} version  Node.js version, e.g. "20.11.0"
 * @returns {string}
 */
function resolveNodeBinPath(cacheDir, version) {
  const installDir = path.resolve(cacheDir, "node", `v${version}`);

  return process.platform === "win32"
    ? path.resolve(installDir, "node.exe")
    : path.resolve(installDir, "bin", "node");
}

/**
 * Resolves the cached Node.js binary and returns its version.
 *
 * @param   {string} cacheDir Cache directory
 * @param   {string} version  Node.js version, e.g. "20.11.0"
 * @returns {string | undefined}
 */
export function node(cacheDir, version) {
  if (identifyNodeVersionManager() === "none") {
    const nodeDir = resolveNodeBinPath(cacheDir, version);

    return execFileSync(nodeDir, ["--version"], { encoding: "utf8" }).trim();
  }
}

/**
 * Downloads and installs Node.js into `cacheDir/node/v<version>`.
 * @param   {string} cacheDir Cache directory
 * @param   {string} version  Node.js version, e.g. "20.11.0"
 * @returns {Promise<string>} Path to the installed Node.js directory
 */
export async function downloadNode(cacheDir, version) {
  const installDir = path.resolve(cacheDir, "node", `v${version}`);
  if (fs.existsSync(installDir)) {
    return installDir;
  }

  const platform = NODE_PLATFORM_MAP[process.platform];
  if (platform === undefined) {
    throw new Error(
      `Unsupported platform for Node.js download: ${process.platform}`,
    );
  }

  const arch = NODE_ARCH_MAP[process.arch] ?? process.arch;
  const isWindows = platform === "win";
  const fileName = `node-v${version}-${platform}-${arch}.${isWindows ? "zip" : "tar.gz"}`;
  const url = `${NODE_DIST_URL}/v${version}/${fileName}`;
  const archivePath = path.resolve(os.tmpdir(), `doctor-${fileName}`);

  await request(url, archivePath);

  try {
    if (isWindows) {
      await extractZip(archivePath, installDir, { strip: 1 });
    } else {
      await extractTarGz(archivePath, installDir, { strip: 1 });
    }
  } finally {
    await fs.promises.rm(archivePath, { force: true });
  }

  return installDir;
}

/**
 * Identifies the Node.js version manager in use.
 *
 * @returns {"none"}
 */
export function identifyNodeVersionManager() {
  return "none";
}
