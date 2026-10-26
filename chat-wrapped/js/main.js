// main.js — UI only. Receives a stats object from the worker; never sees raw chat text.
// Safety rules followed here:
//   • No innerHTML anywhere: every piece of text goes in via text nodes (blocks XSS from chat content).
//   • No localStorage / IndexedDB / cookies: state lives in memory and dies with the tab.
//   • Names anonymised by default; the share image contains no names at all.

import { renderShareCard } from './share.js';

const app = document.getElementById('app');

const state = {
  stats: null,
  anonymize: true,
  index: 0,
  cards: [],
  worker: null,
};

/* ---------------- helpers ---------------- */

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) node.style.setProperty(sk, sv);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : String(kid)); // strings become text nodes, never HTML
  }
  return node;
}

const fmt = (n) => Math.round(n).toLocaleString('en-MY');
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtDate = (v) =>
  new Date(typeof v === 'string' ? `${v}T00:00:00` : v).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

function fmtDuration(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} saat`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}j ${Math.round(m % 60)}m`;
  return `${Math.round(h / 24)} hari`;
}

const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐨', '🐧', '🐝', '🦖', '🐳', '🦋'];

function maskPhone(name) {
  if (!/^\+?[\d\s\-()]{7,}$/.test(name)) return name;
  const digits = name.replace(/\D/g, '');
  return `+${digits.slice(0, 2)} •••• ${digits.slice(-2)}`;
}

function makeNamer(stats, anonymize) {
  const map = new Map();
  stats.people.forEach((p, i) => {
    const letter = i < 26 ? String.fromCharCode(65 + i) : `#${i + 1}`;
    map.set(p.name, anonymize ? `${AVATARS[i % AVATARS.length]} Person ${letter}` : maskPhone(p.name));
  });
  return (name) => (name == null ? '—' : map.get(name) || maskPhone(name));
}

function countUp(node, to, duration = 1300) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { node.textContent = fmt(to); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    node.textContent = fmt(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1 && node.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function toast(msg) {
  const t = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

const d = (s) => ({ '--d': `${s}s` });

/* ---------------- landing ---------------- */

function renderLanding(error) {
  app.replaceChildren();
  const netBadge = el('span', { class: 'net' });
  const updateNet = () => {
    const off = !navigator.onLine;
    netBadge.className = `net${off ? ' offline' : ''}`;
    netBadge.textContent = off ? '✓ Offline — paling selamat' : '● Online — tip: offkan WiFi dulu';
  };
  updateNet();
  window.ononline = updateNet; // assignment (not addEventListener) so re-renders don't stack listeners
  window.onoffline = updateNet;

  const input = el('input', {
    type: 'file',
    accept: '.txt,.zip,text/plain,application/zip',
    'aria-label': 'Pilih file export WhatsApp',
    onchange: (e) => e.target.files[0] && start(e.target.files[0]),
  });
  const drop = el('label', { class: 'drop' },
    input,
    el('span', { class: 'big' }, '📂'),
    el('strong', {}, 'Drop chat export kat sini'),
    el('small', {}, '.txt atau .zip dari WhatsApp → Export chat'),
  );
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('drag')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) start(f);
  });

  const anon = el('input', { type: 'checkbox', onchange: (e) => (state.anonymize = e.target.checked) });
  anon.checked = state.anonymize;

  app.append(
    el('section', { class: 'landing' },
      el('div', { class: 'topbar' }, el('div', { class: 'logo' }, 'chat ', el('span', {}, 'wrapped')), netBadge),
      el('div', { class: 'hero' },
        el('h1', {}, 'Your chat, ', el('em', {}, 'wrapped.')),
        el('p', {}, 'Spotify Wrapped, tapi untuk WhatsApp. Semua diproses dalam browser ni — chat you tak pernah keluar dari device.'),
      ),
      drop,
      error ? el('div', { class: 'error', role: 'alert' }, '⚠️ ', error) : null,
      el('label', { class: 'toggle' }, anon,
        el('span', {}, 'Sorok nama (anonymize)', el('small', {}, 'Nama jadi 🦊 Person A, 🐼 Person B… Recommended.'))),
      el('ul', { class: 'promises' },
        promise('📵', 'Takde upload', 'Browser block semua network request (CSP connect-src none).'),
        promise('🧠', 'Takde simpan', 'Data dalam memory je. Tutup tab = hilang.'),
        promise('🕵️', 'Takde tracker', 'Zero analytics, zero CDN, zero cookies.'),
        promise('🔓', 'Open source', 'Semua code boleh audit kat GitHub.'),
      ),
      el('details', { class: 'howto' },
        el('summary', {}, '🤖 Cara export — Android'),
        el('ol', {},
          el('li', {}, 'Buka chat → tekan ⋮ (atas kanan)'),
          el('li', {}, 'More → Export chat'),
          el('li', {}, 'Pilih "Without media" (lagi ringan)'),
          el('li', {}, 'Simpan ke Files, lepas tu upload kat sini'),
        ),
      ),
      el('details', { class: 'howto' },
        el('summary', {}, '🍎 Cara export — iPhone'),
        el('ol', {},
          el('li', {}, 'Buka chat → tekan nama orang/group kat atas'),
          el('li', {}, 'Scroll bawah → Export Chat'),
          el('li', {}, 'Pilih "Without Media" → Save to Files'),
          el('li', {}, 'Upload file .zip tu kat sini'),
        ),
      ),
      el('p', { class: 'fineprint' },
        'Chat ni ada mesej orang lain juga — share hasil dengan bertanggungjawab. ',
        'Projek fun, tidak berkaitan dengan WhatsApp atau Meta. ',
        'Statistik dikira secara automatik dan mungkin tak 100% tepat.'),
    ),
  );
}

