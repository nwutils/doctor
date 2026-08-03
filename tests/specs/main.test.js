import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { getDevEngines } from "../../src/utils.js";

const nodeModuleUrl = new URL("../../src/node.js", import.meta.url);
const nwModuleUrl = new URL("../../src/nw.js", import.meta.url);
const packageManagerModuleUrl = new URL(
  "../../src/packageManager.js",
  import.meta.url,
);

let caseId = 0;
function importDoctor() {
  caseId += 1;
  return import(`../../src/main.js?case=${caseId}`);
}

/**
 * Create a temp project directory with the given devEngines field written
 * into its package.json, plus an empty cache dir alongside it.
 * @param   {import("node:test").TestContext} t
 * @param   {object}                          devEngines
 * @returns {{ srcDir: string, cacheDir: string }}
 */
function makeFixture(t, devEngines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-main-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  const srcDir = path.join(root, "project");
  const cacheDir = path.join(root, "cache");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "package.json"),
    JSON.stringify({ devEngines, name: "fixture" }),
  );

  return { cacheDir, srcDir };
}

function mockEngines(
  t,
  {
    identifyNodeVersionManager,
    downloadNode,
    linkNodeBin,
    downloadPackageManager,
    getNodeVersionForNwjs,
  },
) {
  t.mock.module(nodeModuleUrl, {
    namedExports: {
      downloadNode: downloadNode ?? t.mock.fn(async () => {}),
      identifyNodeVersionManager:
        identifyNodeVersionManager ?? t.mock.fn(() => "none"),
      linkNodeBin: linkNodeBin ?? t.mock.fn(() => {}),
    },
  });
  t.mock.module(packageManagerModuleUrl, {
    namedExports: {
      downloadPackageManager:
        downloadPackageManager ?? t.mock.fn(async () => {}),
    },
  });
  t.mock.module(nwModuleUrl, {
    namedExports: {
      getNodeVersionForNwjs:
        getNodeVersionForNwjs ?? t.mock.fn(async () => "0.0.0"),
    },
  });
}

