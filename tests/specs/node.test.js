import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const utilsUrl = new URL("../../src/utils.js", import.meta.url);
const childProcessUrl = new URL("node:child_process", import.meta.url);

let caseId = 0;
/** Import node.js fresh, so each test can register its own module mocks. */
function importNode() {
  caseId += 1;
  return import(`../../src/node.js?case=${caseId}`);
}

/**
 * @param {import("node:test").TestContext} t
 * @param {(overrides: object) => void} setDescriptor
 * @param {string} value
 */
function withProcessProperty(t, prop, value) {
  const original = Object.getOwnPropertyDescriptor(process, prop);
  Object.defineProperty(process, prop, { configurable: true, value });
  t.after(() => {
    Object.defineProperty(process, prop, original);
  });
}

describe("identifyNodeVersionManager()", () => {
  it("currently always reports 'none'", async () => {
    const { identifyNodeVersionManager } = await importNode();
    assert.equal(identifyNodeVersionManager(), "none");
  });
});

describe("node()", () => {
  it("returns the trimmed version reported by the cached binary", async (t) => {
    const execFileSync = t.mock.fn(() => "v20.11.1\n");
    t.mock.module(childProcessUrl, {
      namedExports: { execFileSync },
    });
    withProcessProperty(t, "platform", "linux");

    const { node } = await importNode();
    const result = node("/cache", "20.11.1");

    assert.equal(result, "v20.11.1");
    assert.equal(execFileSync.mock.callCount(), 1);
    const [binPath, args] = execFileSync.mock.calls[0].arguments;
    assert.equal(
      binPath,
      path.resolve("/cache", "node", "v20.11.1", "bin", "node"),
    );
    assert.deepEqual(args, ["--version"]);
  });

  it("resolves node.exe directly under the version directory on win32", async (t) => {
    const execFileSync = t.mock.fn(() => "v20.11.1\n");
    t.mock.module(childProcessUrl, {
      namedExports: { execFileSync },
    });
    withProcessProperty(t, "platform", "win32");

    const { node } = await importNode();
    node("C:\\cache", "20.11.1");

    const [binPath] = execFileSync.mock.calls[0].arguments;
    assert.equal(
      binPath,
      path.resolve("C:\\cache", "node", "v20.11.1", "node.exe"),
    );
  });
});

describe("downloadNode()", () => {
  it("skips the download when the version is already cached", async (t) => {
    const request = t.mock.fn(async () => {});
    const extractTarGz = t.mock.fn(async () => {});
    const extractZip = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz, extractZip, request },
    });

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.mkdirSync(path.join(cacheDir, "node", "v20.11.1"), {
      recursive: true,
    });

    const { downloadNode } = await importNode();
    const installDir = await downloadNode(cacheDir, "20.11.1");

    assert.equal(installDir, path.join(cacheDir, "node", "v20.11.1"));
    assert.equal(request.mock.callCount(), 0);
    assert.equal(extractTarGz.mock.callCount(), 0);
    assert.equal(extractZip.mock.callCount(), 0);
  });

  it("downloads a .tar.gz and extracts it with extractTarGz on linux/darwin", async (t) => {
    const request = t.mock.fn(async () => {});
    const extractTarGz = t.mock.fn(async () => {});
    const extractZip = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz, extractZip, request },
    });
    withProcessProperty(t, "platform", "linux");
    withProcessProperty(t, "arch", "x64");

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadNode } = await importNode();
    const installDir = await downloadNode(cacheDir, "20.11.1");

    assert.equal(installDir, path.join(cacheDir, "node", "v20.11.1"));
    assert.equal(request.mock.callCount(), 1);
    const [url] = request.mock.calls[0].arguments;
    assert.equal(
      url,
      "https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-x64.tar.gz",
    );
    assert.equal(extractTarGz.mock.callCount(), 1);
    assert.equal(extractZip.mock.callCount(), 0);
    const [, extractDest, extractOptions] = extractTarGz.mock.calls[0].arguments;
    assert.equal(extractDest, installDir);
    assert.deepEqual(extractOptions, { strip: 1 });
  });

  it("downloads a .zip and extracts it with extractZip on win32", async (t) => {
    const request = t.mock.fn(async () => {});
    const extractTarGz = t.mock.fn(async () => {});
    const extractZip = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: { extractTarGz, extractZip, request },
    });
    withProcessProperty(t, "platform", "win32");
    withProcessProperty(t, "arch", "arm64");

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadNode } = await importNode();
    await downloadNode(cacheDir, "20.11.1");

    const [url] = request.mock.calls[0].arguments;
    assert.equal(
      url,
      "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-arm64.zip",
    );
    assert.equal(extractZip.mock.callCount(), 1);
    assert.equal(extractTarGz.mock.callCount(), 0);
  });

  it("maps ia32 to the x86 Node.js dist naming", async (t) => {
    const request = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: {
        extractTarGz: t.mock.fn(async () => {}),
        extractZip: t.mock.fn(async () => {}),
        request,
      },
    });
    withProcessProperty(t, "platform", "win32");
    withProcessProperty(t, "arch", "ia32");

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadNode } = await importNode();
    await downloadNode(cacheDir, "20.11.1");

    const [url] = request.mock.calls[0].arguments;
    assert.match(url, /node-v20\.11\.1-win-x86\.zip$/);
  });

  it("rejects for an unsupported platform without calling request", async (t) => {
    const request = t.mock.fn(async () => {});
    t.mock.module(utilsUrl, {
      namedExports: {
        extractTarGz: t.mock.fn(async () => {}),
        extractZip: t.mock.fn(async () => {}),
        request,
      },
    });
    withProcessProperty(t, "platform", "sunos");

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadNode } = await importNode();
    await assert.rejects(
      downloadNode(cacheDir, "20.11.1"),
      /Unsupported platform/,
    );
    assert.equal(request.mock.callCount(), 0);
  });

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
      namedExports: {
        extractTarGz,
        extractZip: t.mock.fn(async () => {}),
        request,
      },
    });
    withProcessProperty(t, "platform", "linux");
    withProcessProperty(t, "arch", "x64");

    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-node-"));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));

    const { downloadNode } = await importNode();
    await assert.rejects(downloadNode(cacheDir, "20.11.1"), /bad archive/);

    assert.equal(fs.existsSync(archivePaths[0]), false);
  });
});