function promise(icon, title, text) {
  return el('li', {}, el('span', { class: 'ico' }, icon), el('b', {}, title), text);
}

/* ---------------- processing ---------------- */

const STEPS = { reading: 'Membaca file…', parsing: 'Menyusun mesej…', counting: 'Mengira statistik…' };

function start(file) {
  const label = el('p', {}, STEPS.reading);
  app.replaceChildren(
    el('section', { class: 'loading' },
      el('div', {}, el('div', { class: 'spinner' }), label, el('small', {}, 'Semua berlaku dalam device you 🔒'))),
  );

  state.worker?.terminate();
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  state.worker = worker;
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'progress') label.textContent = STEPS[msg.step] || 'Sekejap…';
    if (msg.type === 'error') { worker.terminate(); state.worker = null; renderLanding(msg.message); }
    if (msg.type === 'done') {
      worker.terminate(); // kill the worker — its memory (raw text) is released
      state.worker = null;
      state.stats = msg.stats;
      openStory();
    }
  };
  worker.onerror = () => { worker.terminate(); state.worker = null; renderLanding('Browser ni tak support. Cuba Chrome, Safari atau Firefox terkini.'); };
  worker.postMessage({ file });
}

/* ---------------- cards ---------------- */

const PERSONAS = {
  midnight: { emoji: '🌙', name: 'The Midnight Philosophers', desc: 'Bila orang lain tidur, korang baru nak mula bercerita.', theme: 't-night' },
  speed: { emoji: '⚡', name: 'The Speed Texters', desc: 'Reply laju macam takde kerja lain. Respect.', theme: 't-yellow' },
  comedy: { emoji: '😂', name: 'The Comedy Club', desc: 'Separuh chat ni gelak. Sihat la tu.', theme: 't-pink' },
  essay: { emoji: '📜', name: 'The Essay Writers', desc: 'Satu mesej boleh jadi satu bab novel.', theme: 't-blue' },
  meme: { emoji: '🖼️', name: 'The Meme Dealers', desc: 'Kurang bercakap, banyak hantar gambar.', theme: 't-orange' },
  lurker: { emoji: '👻', name: 'The Lurker Society', desc: 'Sorang dua je bercakap, yang lain penonton setia.', theme: 't-purple' },
  steady: { emoji: '🤝', name: 'The Steady Companions', desc: 'Konsisten, seimbang, sentiasa ada.', theme: 't-green' },
};

function tile(label, who, val, wide = false, delay = 0) {
  return el('div', { class: `tile reveal${wide ? ' wide' : ''}`, style: d(delay) },
    el('div', { class: 'label' }, label), el('div', { class: 'who' }, who), val ? el('div', { class: 'val' }, val) : null);
}

