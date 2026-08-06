import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import util from "./util.js";

/**
 * Check if your environment is set up for NW.js development.
 * @param {object} options - options
 * @param {string} options.manifestUrl - URL of the manifest file to download
 * @param {string} options.cacheDir - Directory to save the downloaded file
 * @param {string} options.version - Version to check (e.g., "lts", "latest", "stable")
 * @param {string} options.srcDir - Directory of the source code
 * @returns {Promise<void>}
 */
async function doctor(options) {
  /* Get the NW.js versions manifest */
  const manifestPath = path.resolve(options.cacheDir, "versions.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  await util.request(options.manifestUrl, manifestPath);

  /* Get required Node.js version */
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    options.version === "latest" ||
    options.version === "stable" ||
    options.version === "lts"
  ) {
    // Remove leading "v" from version string
    options.version = manifest[options.version].slice(1);
  }
  let releaseData = manifest.versions.find(
    /** @param {{ version: string, components: { node: string } }} release */
    (release) => release.version === `v${options.version}`,
  );

  const nodeRequiredVersion = releaseData.components.node;
  console.log(
    "[ INFO ] The required Node.js version is: " + nodeRequiredVersion,
  );

  const nodeCurrentVersion = process.versions["node"];
  if (nodeCurrentVersion !== nodeRequiredVersion) {
    console.log(
      "[ WARN ] Your current Node.js version is: " +
        nodeCurrentVersion +
        ". Native addons may not build properly.",
    );
    console.log(
      "[ INFO ] Install the required Node.js version via a Node verssion manager (e.g., nvm, n, volta) or download it from https://nodejs.org/en/download/releases/.",
    );
  } else {
    console.log("[ INFO ] Your current Node.js version is compatible.");
  }
}

await doctor({
  manifestUrl: "https://nwjs.io/versions.json",
  cacheDir: "cache",
  version: "latest",
  srcDir: ".",
});
