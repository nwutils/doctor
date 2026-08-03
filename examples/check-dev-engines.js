#!/usr/bin/env node

/**
 * Run this to check that `doctor()` reads devEngines from YOUR package.json
 * correctly, and (if it finds anything) watch it download the runtime /
 * package manager into a cache directory.
 *
 * Usage:
 *   node examples/check-dev-engines.js [projectDir] [cacheDir]
 *
 * projectDir defaults to the current working directory.
 * cacheDir   defaults to <projectDir>/.doctor-cache
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

const packageJsonPath = path.join(srcDir, "package.json");
console.log(`Reading devEngines from ${packageJsonPath}`);

if (!fs.existsSync(packageJsonPath)) {
  console.error(`No package.json found in ${srcDir}`);
  process.exit(1);
}

const devEngines = getDevEngines(srcDir);
console.log(JSON.stringify(devEngines, null, 2));

if (!devEngines.runtime && !devEngines.packageManager) {
  console.log(
    "\nNo devEngines.runtime or devEngines.packageManager found. Nothing to install.",
  );
  process.exit(0);
}

console.log(`\nInstalling into ${cacheDir} ...`);
await doctor({ cacheDir, srcDir });

console.log("\nDone. Cache directory contents:");
for (const engine of fs.readdirSync(cacheDir)) {
  const versions = fs.readdirSync(path.join(cacheDir, engine));
  console.log(`  ${engine}: ${versions.join(", ")}`);
}
