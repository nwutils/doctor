#!/usr/bin/env node

/**
 * Run this to check that `doctor()` reads devEngines from YOUR package.json
 * correctly, and (if it finds anything) watch it download the runtime /
 * package manager into a cache directory. Optionally also resolves the
 * Node.js version bundled with a given NW.js version (via
 * nwjs.io/versions.json), downloads it, links it into node_modules/.bin,
 * and writes it back into devEngines.runtime.
 *
 * Usage:
 *   node examples/check-dev-engines.js [projectDir] [cacheDir] [nwjsVersion]
 *
 * projectDir  defaults to the current working directory.
 * cacheDir    defaults to <projectDir>/.doctor-cache
 * nwjsVersion optional, e.g. "0.113.0", "latest", "stable", "lts".
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import doctor from "../src/main.js";
import { getDevEngines } from "../src/utils.js";

const srcDir = path.resolve(process.argv[2] ?? process.cwd());
const cacheDir = path.resolve(
  process.argv[3] ?? path.join(srcDir, ".doctor-cache"),
);
const version = process.argv[4];

const packageJsonPath = path.join(srcDir, "package.json");
console.log(`Reading devEngines from ${packageJsonPath}`);

if (!fs.existsSync(packageJsonPath)) {
  console.error(`No package.json found in ${srcDir}`);
  process.exit(1);
}

const devEngines = getDevEngines(srcDir);
console.log(JSON.stringify(devEngines, null, 2));

if (
  !devEngines.runtime &&
  !devEngines.packageManager &&
  version === undefined
) {
  console.log(
    "\nNo devEngines.runtime or devEngines.packageManager found, and no NW.js version given. Nothing to install.",
  );
  process.exit(0);
}

if (version !== undefined) {
  console.log(`\nResolving the Node.js version for NW.js ${version} ...`);
}
console.log(`Installing into ${cacheDir} ...`);
await doctor({ cacheDir, srcDir, version });

console.log("\nDone. Cache directory contents:");
for (const engine of fs.readdirSync(cacheDir)) {
  const versions = fs.readdirSync(path.join(cacheDir, engine));
  console.log(`  ${engine}: ${versions.join(", ")}`);
}
