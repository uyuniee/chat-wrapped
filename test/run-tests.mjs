// Run: node test/run-tests.mjs   (Node 20+)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseChat } from '../js/parser.js';
import { computeStats } from '../js/stats.js';
import { readChatFile } from '../js/filereader.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
};

console.log('Parser');
await test('android DD/MM 24h + multiline + system line', () => {
  const t = `26/10/2026, 10:15 - Messages and calls are end-to-end encrypted.
26/10/2026, 10:15 - Aina: hello
line two
26/10/2026, 22:01 - Haziq: <Media omitted>
27/10/2026, 01:30 - Aina: This message was deleted`;
  const r = parseChat(t);
  assert.equal(r.messages.length, 3);
  assert.equal(r.messages[0].text, 'hello\nline two');
  assert.equal(r.messages[1].kind, 'media');
  assert.equal(r.messages[2].kind, 'deleted');
  assert.equal(new Date(r.messages[2].ts).getDate(), 27);
});

await test('US MM/DD/YY with AM/PM and narrow no-break space', () => {
  const t = `10/26/26, 10:15 PM - Aina: hi\n10/27/26, 12:05 AM - Haziq: yo`;
  const r = parseChat(t);
  assert.equal(r.dateOrder, 'MDY');
  assert.equal(new Date(r.messages[0].ts).getHours(), 22);
  assert.equal(new Date(r.messages[1].ts).getHours(), 0);
});

await test('iOS bracket format with LRM marks + edited', () => {
  const t = `[26/10/2026, 10:15:32] Aina: hey <This message was edited>\n‎[26/10/2026, 10:16:00] Haziq: ‎audio omitted`;
  const r = parseChat(t);
  assert.equal(r.format, 'ios');
  assert.equal(r.messages[0].edited, true);
  assert.equal(r.messages[0].text, 'hey');
  assert.equal(r.messages[1].mediaType, 'voice');
});

await test('rejects non-WhatsApp text', () => {
  assert.throws(() => parseChat('hello world\nnot a chat'));
});

console.log('Stats');
await test('stats contain no raw message text', () => {
  const t = `26/10/2026, 10:15 - Aina: rahsia sangat ni jangan bagitau sesiapa\n26/10/2026, 10:16 - Haziq: okay`;
  const json = JSON.stringify(computeStats(parseChat(t)));
  assert.ok(!json.includes('rahsia sangat ni'), 'full sentence leaked into stats');
});

await test('names are never Word of the Year', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `26/10/2026, 10:${String(i).padStart(2, '0')} - Aina: haziq haziq haziq`);
  lines.push('26/10/2026, 11:00 - Haziq: ok');
  const s = computeStats(parseChat(lines.join('\n')));
  assert.ok(!s.topWords.some((w) => w.key === 'haziq'));
});

for (const f of ['sample_duo_android.txt', 'sample_group_ios.txt']) {
  await test(`sample ${f} end-to-end`, () => {
    const s = computeStats(parseChat(readFileSync(join(root, 'sample', f), 'utf8')));
    assert.ok(s.totals.messages > 1000);
    assert.ok(s.persona);
    if (f.includes('duo')) { assert.equal(s.mode, 'duo'); assert.ok(s.compatibility >= 1); }
    else { assert.equal(s.mode, 'group'); assert.ok(s.ghost); }
    console.log(`     ${s.mode}: ${s.totals.messages} msgs, persona=${s.persona}, peak=${s.time.peakHour}:00, streak=${s.time.streak.days}d, laugh=${s.laugh[0]?.label}, emoji=${s.topEmoji[0]?.key}, word=${s.topWords[0]?.key}`);
  });
}

await test('big day: finds the day, detects a happy vibe, leaks no text', () => {
  const lines = ['25/10/2026, 10:00 - Aina: hi', '25/10/2026, 10:05 - Haziq: hello'];
  for (let i = 0; i < 20; i++) lines.push(`26/10/2026, 12:${String(i).padStart(2, '0')} - ${i % 2 ? 'Aina' : 'Haziq'}: happy birthday rahsia${i} 🎂`);
  const s = computeStats(parseChat(lines.join('\n')));
  assert.equal(s.bigDay.day, '2026-10-26');
  assert.equal(s.bigDay.count, 20);
  assert.ok(s.bigDay.vibes.some((v) => v.id === 'birthday'));
  assert.ok(!JSON.stringify(s.bigDay).includes('rahsia'));
});

console.log('File reader');
await test('reads _chat.txt from a zip and ignores media', async () => {
  const tmp = join(root, 'test', '.tmpzip');
  execSync(`rm -rf "${tmp}" && mkdir -p "${tmp}" && cp "${join(root, 'sample', 'sample_group_ios.txt')}" "${tmp}/_chat.txt" && head -c 200000 /dev/urandom > "${tmp}/00000001-PHOTO-2026.jpg" && cd "${tmp}" && zip -q chat.zip _chat.txt 00000001-PHOTO-2026.jpg`);
  const buf = readFileSync(join(tmp, 'chat.zip'));
  const file = new File([buf], 'WhatsApp Chat.zip', { type: 'application/zip' });
  const text = await readChatFile(file);
  assert.equal(text, readFileSync(join(root, 'sample', 'sample_group_ios.txt'), 'utf8'));
  execSync(`rm -rf "${tmp}"`);
});

await test('rejects unsupported file types', async () => {
  await assert.rejects(readChatFile(new File(['x'], 'photo.png', { type: 'image/png' })));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
