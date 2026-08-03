/**
 * Minimal, dependency-free ZIP writer used only to build fixture archives
 * for `extractZip()` tests. Writes uncompressed ("stored") entries, which is
 * all `yauzl-promise` needs to read back correctly.
 */

/**
 * @param   {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  let crc = ~0;

  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return ~crc >>> 0;
}

/**
 * @typedef {object} ZipEntry
 * @property {string} path                Entry path. Trailing "/" marks a directory.
 * @property {string} [content]            File content, ignored for directories.
 */

/**
 * Build an in-memory ZIP archive from a list of entries.
 * @param   {ZipEntry[]} entries
 * @returns {Buffer}
 */
export function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.path.endsWith("/");
    const data = isDir
      ? Buffer.alloc(0)
      : Buffer.from(entry.content ?? "", "utf8");
    const nameBuf = Buffer.from(entry.path, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(isDir ? 0x10 : 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