function buildCards(s, nm) {
  const cards = [];
  const add = (theme, fn) => cards.push({ theme, render: fn });
  const person = (name) => s.people.find((p) => p.name === name);
  const year = new Date(s.totals.lastTs).getFullYear();

  // 1. Intro
  add('t-purple', () => {
    const n = el('div', { class: 'huge pop', style: d(0.3) }, '0');
    countUp(n, s.totals.messages);
    return [
      el('div', { class: 'eyebrow reveal' }, `Chat Wrapped ${year}`),
      el('h2', { class: 'title reveal', style: d(0.1) }, s.mode === 'duo' ? 'Korang berdua dah hantar' : 'Group ni dah hantar'),
      n,
      el('p', { class: 'title reveal', style: d(0.5) }, 'mesej.'),
      el('p', { class: 'sub reveal', style: d(0.8) },
        `Dalam ${fmt(s.totals.spanDays)} hari, dari ${fmtDate(s.totals.firstTs)} sampai ${fmtDate(s.totals.lastTs)}.`),
      el('span', { class: 'chip reveal', style: d(1) }, s.mode === 'duo' ? '💌 Duo mode' : `👥 Group mode · ${s.participantCount} orang`),
    ];
  });

  // 2. Clock
  add('t-night', () => {
    const t = s.time;
    const max = Math.max(...t.byHour);
    const tag = t.nightShare > 0.15 ? 'Night Owls 🦉' : t.peakHour >= 5 && t.peakHour <= 8 ? 'Subuh Warriors 🌅' : 'Prime Time ⏰';
    return [
      el('div', { class: 'eyebrow reveal' }, 'Jam paling aktif'),
      el('div', { class: 'huge pop', style: d(0.2) }, hourLabel(t.peakHour)),
      el('h2', { class: 'title reveal', style: d(0.4) }, tag),
      el('div', { class: 'hours', 'aria-hidden': 'true' },
        t.byHour.map((c, h) => el('span', { class: h === t.peakHour ? 'peak' : '', style: { height: `${Math.max(3, (c / max) * 100)}%`, '--d': `${0.5 + h * 0.03}s` } }))),
      el('div', { class: 'hours-axis' }, el('span', {}, '12AM'), el('span', {}, '6AM'), el('span', {}, '12PM'), el('span', {}, '6PM'), el('span', {}, '11PM')),
      el('p', { class: 'sub reveal', style: d(1.2) },
        `${pct(t.nightShare)} mesej dihantar antara 12AM–5AM.`,
        s.awards.nightOwl && t.nightShare > 0.02 ? ` Burung hantu utama: ${nm(s.awards.nightOwl)}.` : ''),
    ];
  });

  // 3. Busiest day
  add('t-orange', () => {
    const b = s.time.busiest;
    const avg = s.totals.messages / Math.max(1, s.totals.activeDays);
    return [
      el('div', { class: 'eyebrow reveal' }, 'The day it all went down'),
      el('div', { class: 'big pop', style: d(0.2) }, fmtDate(b.day)),
      el('h2', { class: 'title reveal', style: d(0.5) }, `${fmt(b.count)} mesej dalam satu hari.`),
      el('p', { class: 'sub reveal', style: d(0.8) },
        `Hari biasa purata ${fmt(avg)}. Hari tu ${(b.count / avg).toFixed(1)}× ganda. Apa jadi?? 👀`),
    ];
  });

  // 4. Streak & silence
  add('t-lime', () => {
    const st = s.time.streak;
    const g = s.time.longestGap;
    const n = el('div', { class: 'huge pop', style: d(0.2) }, '0');
    countUp(n, st.days, 900);
    return [
      el('div', { class: 'eyebrow reveal' }, 'Longest streak 🔥'),
      n,
      el('h2', { class: 'title reveal', style: d(0.4) }, 'hari berturut-turut tak miss chat.'),
      el('p', { class: 'sub reveal', style: d(0.6) }, `${fmtDate(st.start)} → ${fmtDate(st.end)}`),
      g.ms > 0 ? tile('The Great Silence 🤐', fmtDuration(g.ms), `Paling lama senyap, bermula ${fmtDate(g.from)}.`, true, 0.9) : null,
    ];
  });

  // 5. Opener & killer
  if (s.awards.opener || s.awards.killer) add('t-pink', () => [
    el('div', { class: 'eyebrow reveal' }, 'Siapa start, siapa end'),
    el('h2', { class: 'title reveal', style: d(0.1) }, 'Every chat needs a starter… and a killer.'),
    el('div', { class: 'duo-grid' },
      tile('The Opener 👋', nm(s.awards.opener), `Mula ${fmt(person(s.awards.opener)?.starts || 0)} perbualan`, false, 0.4),
      tile('Conversation Killer 💀', nm(s.awards.killer), `Mesej terakhir sebelum senyap ${fmt(person(s.awards.killer)?.kills || 0)} kali`, false, 0.6)),
    el('p', { class: 'sub reveal', style: d(0.9) }, 'Perbualan baru dikira bila senyap lebih 6 jam.'),
  ]);

  // 6. Reply speed
  if (s.awards.flash) add('t-blue', () => {
    const flash = person(s.awards.flash);
    const slow = person(s.awards.seenZone);
    return [
      el('div', { class: 'eyebrow reveal' }, 'Reply speed'),
      el('div', { class: 'big pop', style: d(0.2) }, fmtDuration(s.overallMedianReplyMs)),
      el('h2', { class: 'title reveal', style: d(0.4) }, 'masa biasa untuk dapat reply.'),
      el('div', { class: 'duo-grid' },
        tile('The Flash ⚡', nm(flash.name), `Biasa reply dalam ${fmtDuration(flash.medianReplyMs)}`, false, 0.6),
        slow && slow.name !== flash.name
          ? tile('Seen-Zone Champ 🫠', nm(slow.name), `Biasa ${fmtDuration(slow.medianReplyMs)}`, false, 0.8)
          : tile('Seen-Zone Champ 🫠', 'Takde!', 'Semua reply laju 🙌', false, 0.8)),
    ];
  });

  // 7. Texting style
  add('t-yellow', () => {
    const para = person(s.awards.paragraph);
    const k = person(s.awards.kReplier);
    const tri = person(s.awards.tripleTexter);
    return [
      el('div', { class: 'eyebrow reveal' }, 'Gaya menaip'),
      el('h2', { class: 'title reveal', style: d(0.1) }, 'Essay writer vs "k."'),
      el('div', { class: 'duo-grid' },
        para ? tile('Paragraph Writer 📜', nm(para.name), `Purata ${para.avgWords.toFixed(1)} perkataan/mesej`, false, 0.3) : null,
        k ? tile('"K." Replier 🗿', nm(k.name), `${pct(k.oneWordShare)} mesej satu perkataan`, false, 0.5) : null,
        tri && tri.bursts3 > 0 ? tile('Triple Texter 📲', nm(tri.name), `${fmt(tri.bursts3)} kali hantar 3+ mesej berturut. Rekod: ${tri.maxBurst} sekaligus!`, true, 0.7) : null),
    ];
  });

  // 8. Laugh fingerprint
  if (s.laugh.length) add('t-pink', () => {
    const top = s.laugh[0];
    const max = top.count;
    return [
      el('div', { class: 'eyebrow reveal' }, 'Laugh fingerprint'),
      el('div', { class: /\p{Extended_Pictographic}/u.test(top.label) ? 'persona-emoji pop' : 'big pop', style: d(0.2) }, top.label),
      el('h2', { class: 'title reveal', style: d(0.4) }, 'cara korang gelak.'),
      el('div', { class: 'rows' },
        s.laugh.slice(0, 5).map((l, i) =>
          el('div', { class: 'row reveal', style: d(0.6 + i * 0.12) },
            el('span', { class: 'name' }, l.label),
            el('span', { class: 'bar' }, el('b', { style: { width: `${(l.count / max) * 100}%`, '--d': `${0.7 + i * 0.12}s` } })),
            el('span', { class: 'num' }, fmt(l.count))))),
      s.awards.comedian ? el('p', { class: 'sub reveal', style: d(1.3) }, `Paling murah gelak: ${nm(s.awards.comedian)} 🤭`) : null,
    ];
  });

  // 9. Bahasa Rojak
  if (s.language.malayWords + s.language.englishWords > 0) add('t-green', () => {
    const L = s.language;
    const verdict = L.rojakShare > 0.3 ? 'Certified Manglish 🇲🇾' : L.malayShare > 0.7 ? 'Bahasa Jiwa Bangsa 📚' : L.malayShare < 0.3 ? 'Speaking London 💂' : 'Rojak Sedang-sedang 🥗';
    return [
      el('div', { class: 'eyebrow reveal' }, 'Bahasa Rojak Score'),
      el('div', { class: 'huge pop', style: d(0.2) }, pct(L.rojakShare)),
      el('h2', { class: 'title reveal', style: d(0.4) }, 'mesej campur BM + English dalam satu ayat.'),
      el('div', { class: 'split reveal', style: d(0.6) },
        el('div', { class: 'ms', style: { width: pct(L.malayShare) } }, L.malayShare > 0.12 ? `BM ${pct(L.malayShare)}` : ''),
        el('div', { class: 'en', style: { width: pct(1 - L.malayShare) } }, L.malayShare < 0.88 ? `EN ${pct(1 - L.malayShare)}` : '')),
      el('p', { class: 'big reveal', style: d(0.9) }, verdict),
    ];
  });

  // 10. Emoji + word
  if (s.topEmoji.length || s.topWords.length) add('t-purple', () => [
    el('div', { class: 'eyebrow reveal' }, 'Top emoji'),
    s.topEmoji.length
      ? el('div', { class: 'emojis' }, s.topEmoji.map((e, i) =>
        el('div', { class: 'e pop', style: d(0.2 + i * 0.12) }, el('span', {}, e.key), el('b', {}, `${fmt(e.count)}×`))))
      : el('p', { class: 'sub' }, 'Takde emoji langsung? Serius ke 😐'),
    s.topWords.length ? el('div', { class: 'eyebrow reveal', style: d(0.9) }, 'Word of the year') : null,
    s.topWords.length ? el('div', { class: 'big pop', style: d(1.1) }, `"${s.topWords[0].key}"`) : null,
    s.topWords.length ? el('p', { class: 'sub reveal', style: d(1.3) }, `Disebut ${fmt(s.topWords[0].count)} kali.`) : null,
  ]);

  // 11. Extras
  const reg = person(s.awards.regretter), pod = person(s.awards.podcaster), stk = person(s.awards.stickerLord), pol = person(s.awards.polite);
  if (reg || pod || stk || pol) add('t-orange', () => [
    el('div', { class: 'eyebrow reveal' }, 'Special awards 🏆'),
    el('h2', { class: 'title reveal', style: d(0.1) }, 'Dan anugerah jatuh kepada…'),
    el('div', { class: 'duo-grid' },
      reg ? tile('The Regretter 🗑️', nm(reg.name), `${fmt(reg.deleted)} mesej dipadam`, false, 0.3) : null,
      pod ? tile('The Podcaster 🎙️', nm(pod.name), `${fmt(pod.voice)} voice note`, false, 0.45) : null,
      stk ? tile('Sticker Lord 🎭', nm(stk.name), `${fmt(stk.stickers)} sticker`, false, 0.6) : null,
      pol ? tile('Paling Beradab 🙏', nm(pol.name), `${fmt(pol.sorry)} sorry · ${fmt(pol.thanks)} thank you`, false, 0.75) : null),
  ]);

  // 12. Duo compatibility / group leaderboard
  if (s.mode === 'duo' && s.compatibility != null) {
    add('t-pink', () => {
      const ring = el('div', { class: 'ring pop', style: { '--p': s.compatibility, '--d': '0.3s' } }, el('b', {}, `${s.compatibility}%`));
      const verdict = s.compatibility >= 80 ? 'Soulmate texting energy 💞' : s.compatibility >= 60 ? 'Solid duo 🤜🤛' : s.compatibility >= 40 ? 'Ada usaha, boleh improve 😅' : 'Sorang je yang effort… 🫣';
      const [a, b] = s.people;
      return [
        el('div', { class: 'eyebrow reveal' }, 'Chat compatibility'),
        ring,
        el('h2', { class: 'title reveal', style: d(0.8) }, verdict),
        el('p', { class: 'sub reveal', style: d(1) },
          `${nm(a.name)} ${pct(a.share)} vs ${nm(b.name)} ${pct(b.share)} mesej. Dikira dari keseimbangan mesej, siapa start, dan kelajuan reply. Untuk fun je ya!`),
      ];
    });
  } else if (s.mode === 'group') {
    add('t-blue', () => {
      const top = s.people.slice(0, 6);
      const max = top[0].messages;
      return [
        el('div', { class: 'eyebrow reveal' }, 'Group leaderboard'),
        el('h2', { class: 'title reveal', style: d(0.1) }, 'Siapa paling bising? 📢'),
        el('div', { class: 'rows' }, top.map((p, i) =>
          el('div', { class: 'row reveal', style: d(0.3 + i * 0.12) },
            el('span', { class: 'name' }, nm(p.name)),
            el('span', { class: 'bar' }, el('b', { style: { width: `${(p.messages / max) * 100}%`, '--d': `${0.4 + i * 0.12}s` } })),
            el('span', { class: 'num' }, pct(p.share))))),
        tile('Ghost of the Group 👻', nm(s.ghost), `Cuma ${pct(person(s.ghost).share)} mesej. Ada lagi ke tu?`, true, 1.2),
      ];
    });
  }

  // 13. Finale
  const persona = PERSONAS[s.persona] || PERSONAS.steady;
  add(persona.theme, () => [
    el('div', { class: 'eyebrow reveal' }, 'Chat persona korang'),
    el('div', { class: 'persona-emoji pop', style: d(0.2) }, persona.emoji),
    el('h2', { class: 'title reveal', style: d(0.5) }, persona.name),
    el('p', { class: 'sub reveal', style: d(0.7) }, persona.desc),
    el('div', { class: 'actions reveal', style: d(1) },
      el('button', { class: 'btn', 'data-action': 'share' }, '⬇️ Download share card'),
      el('button', { class: 'btn ghost', 'data-action': 'replay' }, '↺ Replay'),
      el('button', { class: 'btn danger', 'data-action': 'exit' }, '🧹 Clear & Exit')),
    el('p', { class: 'sub reveal', style: { '--d': '1.2s', 'font-size': '13px' } }, 'Share card takde nama sesiapa — selamat untuk post.'),
  ]);

  return cards;
}

