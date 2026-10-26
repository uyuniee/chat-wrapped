// Generates FICTIONAL sample chats for testing. No real people, no real messages.
// Usage: node test/make-sample.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sample');
mkdirSync(outDir, { recursive: true });

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];

const LINES = [
  'weh dah makan ke', 'jom lepak mamak malam ni', 'hahahaha mati aku', 'okay', 'k', 'ya',
  'sorry lambat reply 😭', 'thank you!! 🥹', 'esok kelas pukul berapa', 'i literally cannot',
  'nak tidur dah ni', 'wkwkwk', 'HAHSJSKDJKS', 'lol', 'tengok ni 😂😂', 'otw', 'dah sampai',
  'nanti i call', 'penat gila harini', 'eh assignment tu due bila', 'boleh je', 'takpe takpe',
  'i think kita patut pergi awal', 'serious la 💀', 'rindu nasi lemak', 'jom teh tarik',
  'cuba teka apa jadi tadi', 'ok fine', 'really? 🤣', 'hehehe', 'good night 🌙', 'subuh dah ke',
];
const LONG = [
  'okay so basically tadi kat kafe tu orang beratur panjang gila then dia tutup awal pulak, so kita kena cari tempat lain and end up makan roti canai je',
  'i honestly think we should just plan everything awal-awal sebab last time kita last minute and semua jadi kelam kabut',
];
const MEDIA_ANDROID = ['<Media omitted>', 'PTT-20260101-WA0001.opus (file attached)', 'STK-20260101-WA0002.webp (file attached)'];
const MEDIA_IOS = ['image omitted', 'audio omitted', 'sticker omitted', 'video omitted'];

function gen({ people, start, days, perDay, ios }) {
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');
  const header = ios
    ? `[${fmtIos(new Date(start))}] ${people[0]}: Messages and calls are end-to-end encrypted.`
    : `${fmt(new Date(start))} - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.`;
  out.push(header);

  function fmt(d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtIos(d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  for (let day = 0; day < days; day++) {
    if (rand() < 0.08) continue; // some silent days
    const n = Math.floor(rand() * perDay) + (day === 120 ? 180 : 3); // one dramatic day
    let t = start + day * 86400e3 + (rand() < 0.3 ? 23 : 9) * 3600e3 + Math.floor(rand() * 4) * 3600e3;
    let who = pickOne(people);
    for (let i = 0; i < n; i++) {
      t += Math.floor(rand() * (rand() < 0.1 ? 3 * 3600e3 : 6 * 60e3)) + 5e3;
      if (rand() < 0.55) who = pickOne(people);
      const d = new Date(t);
      const stamp = ios ? `[${fmtIos(d)}] ` : `${fmt(d)} - `;
      const r = rand();
      let body;
      if (r < 0.08) body = pickOne(ios ? MEDIA_IOS : MEDIA_ANDROID);
      else if (r < 0.1) body = ios ? 'This message was deleted.' : 'This message was deleted';
      else if (r < 0.13) body = pickOne(LONG);
      else body = pickOne(LINES);
      if (rand() < 0.02) body += ' <This message was edited>';
      if (rand() < 0.03) body += '\nline kedua mesej panjang';
      out.push(stamp + `${who}: ${body}`);
    }
  }
  return out.join('\n') + '\n';
}

const start = new Date(2025, 10, 1, 0, 0, 0).getTime();
writeFileSync(join(outDir, 'sample_duo_android.txt'),
  gen({ people: ['Aina', 'Haziq'], start, days: 360, perDay: 25, ios: false }));
writeFileSync(join(outDir, 'sample_group_ios.txt'),
  gen({ people: ['Aina', 'Haziq', 'Sofea', '+60 12-345 6789', 'Danish'], start, days: 200, perDay: 40, ios: true }));
console.log('Sample chats written to', outDir);
