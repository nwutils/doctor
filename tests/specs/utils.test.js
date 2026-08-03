import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import * as tar from "tar";

import {
  extractTarGz,
  extractZip,
  getDevEngines,
  request,
  toArray,
} from "../../src/utils.js";
import { createZipBuffer } from "../helpers/zip.js";
import { startServer } from "../helpers/server.js";

describe("toArray()", () => {
  it("returns an empty array for undefined", () => {
    assert.deepEqual(toArray(undefined), []);
  });

  it("wraps a single object in an array", () => {
    const entry = { name: "node", version: "20.0.0" };
    assert.deepEqual(toArray(entry), [entry]);
  });

  it("passes arrays through untouched", () => {
    const entries = [{ name: "npm" }, { name: "yarn" }];
    assert.equal(toArray(entries), entries);
  });
});

describe("getDevEngines()", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-devengines-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it("reads devEngines from package.json", () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, "with-devengines-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        devEngines: {
          packageManager: { name: "npm", version: "10.9.0" },
          runtime: { name: "node", version: "20.11.1" },
        },
        name: "fixture",
      }),
    );

    assert.deepEqual(getDevEngines(dir), {
      packageManager: { name: "npm", version: "10.9.0" },
      runtime: { name: "node", version: "20.11.1" },
    });
  });

  it("returns an empty object when package.json has no devEngines", () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, "no-devengines-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "fixture" }),
    );

    assert.deepEqual(getDevEngines(dir), {});
  });

  it("returns an empty object when package.json does not exist", () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, "missing-"));

    assert.deepEqual(getDevEngines(dir), {});
  });
});

describe("extractTarGz()", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-targz-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it("extracts and strips the top-level directory", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(path.join(srcDir, "pkg-1.0.0", "bin"), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "pkg-1.0.0", "README.md"),
      "hello tar",
    );
    fs.writeFileSync(
      path.join(srcDir, "pkg-1.0.0", "bin", "cli.js"),
      "console.log(1)",
    );

    const archivePath = path.join(tmpDir, "pkg.tar.gz");
    await tar.c(
      { cwd: srcDir, file: archivePath, gzip: true },
      ["pkg-1.0.0"],
    );

    const destDir = path.join(tmpDir, "dest-stripped");
    await extractTarGz(archivePath, destDir, { strip: 1 });

    assert.equal(
      fs.readFileSync(path.join(destDir, "README.md"), "utf8"),
      "hello tar",
    );
    assert.equal(
      fs.readFileSync(path.join(destDir, "bin", "cli.js"), "utf8"),
      "console.log(1)",
    );
    assert.equal(fs.existsSync(path.join(destDir, "pkg-1.0.0")), false);
  });

  it("keeps the top-level directory when strip is omitted", async () => {
    const srcDir = path.join(tmpDir, "src-nostrip");
    fs.mkdirSync(path.join(srcDir, "pkg"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "pkg", "file.txt"), "content");

    const archivePath = path.join(tmpDir, "nostrip.tar.gz");
    await tar.c({ cwd: srcDir, file: archivePath, gzip: true }, ["pkg"]);

    const destDir = path.join(tmpDir, "dest-nostrip");
    await extractTarGz(archivePath, destDir);

    assert.equal(
      fs.readFileSync(path.join(destDir, "pkg", "file.txt"), "utf8"),
      "content",
    );
  });
});

describe("extractZip()", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-zip-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it("extracts nested files and directories, stripping the top level", async () => {
    const archivePath = path.join(tmpDir, "pkg.zip");
    fs.writeFileSync(
      archivePath,
      createZipBuffer([
        { path: "pkg/" },
        { content: "hello zip", path: "pkg/README.md" },
        { path: "pkg/bin/" },
        { content: "console.log(1)", path: "pkg/bin/cli.js" },
      ]),
    );

    const destDir = path.join(tmpDir, "dest-stripped");
    await extractZip(archivePath, destDir, { strip: 1 });

    assert.equal(
      fs.readFileSync(path.join(destDir, "README.md"), "utf8"),
      "hello zip",
    );
    assert.equal(
      fs.readFileSync(path.join(destDir, "bin", "cli.js"), "utf8"),
      "console.log(1)",
    );
    assert.equal(fs.existsSync(path.join(destDir, "pkg")), false);
  });

  it("keeps the top-level directory when strip is omitted", async () => {
    const archivePath = path.join(tmpDir, "nostrip.zip");
    fs.writeFileSync(
      archivePath,
      createZipBuffer([{ content: "content", path: "pkg/file.txt" }]),
    );

    const destDir = path.join(tmpDir, "dest-nostrip");
    await extractZip(archivePath, destDir);

    assert.equal(
      fs.readFileSync(path.join(destDir, "pkg", "file.txt"), "utf8"),
      "content",
    );
  });
});

describe("request()", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-request-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it("downloads a 200 response to disk", async () => {
    const server = await startServer((req, res) => {
      res.writeHead(200);
      res.end("downloaded content");
    });

    try {
      const dest = path.join(tmpDir, "download.txt");
      await request(server.url, dest);
      assert.equal(fs.readFileSync(dest, "utf8"), "downloaded content");
    } finally {
      await server.close();
    }
  });

  it("follows redirects", async () => {
    const server = await startServer((req, res) => {
      if (req.url === "/first") {
        res.writeHead(302, { Location: "/second" });
        res.end();
        return;
      }

      res.writeHead(200);
      res.end("redirected content");
    });

    try {
      const dest = path.join(tmpDir, "redirected.txt");
      await request(`${server.url}/first`, dest);
      assert.equal(fs.readFileSync(dest, "utf8"), "redirected content");
    } finally {
      await server.close();
    }
  });

  it("rejects on a non-200 status code", async () => {
    const server = await startServer((req, res) => {
      res.writeHead(404);
      res.end("not found");
    });

    try {
      const dest = path.join(tmpDir, "missing.txt");
      await assert.rejects(request(server.url, dest), /Status code: 404/);
    } finally {
      await server.close();
    }
  });
});