/* ---------------- story player ---------------- */

let keyHandler = null;

function openStory() {
  state.cards = buildCards(state.stats, makeNamer(state.stats, state.anonymize));
  state.index = 0;
  renderStory();
  keyHandler = (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'Escape') clearAndExit();
  };
  window.addEventListener('keydown', keyHandler);
}

function go(step) {
  const next = state.index + step;
  if (next < 0 || next >= state.cards.length) return;
  state.index = next;
  renderStory();
}

function renderStory() {
  const card = state.cards[state.index];
  const anonBtn = el('button', { class: 'iconbtn', 'data-action': 'anon', title: 'Tukar sorok/tunjuk nama', 'aria-label': 'Tukar sorok/tunjuk nama' }, state.anonymize ? '🙈' : '👀');

  const story = el('section', { class: 'story', 'aria-roledescription': 'story' },
    el('div', { class: `stage ${card.theme}` }),
    el('div', { class: 'bars' }, state.cards.map((_, i) => el('i', { class: i < state.index ? 'done' : i === state.index ? 'now' : '' }))),
    el('div', { class: 'story-top' },
      el('div', { class: 'logo' }, 'chat ', el('span', {}, 'wrapped')),
      el('div', { class: 'actions' }, anonBtn, el('button', { class: 'iconbtn', 'data-action': 'exit', title: 'Clear & Exit', 'aria-label': 'Clear and exit' }, '✕'))),
    el('article', { class: 'card', 'aria-label': `Kad ${state.index + 1} dari ${state.cards.length}` }, card.render()),
    state.index === 0 ? el('div', { class: 'hint' }, 'Tap kanan → seterusnya · tap kiri ← sebelum') : null,
  );

  story.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'exit') return clearAndExit();
    if (action === 'share') return downloadShare();
    if (action === 'replay') { state.index = 0; return renderStory(); }
    if (action === 'anon') {
      state.anonymize = !state.anonymize;
      const keep = state.index;
      state.cards = buildCards(state.stats, makeNamer(state.stats, state.anonymize));
      state.index = keep;
      toast(state.anonymize ? 'Nama disorokkan 🙈' : 'Nama ditunjuk 👀 — hati-hati bila screenshot');
      return renderStory();
    }
    if (e.target.closest('button, a')) return;
    const x = e.clientX / window.innerWidth;
    go(x < 0.3 ? -1 : 1);
  });

  app.replaceChildren(story);
}

async function downloadShare() {
  const blob = await renderShareCard(state.stats, PERSONAS[state.stats.persona] || PERSONAS.steady);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'chat-wrapped.png' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Share card dah download ✓');
}

function clearAndExit() {
  state.worker?.terminate();
  state.worker = null;
  state.stats = null;
  state.cards = [];
  state.index = 0;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  renderLanding();
  toast('Semua data dah dibuang dari memory ✓');
}

renderLanding();
