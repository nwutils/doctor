import fs from "node:fs";
import path from "node:path";

import util from "./util.js";

/**
 * Check if your environment is set up for NW.js development.
 * @param {object} options - options
 * @param {string} options.manifestUrl - URL of the manifest file to download
 * @param {string} options.cacheDir - Directory to save the downloaded file
 * @param {string} options.version - Version to check (e.g., "lts", "latest", "stable")
 * @returns {Promise<void>}
 */
async function doctor(options) {
    /* Get the NW.js versions manifest */
    const manifestPath = path.resolve(options.cacheDir, "versions.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    await util.request(options.manifestUrl, manifestPath);

    /* Get required Node.js version */
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (options.version === "latest" || options.version === "stable" || options.version === "lts") {
        // Remove leading "v" from version string
        options.version = manifest[options.version].slice(1);
    }
    let releaseData = manifest.versions.find(
        (release) => release.version === `v${options.version}`,
    );

    const nodeRequiredVersion = releaseData.components.node;
}

await doctor({
    manifestUrl: "https://nwjs.io/versions.json",
    cacheDir: "cache",
    version: "latest",
});
