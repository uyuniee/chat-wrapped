// filereader.js — reads a WhatsApp export (.txt or .zip) into text.
// Zero dependencies: uses the browser's built-in DecompressionStream.
// Only the chat .txt inside a zip is read — photos, videos and voice notes are never opened.

export const LIMITS = {
  MAX_TXT_BYTES: 50 * 1024 * 1024, // 50 MB of chat text
  MAX_ZIP_BYTES: 2 * 1024 * 1024 * 1024, // 2 GB zip (with media); we only read a slice
};

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const mb = (n) => Math.round(n / (1024 * 1024));

async function readBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function decodeName(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

async function listZipEntries(file) {
  const tailLen = Math.min(file.size, 65557); // EOCD (22) + max comment (65535)
  const tail = await readBytes(file, file.size - tailLen, file.size);
  const view = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Zip ni rosak atau bukan zip.');

  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('Zip terlalu besar (Zip64). Cuba export "Without media".');
  }

  const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cv.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = cv.getUint16(p + 10, true);
    const compSize = cv.getUint32(p + 20, true);
    const uncompSize = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const localOffset = cv.getUint32(p + 42, true);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function pickChatEntry(entries) {
  const txt = entries.filter((e) => /\.txt$/i.test(e.name) && !e.name.startsWith('__MACOSX'));
  return (
    txt.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ||
    txt.find((e) => /whatsapp chat/i.test(e.name)) ||
    txt[0] ||
    null
  );
}

async function inflateLimited(blob) {
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > LIMITS.MAX_TXT_BYTES) {
      await reader.cancel();
      throw new Error(`Chat terlalu besar (lebih ${mb(LIMITS.MAX_TXT_BYTES)} MB).`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function readFromZip(file) {
  if (file.size > LIMITS.MAX_ZIP_BYTES) {
    throw new Error(`Zip terlalu besar (lebih ${mb(LIMITS.MAX_ZIP_BYTES)} MB). Export "Without media".`);
  }
  const entry = pickChatEntry(await listZipEntries(file));
  if (!entry) throw new Error('Takde file chat .txt dalam zip ni.');
  if (entry.uncompSize > LIMITS.MAX_TXT_BYTES) {
    throw new Error(`Chat terlalu besar (lebih ${mb(LIMITS.MAX_TXT_BYTES)} MB).`);
  }

  const lh = await readBytes(file, entry.localOffset, entry.localOffset + 30);
  const lv = new DataView(lh.buffer);
  if (lv.getUint32(0, true) !== SIG_LOCAL) throw new Error('Zip rosak.');
  const dataStart = entry.localOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  const data = file.slice(dataStart, dataStart + entry.compSize);

  let bytes;
  if (entry.method === 0) bytes = await readBytes(data, 0, data.size);
  else if (entry.method === 8) bytes = await inflateLimited(data);
  else throw new Error('Format compression zip tak disokong.');

  return new TextDecoder('utf-8').decode(bytes);
}

/** @param {Blob & {name?: string}} file */
export async function readChatFile(file) {
  const name = (file.name || '').toLowerCase();
  const isZip = name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

  if (isZip) return readFromZip(file);

  if (name.endsWith('.txt') || file.type === 'text/plain' || !name) {
    if (file.size > LIMITS.MAX_TXT_BYTES) {
      throw new Error(`Chat terlalu besar (lebih ${mb(LIMITS.MAX_TXT_BYTES)} MB).`);
    }
    return await file.text();
  }
  throw new Error('Upload file .txt atau .zip dari WhatsApp "Export chat".');
}
