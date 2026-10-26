// parser.js: turns a WhatsApp export (.txt text) into structured messages.
// Pure function: no DOM, no network, no storage. Safe to run in a Web Worker or Node.

// Matches the start of a message line in both Android and iOS exports:
//   Android: 26/10/2026, 10:15 - Aina: hello
//   Android: 10/26/26, 10:15 PM - Aina: hello
//   iOS:     [26/10/2026, 10:15:32] Aina: hello
const LINE_RE =
  /^\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?(.*)$/i;

const DELETED_RE =
  /^(this message was deleted|you deleted this message|mesej ini telah dipadam|anda telah memadam mesej ini)\.?$/i;

const EDITED_RE = /\s*<(this message was edited|mesej ini telah disunting)>\s*$/i;

// [pattern, mediaType], checked in order, first match wins.
const MEDIA_PATTERNS = [
  [/^<media omitted>$/i, 'media'],
  [/^<media tidak disertakan>$/i, 'media'],
  [/^(image|photo) omitted$/i, 'image'],
  [/^video omitted$/i, 'video'],
  [/^(audio|voice message) omitted$/i, 'voice'],
  [/^sticker omitted$/i, 'sticker'],
  [/^gif omitted$/i, 'gif'],
  [/^document omitted$/i, 'document'],
  [/<attached: [^>]*-(audio|ptt)-[^>]*>/i, 'voice'],
  [/<attached: [^>]*-photo-[^>]*>/i, 'image'],
  [/<attached: [^>]*-video-[^>]*>/i, 'video'],
  [/<attached: [^>]*-sticker-[^>]*>/i, 'sticker'],
  [/\bPTT-\d+[^\s]*\s*\(file attached\)/i, 'voice'],
  [/\bAUD-\d+[^\s]*\s*\(file attached\)/i, 'voice'],
  [/\bIMG-\d+[^\s]*\s*\(file attached\)/i, 'image'],
  [/\bVID-\d+[^\s]*\s*\(file attached\)/i, 'video'],
  [/\bSTK-\d+[^\s]*\s*\(file attached\)/i, 'sticker'],
  [/\(file attached\)|<attached:/i, 'media'],
];

const MAX_AUTHOR_LEN = 60;

function normalize(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '') // direction marks
    .replace(/[  ]/g, ' '); // narrow / no-break spaces
}

function classify(body) {
  const trimmed = body.trim();
  if (DELETED_RE.test(trimmed)) return { kind: 'deleted', mediaType: null };
  for (const [re, type] of MEDIA_PATTERNS) {
    if (re.test(trimmed)) return { kind: 'media', mediaType: type };
  }
  return { kind: 'text', mediaType: null };
}

/**
 * @param {string} rawText full export text
 * @returns {{ messages: Array, participants: string[], dateOrder: 'DMY'|'MDY', format: 'ios'|'android' }}
 */
export function parseChat(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    throw new Error('File kosong atau bukan text.');
  }
  const lines = normalize(rawText).split('\n');

  // Pass 1: find timestamped lines + decide day/month order.
  const raw = [];
  let maxFirst = 0;
  let maxSecond = 0;
  let iosHits = 0;
  let current = null;

  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (m) {
      const [, a, b, y, hh, mi, ss, ampm, rest] = m;
      maxFirst = Math.max(maxFirst, +a);
      maxSecond = Math.max(maxSecond, +b);
      if (line.startsWith('[')) iosHits++;
      current = { a: +a, b: +b, y: +y, hh: +hh, mi: +mi, ss: ss ? +ss : 0, ampm, rest };
      raw.push(current);
    } else if (current) {
      current.rest += '\n' + line; // multi-line message continuation
    }
  }

  if (raw.length === 0) {
    throw new Error('Tak jumpa format WhatsApp. Pastikan ini file export chat (.txt atau .zip).');
  }

  // If the second field ever exceeds 12 it must be the day → MM/DD. Default DD/MM (Malaysia).
  const dateOrder = maxSecond > 12 && maxFirst <= 12 ? 'MDY' : 'DMY';
  const format = iosHits > raw.length / 2 ? 'ios' : 'android';

  // Pass 2: build messages.
  const messages = [];
  const participants = new Set();

  for (const r of raw) {
    const sep = r.rest.indexOf(': ');
    if (sep <= 0 || sep > MAX_AUTHOR_LEN) continue; // system message (joined, encryption notice, etc.)

    const author = r.rest.slice(0, sep).trim();
    let body = r.rest.slice(sep + 2);
    if (!author) continue;

    const day = dateOrder === 'DMY' ? r.a : r.b;
    const month = dateOrder === 'DMY' ? r.b : r.a;
    const year = r.y < 100 ? 2000 + r.y : r.y;
    let hour = r.hh;
    if (r.ampm) {
      const pm = /^p/i.test(r.ampm);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const ts = new Date(year, month - 1, day, hour, r.mi, r.ss).getTime();
    if (Number.isNaN(ts)) continue;

    let edited = false;
    if (EDITED_RE.test(body)) {
      edited = true;
      body = body.replace(EDITED_RE, '');
    }

    const { kind, mediaType } = classify(body);
    participants.add(author);
    messages.push({ ts, author, text: kind === 'text' ? body : '', kind, mediaType, edited });
  }

  if (messages.length === 0) {
    throw new Error('Chat ni takde mesej yang boleh dibaca.');
  }

  // Exports are chronological, but sort defensively (stable).
  messages.sort((x, y) => x.ts - y.ts);

  return { messages, participants: [...participants], dateOrder, format };
}
