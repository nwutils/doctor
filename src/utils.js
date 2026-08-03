import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { URL } from "node:url";

import { extract } from "tar";
import { open as openZip } from "yauzl-promise";

/**
 * Download from `url` and save at `filePath`.
 * @param {string} url
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export function request(url, filePath) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);

    /* Handle writeStream errors immediately */
    writeStream.on("error", (err) => {
      cleanup();
      reject(err);
    });

    /* Ctrl+C cleanup */
    const onSigInt = () => {
      writeStream.destroy();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      process.exit();
    };
    process.once("SIGINT", onSigInt);

    const req = client.get(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          "User-Agent": "node:http(s)",
        },
      },
      (res) => {
        /* Redirect handling */
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          cleanup();

          const redirectedUrl = new URL(
            res.headers.location,
            parsedUrl,
          ).toString();
          return resolve(request(redirectedUrl, filePath));
        }

        if (res.statusCode !== 200) {
          cleanup();
          return reject(
            new Error(`Request failed. Status code: ${res.statusCode}`),
          );
        }

        res.pipe(writeStream);

        writeStream.on("finish", () => {
          cleanup();
          resolve();
        });

        res.on("error", (err) => {
          cleanup();
          reject(err);
        });
      },
    );

    req.on("error", (err) => {
      cleanup();
      reject(err);
    });

    function cleanup() {
      process.removeListener("SIGINT", onSigInt);
      req.destroy();
      writeStream.destroy();
    }
  });
}

/**
 * Fetch `url` and parse its response body as JSON.
 * @param {string} url
 * @returns {Promise<unknown>}
 */
export function fetchJson(url) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(
      {
        headers: { "User-Agent": "node:http(s)" },
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectedUrl = new URL(
            res.headers.location,
            parsedUrl,
          ).toString();
          return resolve(fetchJson(redirectedUrl));
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(`Request failed. Status code: ${res.statusCode}`),
          );
        }

        /** @type {Buffer[]} */
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      },
    );

    req.on("error", reject);
  });
}

/**
 * Extract a `.tar.gz` archive into `destDir`.
 * @param {string} archivePath
 * @param {string} destDir
 * @param {{ strip?: number }} [options]
 * @returns {Promise<void>}
 */
export async function extractTarGz(archivePath, destDir, options = {}) {
  await fs.promises.mkdir(destDir, { recursive: true });
  await extract({
    file: archivePath,
    cwd: destDir,
    strip: options.strip ?? 0,
  });
}

/**
 * Extract a `.zip` archive into `destDir`.
 * @param {string} archivePath
 * @param {string} destDir
 * @param {{ strip?: number }} [options]
 * @returns {Promise<void>}
 */
export async function extractZip(archivePath, destDir, options = {}) {
  const strip = options.strip ?? 0;
  const zip = await openZip(archivePath);

  try {
    for await (const entry of zip) {
      const parts = entry.filename.split("/").slice(strip);
      if (parts.length === 0 || parts.every((part) => part === "")) {
        continue;
      }

      const outPath = path.resolve(destDir, ...parts);

      if (entry.filename.endsWith("/")) {
        await fs.promises.mkdir(outPath, { recursive: true });
        continue;
      }

      await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
      const readStream = await entry.openReadStream();
      await pipeline(readStream, fs.createWriteStream(outPath));
    }
  } finally {
    await zip.close();
  }
}

/**
 * @typedef {object} DevEngine
 * @property {string}                     name
 * @property {string}                     version
 * @property {"error" | "warn" | "ignore"} [onFail]
 */

/**
 * @typedef {object} DevEngines
 * @property {DevEngine | DevEngine[]} [runtime]
 * @property {DevEngine | DevEngine[]} [packageManager]
 */

/**
 * Read `devEngines` from a project's `package.json`.
 * @param {string} srcDir Directory containing the project's `package.json`
 * @returns {DevEngines}
 */
export function getDevEngines(srcDir) {
  const packageJsonPath = path.resolve(srcDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  return packageJson.devEngines ?? {};
}

/**
 * Overwrite `devEngines.runtime` in a project's `package.json` with a single
 * runtime entry, leaving every other field (including `devEngines.packageManager`)
 * untouched.
 * @param   {string}    srcDir  Directory containing the project's `package.json`
 * @param   {DevEngine} runtime
 * @returns {void}
 */
export function setDevEnginesRuntime(srcDir, runtime) {
  const packageJsonPath = path.resolve(srcDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  packageJson.devEngines = {
    ...packageJson.devEngines,
    runtime,
  };

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

/**
 * Normalize a `devEngines` field into an array, since each field may be a
 * single object or an array of objects.
 * @template T
 * @param {T | T[] | undefined} field
 * @returns {T[]}
 */
export function toArray(field) {
  if (field === undefined) {
    return [];
  }

  return Array.isArray(field) ? field : [field];
}
