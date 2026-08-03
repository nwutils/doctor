import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveNwjsVersion } from "../../src/nw.js";

const utilsUrl = new URL("../../src/utils.js", import.meta.url);

let caseId = 0;
function importNw() {
  caseId += 1;
  return import(`../../src/nw.js?case=${caseId}`);
}

const manifest = {
  latest: "v0.114.0",
  lts: "v0.14.7",
  stable: "v0.114.0",
  versions: [
    { components: { chromium: "151.0", node: "26.1.0" }, version: "v0.114.0" },
    { components: { chromium: "58.0", node: "5.11.1" }, version: "v0.14.7" },
    { components: { chromium: "150.0", node: "26.1.0" }, version: "v0.113.0" },
  ],
};

describe("resolveNwjsVersion()", () => {
  it("resolves the 'latest' alias", () => {
    assert.equal(resolveNwjsVersion(manifest, "latest").version, "v0.114.0");
  });

  it("resolves the 'stable' alias", () => {
    assert.equal(resolveNwjsVersion(manifest, "stable").version, "v0.114.0");
  });

  it("resolves the 'lts' alias", () => {
    assert.equal(resolveNwjsVersion(manifest, "lts").version, "v0.14.7");
  });

  it("normalizes a literal version without a 'v' prefix", () => {
    assert.equal(resolveNwjsVersion(manifest, "0.113.0").version, "v0.113.0");
  });

  it("accepts a literal version that already has a 'v' prefix", () => {
    assert.equal(resolveNwjsVersion(manifest, "v0.113.0").version, "v0.113.0");
  });

  it("throws with both the requested and resolved version when not found", () => {
    assert.throws(
      () => resolveNwjsVersion(manifest, "0.0.1-missing"),
      /"0\.0\.1-missing".*"v0\.0\.1-missing"/,
    );
  });
});

describe("fetchNwjsManifest()", () => {
  it("delegates to fetchJson with the given manifest URL", async (t) => {
    const fetchJson = t.mock.fn(async () => manifest);
    t.mock.module(utilsUrl, { namedExports: { fetchJson } });

    const { fetchNwjsManifest } = await importNw();
    const result = await fetchNwjsManifest(
      "https://example.test/versions.json",
    );

    assert.deepEqual(result, manifest);
    assert.deepEqual(fetchJson.mock.calls[0].arguments, [
      "https://example.test/versions.json",
    ]);
  });
});

describe("getNodeVersionForNwjs()", () => {
  it("returns the Node.js version bundled with the resolved NW.js version", async (t) => {
    const fetchJson = t.mock.fn(async () => manifest);
    t.mock.module(utilsUrl, { namedExports: { fetchJson } });

    const { getNodeVersionForNwjs } = await importNw();
    const nodeVersion = await getNodeVersionForNwjs(
      "https://example.test/versions.json",
      "0.113.0",
    );

    assert.equal(nodeVersion, "26.1.0");
  });

  it("resolves version aliases through the manifest", async (t) => {
    const fetchJson = t.mock.fn(async () => manifest);
    t.mock.module(utilsUrl, { namedExports: { fetchJson } });

    const { getNodeVersionForNwjs } = await importNw();
    const nodeVersion = await getNodeVersionForNwjs(
      "https://example.test/versions.json",
      "lts",
    );

    assert.equal(nodeVersion, "5.11.1");
  });

  it("rejects when the version is not in the manifest", async (t) => {
    const fetchJson = t.mock.fn(async () => manifest);
    t.mock.module(utilsUrl, { namedExports: { fetchJson } });

    const { getNodeVersionForNwjs } = await importNw();
    await assert.rejects(
      getNodeVersionForNwjs("https://example.test/versions.json", "9.9.9"),
      /was not found in the manifest/,
    );
  });
});