describe("doctor()", () => {
  it("does nothing when an external Node.js version manager is detected", async (t) => {
    const downloadNode = t.mock.fn(async () => {});
    const downloadPackageManager = t.mock.fn(async () => {});
    mockEngines(t, {
      downloadNode,
      downloadPackageManager,
      identifyNodeVersionManager: t.mock.fn(() => "nvm"),
    });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(downloadNode.mock.callCount(), 0);
    assert.equal(downloadPackageManager.mock.callCount(), 0);
  });

  it("does nothing when devEngines is absent", async (t) => {
    const downloadNode = t.mock.fn(async () => {});
    const downloadPackageManager = t.mock.fn(async () => {});
    mockEngines(t, { downloadNode, downloadPackageManager });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(downloadNode.mock.callCount(), 0);
    assert.equal(downloadPackageManager.mock.callCount(), 0);
  });

  it("installs a single runtime entry", async (t) => {
    const downloadNode = t.mock.fn(async () => {});
    mockEngines(t, { downloadNode });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.11.1", onFail: "warn" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(downloadNode.mock.callCount(), 1);
    assert.deepEqual(downloadNode.mock.calls[0].arguments, [
      cacheDir,
      "20.11.1",
    ]);
  });

  it("links the cached binary into node_modules/.bin after a devEngines.runtime install", async (t) => {
    const linkNodeBin = t.mock.fn(() => {});
    mockEngines(t, { linkNodeBin });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.11.1" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.deepEqual(linkNodeBin.mock.calls[0].arguments, [
      srcDir,
      cacheDir,
      "20.11.1",
    ]);
  });

  it("does not link when the devEngines.runtime download fails", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const linkNodeBin = t.mock.fn(() => {});
    const downloadNode = t.mock.fn(async () => {
      throw new Error("network unreachable");
    });
    mockEngines(t, { downloadNode, linkNodeBin });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.11.1" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(linkNodeBin.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 1);
  });

  it("installs every runtime entry in an array, in order", async (t) => {
    const calls = [];
    const downloadNode = t.mock.fn(async (cacheDir, version) => {
      calls.push(version);
    });
    mockEngines(t, { downloadNode });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: [
        { name: "node", version: "18.0.0" },
        { name: "node", version: "20.0.0" },
      ],
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.deepEqual(calls, ["18.0.0", "20.0.0"]);
  });

  it("installs every packageManager entry, single object and array alike", async (t) => {
    const calls = [];
    const downloadPackageManager = t.mock.fn(
      async (cacheDir, name, version) => {
        calls.push(`${name}@${version}`);
      },
    );
    mockEngines(t, { downloadPackageManager });

    const { srcDir, cacheDir } = makeFixture(t, {
      packageManager: [
        { name: "npm", version: "10.9.0" },
        { name: "pnpm", version: "9.0.0" },
      ],
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.deepEqual(calls, ["npm@10.9.0", "pnpm@9.0.0"]);
  });

  it("warns and continues past an unsupported runtime name (default onFail)", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const downloadNode = t.mock.fn(async () => {});
    const downloadPackageManager = t.mock.fn(async () => {});
    mockEngines(t, { downloadNode, downloadPackageManager });

    const { srcDir, cacheDir } = makeFixture(t, {
      packageManager: { name: "npm", version: "10.9.0" },
      runtime: { name: "deno", version: "1.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(downloadNode.mock.callCount(), 0);
    assert.equal(downloadPackageManager.mock.callCount(), 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(
      warn.mock.calls[0].arguments[0],
      /Unsupported devEngines\.runtime "deno"/,
    );
  });

  it("throws and stops on onFail: 'error'", async (t) => {
    const downloadPackageManager = t.mock.fn(async () => {});
    mockEngines(t, { downloadPackageManager });

    const { srcDir, cacheDir } = makeFixture(t, {
      packageManager: { name: "npm", version: "10.9.0" },
      runtime: { name: "deno", onFail: "error", version: "1.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await assert.rejects(
      doctor({ cacheDir, srcDir }),
      /Unsupported devEngines\.runtime "deno"/,
    );

    assert.equal(downloadPackageManager.mock.callCount(), 0);
  });

  it("stays silent on onFail: 'ignore'", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    mockEngines(t, {});

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "deno", onFail: "ignore", version: "1.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(warn.mock.callCount(), 0);
  });

  it("propagates a download failure according to its onFail policy", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const downloadNode = t.mock.fn(async () => {
      throw new Error("network unreachable");
    });
    mockEngines(t, { downloadNode });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /network unreachable/);
  });

  it("evicts a stale cache entry before downloading when cache is false", async (t) => {
    let existedWhenDownloadCalled;
    const downloadNode = t.mock.fn(async (cacheDir, version) => {
      existedWhenDownloadCalled = fs.existsSync(
        path.join(cacheDir, "node", `v${version}`, "marker.txt"),
      );
    });
    mockEngines(t, { downloadNode });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });
    const installDir = path.join(cacheDir, "node", "v20.0.0");
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "marker.txt"), "stale");

    const doctor = (await importDoctor()).default;
    await doctor({ cache: false, cacheDir, srcDir });

    assert.equal(existedWhenDownloadCalled, false);
  });

  it("leaves a cached entry alone when cache is not false", async (t) => {
    let existedWhenDownloadCalled;
    const downloadNode = t.mock.fn(async (cacheDir, version) => {
      existedWhenDownloadCalled = fs.existsSync(
        path.join(cacheDir, "node", `v${version}`, "marker.txt"),
      );
    });
    mockEngines(t, { downloadNode });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });
    const installDir = path.join(cacheDir, "node", "v20.0.0");
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "marker.txt"), "still fresh");

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(existedWhenDownloadCalled, true);
  });

  it("does not resolve an NW.js version when options.version is absent", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    const downloadNode = t.mock.fn(async () => {});
    mockEngines(t, { downloadNode, getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.equal(getNodeVersionForNwjs.mock.callCount(), 0);
    assert.equal(downloadNode.mock.callCount(), 0);
  });

  it("downloads the Node.js version bundled with the requested NW.js version", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    const downloadNode = t.mock.fn(async () => {});
    mockEngines(t, { downloadNode, getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir, version: "0.113.0" });

    assert.deepEqual(getNodeVersionForNwjs.mock.calls[0].arguments, [
      "https://nwjs.io/versions.json",
      "0.113.0",
    ]);
    assert.deepEqual(downloadNode.mock.calls[0].arguments, [
      cacheDir,
      "26.1.0",
    ]);
    assert.deepEqual(getDevEngines(srcDir).runtime, {
      name: "node",
      onFail: "warn",
      version: "26.1.0",
    });
  });

  it("links the cached binary into node_modules/.bin for the NW.js-resolved Node.js version", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    const linkNodeBin = t.mock.fn(() => {});
    mockEngines(t, { getNodeVersionForNwjs, linkNodeBin });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir, version: "0.113.0" });

    assert.deepEqual(linkNodeBin.mock.calls[0].arguments, [
      srcDir,
      cacheDir,
      "26.1.0",
    ]);
  });

  it("overwrites an unrelated existing devEngines.runtime to match the resolved NW.js version", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    mockEngines(t, { getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "deno", version: "1.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir, version: "0.113.0" });

    assert.deepEqual(getDevEngines(srcDir).runtime, {
      name: "node",
      onFail: "warn",
      version: "26.1.0",
    });
  });

  it("preserves an existing runtime's onFail policy when overwriting", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    mockEngines(t, { getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", onFail: "error", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir, version: "0.113.0" });

    assert.deepEqual(getDevEngines(srcDir).runtime, {
      name: "node",
      onFail: "error",
      version: "26.1.0",
    });
  });

  it("does not write devEngines.runtime when options.version is absent", async (t) => {
    mockEngines(t, {});

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir });

    assert.deepEqual(getDevEngines(srcDir).runtime, {
      name: "node",
      version: "20.0.0",
    });
  });

  it("does not write devEngines.runtime when the NW.js version cannot be resolved", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => {
      throw new Error("NW.js version not found");
    });
    mockEngines(t, { getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await assert.rejects(doctor({ cacheDir, srcDir, version: "9.9.9" }));

    assert.deepEqual(getDevEngines(srcDir).runtime, {
      name: "node",
      version: "20.0.0",
    });
  });

  it("uses a custom manifestUrl when provided", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    mockEngines(t, { getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await doctor({
      cacheDir,
      manifestUrl: "https://example.test/versions.json",
      srcDir,
      version: "latest",
    });

    assert.deepEqual(getNodeVersionForNwjs.mock.calls[0].arguments, [
      "https://example.test/versions.json",
      "latest",
    ]);
  });

  it("runs both devEngines installs and the NW.js Node.js download", async (t) => {
    const calls = [];
    const downloadNode = t.mock.fn(async (cacheDir, version) => {
      calls.push(version);
    });
    const getNodeVersionForNwjs = t.mock.fn(async () => "26.1.0");
    mockEngines(t, { downloadNode, getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, {
      runtime: { name: "node", version: "20.0.0" },
    });

    const doctor = (await importDoctor()).default;
    await doctor({ cacheDir, srcDir, version: "0.113.0" });

    assert.deepEqual(calls, ["20.0.0", "26.1.0"]);
  });

  it("rejects when the NW.js version cannot be resolved", async (t) => {
    const getNodeVersionForNwjs = t.mock.fn(async () => {
      throw new Error("NW.js version not found");
    });
    mockEngines(t, { getNodeVersionForNwjs });

    const { srcDir, cacheDir } = makeFixture(t, undefined);

    const doctor = (await importDoctor()).default;
    await assert.rejects(
      doctor({ cacheDir, srcDir, version: "9.9.9" }),
      /NW\.js version not found/,
    );
  });
});
