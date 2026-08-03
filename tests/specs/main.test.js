import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const nodeModuleUrl = new URL("../../src/node.js", import.meta.url);
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

function mockEngines(t, { identifyNodeVersionManager, downloadNode, downloadPackageManager }) {
  t.mock.module(nodeModuleUrl, {
    namedExports: {
      downloadNode: downloadNode ?? t.mock.fn(async () => {}),
      identifyNodeVersionManager:
        identifyNodeVersionManager ?? t.mock.fn(() => "none"),
    },
  });
  t.mock.module(packageManagerModuleUrl, {
    namedExports: {
      downloadPackageManager: downloadPackageManager ?? t.mock.fn(async () => {}),
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
    const downloadPackageManager = t.mock.fn(async (cacheDir, name, version) => {
      calls.push(`${name}@${version}`);
    });
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
    assert.match(warn.mock.calls[0].arguments[0], /Unsupported devEngines\.runtime "deno"/);
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
});
