#!/usr/bin/env node
/**
 * Cross-Platform Packaging Script for Career Autofill Extension
 * Runs identically on Windows (PowerShell, CMD), macOS, and Linux.
 * Zero external npm dependencies (uses Node.js built-ins: fs, path, crypto, zlib).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// Precomputed CRC32 Table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Pure Node.js ZIP archive generator (Zero Dependencies)
 */
function createZipArchive(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = zlib.deflateRawSync(content);
    const crc = crc32(content);

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6);  // flags
    localHeader.writeUInt16LE(8, 8);  // compression method (deflate)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localHeaders.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + name length)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);  // flags
    centralHeader.writeUInt16LE(8, 10); // compression method (deflate)
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralHeaders.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

// Helper to recursively collect files
function collectFiles(baseDir, relativeDir = '') {
  const currentDir = path.join(baseDir, relativeDir);
  const items = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const item of items) {
    if (item.name.startsWith('.') || item.name.includes('.DS_Store') || item.name.endsWith('.bak')) {
      continue;
    }
    const relPath = relativeDir ? path.posix.join(relativeDir, item.name) : item.name;
    const fullPath = path.join(currentDir, item.name);

    if (item.isDirectory()) {
      files.push(...collectFiles(baseDir, relPath));
    } else if (item.isFile()) {
      files.push({ fullPath, zipPath: relPath });
    }
  }
  return files;
}

function main() {
  const ROOT_DIR = path.resolve(__dirname, '..');
  const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[ERROR] manifest.json not found in ' + ROOT_DIR);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const version = manifest.version;

  if (!version) {
    console.error('[ERROR] Could not extract version from manifest.json');
    process.exit(1);
  }

  console.log(`[BUILD] Packaging Career Autofill Extension v${version}...`);

  // Optional tag validation
  const args = process.argv.slice(2);
  const validateTagIdx = args.indexOf('--validate-tag');
  if (validateTagIdx !== -1) {
    const tag = args[validateTagIdx + 1];
    const expectedTag = `v${version}`;
    if (tag !== expectedTag) {
      console.error(`[ERROR] Version mismatch! Git tag is '${tag}' but manifest version is '${version}' (expected '${expectedTag}')`);
      process.exit(1);
    }
    console.log(`[OK] Git tag matches manifest version: ${tag}`);
  }

  const distDir = path.join(ROOT_DIR, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const zipFileName = `career-autofill-v${version}.zip`;
  const zipFilePath = path.join(distDir, zipFileName);
  const shaFilePath = path.join(distDir, `${zipFileName}.sha256`);

  const targetEntries = [
    { fullPath: path.join(ROOT_DIR, 'manifest.json'), zipPath: 'manifest.json' },
    { fullPath: path.join(ROOT_DIR, 'background.js'), zipPath: 'background.js' },
    { fullPath: path.join(ROOT_DIR, 'field-detector.js'), zipPath: 'field-detector.js' },
    { fullPath: path.join(ROOT_DIR, 'content.js'), zipPath: 'content.js' },
    ...collectFiles(ROOT_DIR, 'icons'),
    ...collectFiles(ROOT_DIR, 'popup')
  ];

  // Pre-process files and ensure reload controls are stripped for release
  const zipEntries = [];
  for (const entry of targetEntries) {
    let data = fs.readFileSync(entry.fullPath);

    if (entry.zipPath === 'popup/popup.html') {
      let htmlStr = data.toString('utf8');
      // Strip development-only reload controls
      htmlStr = htmlStr.replace(/<button[^>]*id="reloadExtBtn"[^>]*>[\s\S]*?<\/button>\s*/g, '');
      if (htmlStr.includes('reloadExtBtn')) {
        console.error('[ERROR] Failed to strip reloadExtBtn from popup.html for production build.');
        process.exit(1);
      }
      data = Buffer.from(htmlStr, 'utf8');
    }

    zipEntries.push({
      name: entry.zipPath.replace(/\\/g, '/'),
      data: data
    });
  }

  // Build standard zip archive
  const zipBuffer = createZipArchive(zipEntries);
  fs.writeFileSync(zipFilePath, zipBuffer);

  // Verify archive integrity
  const popupHtmlEntry = zipEntries.find(e => e.name === 'popup/popup.html');
  if (popupHtmlEntry && popupHtmlEntry.data.toString('utf8').includes('reloadExtBtn')) {
    console.error('[ERROR] Production zip contains dev-only reload button! Aborting.');
    process.exit(1);
  }
  console.log('[OK] Verified production bundle contains zero development-only reload controls.');

  // Compute SHA-256 checksum
  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  fs.writeFileSync(shaFilePath, `${sha256}  ${zipFileName}\n`, 'utf8');

  const fileSizeKb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`[SUCCESS] Successfully built: dist/${zipFileName} (${fileSizeKb} KB)`);
  console.log(`[SHA-256] Checksum: ${sha256}`);
  console.log('');
  console.log('Archive contents (' + zipEntries.length + ' files):');
  zipEntries.forEach(e => {
    console.log(`  - ${e.name} (${e.data.length} bytes)`);
  });
}

main();
