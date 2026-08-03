import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  isSupportedPackageManager,
  SUPPORTED_PACKAGE_MANAGERS,
} from "../../src/packageManager.js";

const utilsUrl = new URL("../../src/utils.js", import.meta.url);

let caseId = 0;
function importPackageManager() {
  caseId += 1;
  return import(`../../src/packageManager.js?case=${caseId}`);
}

describe("isSupportedPackageManager()", () => {
  it("accepts npm, yarn and pnpm", () => {
    for (const name of ["npm", "yarn", "pnpm"]) {
      assert.equal(isSupportedPackageManager(name), true);
    }
  });

  it("rejects anything else", () => {
    for (const name of ["bun", "deno", ""]) {
      assert.equal(isSupportedPackageManager(name), false);
    }
  });
});

describe("downloadPackageManager()", () => {
  it("rejects unsupported package managers without downloading", async (t) => {
    const request = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz: t.mock.fn(async () => {}), request },
    });

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-pm-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadPackageManager } = await importPackageManager();
    await assert.rejects(
      downloadPackageManager(cacheDir, "bun", "1.0.0"),
      /Unsupported devEngines.packageManager "bun"/,
    );
    assert.equal(request.mock.callCount(), 0);
  });

  it("skips the download when the version is already cached", async (t) => {
    const request = t.mock.fn(async () => {});
    const extractTarGz = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz, request },
    });

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-pm-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.mkdirSync(path.join(cacheDir, "npm", "v10.9.0"), { recursive: true });

    const { downloadPackageManager } = await importPackageManager();
    const installDir = await downloadPackageManager(
      cacheDir,
      "npm",
      "10.9.0",
    );

    assert.equal(installDir, path.join(cacheDir, "npm", "v10.9.0"));
    assert.equal(request.mock.callCount(), 0);
    assert.equal(extractTarGz.mock.callCount(), 0);
  });

  for (const name of SUPPORTED_PACKAGE_MANAGERS) {
    it(`downloads ${name} from the npm registry and extracts it stripped`, async (t) => {
      const request = t.mock.fn(async () => {});
      const extractTarGz = t.mock.fn(async () => {});
      t.mock.module(utilsUrl, {
        namedExports: { extractTarGz, request },
      });

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-pm-"));
      t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

      const { downloadPackageManager } = await importPackageManager();
      const installDir = await downloadPackageManager(
        cacheDir,
        name,
        "1.2.3",
      );

      assert.equal(installDir, path.join(cacheDir, name, "v1.2.3"));
      assert.equal(request.mock.callCount(), 1);
      const [url] = request.mock.calls[0].arguments;
      assert.equal(
        url,
        `https://registry.npmjs.org/${name}/-/${name}-1.2.3.tgz`,
      );
      assert.equal(extractTarGz.mock.callCount(), 1);
      const [, extractDest, extractOptions] = extractTarGz.mock.calls[0].arguments;
      assert.equal(extractDest, installDir);
      assert.deepEqual(extractOptions, { strip: 1 });
    });
  }

  it("removes the downloaded archive even if extraction fails", async (t) => {
    const archivePaths = [];
    const request = t.mock.fn(async (url, archivePath) => {
      archivePaths.push(archivePath);
      fs.writeFileSync(archivePath, "fake archive");
    });
    const extractTarGz = t.mock.fn(async () => {
      throw new Error("bad archive");
    });
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz, request },
    });

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-pm-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadPackageManager } = await importPackageManager();
    await assert.rejects(
      downloadPackageManager(cacheDir, "npm", "10.9.0"),
      /bad archive/,
    );

    assert.equal(fs.existsSync(archivePaths[0]), false);
  });
});
