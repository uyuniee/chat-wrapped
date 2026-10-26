// daystory.js: zooms into the busiest day and guesses the vibe, always in a cute, positive way.
// Reads messages only inside the worker. Returns numbers, emoji and vibe ids, never message text.
// We don't detect fights, sad topics, health, religion or relationships. Only happy signals.

import { LAUGH_STYLES, SORRY_RE, THANKS_RE } from './lexicon.js';

const PICTO = /\p{Extended_Pictographic}/u;
const HEARTS = /[❤♥🧡💛💚💙💜🤍🖤🤎💕💖💗💘💞💓💝🥰😍😘🥹]/u;

const SIGNALS = {
  birthday: /(happy\s*b(irth)?day|hbd|selamat hari jadi|sanah helwah|birthday|besday|🎂|🥳)/i,
  festive: /(selamat hari raya|eid mubarak|merry christmas|gong xi|happy cny|happy deepavali|happy new year|selamat tahun baru|salam aidil|🎆|🧧|🪔)/i,
  congrats: /(congrats|congratulations|tahniah|proud of (you|u)|so proud|bangga dengan|dapat offer|grad(uat)?|konvo|🎉|🏆)/i,
  plans: /(^|[^a-z])(jom|otw|on the way|dah sampai|i'm here|im here|jumpa (kat|dekat|dkt)|meet (at|up)|pick (you|u) up|tunggu (kat|dekat|dkt))(?![a-z])/i,
};

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function emojisIn(text, segmenter) {
  if (!PICTO.test(text)) return [];
  if (!segmenter) return [...text].filter((c) => PICTO.test(c));
  const out = [];
  for (const { segment } of segmenter.segment(text)) if (PICTO.test(segment)) out.push(segment.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ''));
  return out;
}

/**
 * @param {Array} msgs all parsed messages
 * @param {string} day 'YYYY-MM-DD' of the busiest day
 * @param {{avgWordsOverall: number}} ctx
 */
export function computeBigDay(msgs, day, { avgWordsOverall }) {
  if (!day) return null;
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

  const byHour = Array(24).fill(0);
  const perPerson = new Map();
  const emoji = new Map();
  const hits = { birthday: 0, festive: 0, congrats: 0, plans: 0 };
  let count = 0, laughs = 0, hearts = 0, kind = 0, late = 0, photos = 0, voice = 0, stickers = 0;
  let words = 0, textMsgs = 0, firstTs = null, lastTs = null;
  let prev = null, burst = 0, maxBurst = 0;
  const replies = [];

  for (const m of msgs) {
    if (keyOf(m.ts) !== day) continue;
    count++;
    if (firstTs == null) firstTs = m.ts;
    lastTs = m.ts;
    const h = new Date(m.ts).getHours();
    byHour[h]++;
    if (h >= 22 || h < 4) late++;
    perPerson.set(m.author, (perPerson.get(m.author) || 0) + 1);

    burst = prev && prev.author === m.author ? burst + 1 : 1;
    maxBurst = Math.max(maxBurst, burst);
    if (prev && prev.author !== m.author && m.ts - prev.ts < 3 * 3600e3) replies.push(m.ts - prev.ts);
    prev = m;

    if (m.kind === 'media') {
      if (m.mediaType === 'voice') voice++;
      else if (m.mediaType === 'sticker') stickers++;
      else photos++;
      continue;
    }
    if (m.kind !== 'text') continue;

    const t = m.text;
    textMsgs++;
    words += (t.match(/[\p{L}']+/gu) || []).length;
    if (LAUGH_STYLES.some((s) => s.re.test(t))) laughs++;
    if (HEARTS.test(t)) hearts++;
    if (SORRY_RE.test(t) || THANKS_RE.test(t)) kind++;
    for (const k of Object.keys(SIGNALS)) if (SIGNALS[k].test(t)) hits[k]++;
    for (const e of emojisIn(t, segmenter)) emoji.set(e, (emoji.get(e) || 0) + 1);
  }
  if (!count) return null;

  const avgWords = textMsgs ? words / textMsgs : 0;
  replies.sort((a, b) => a - b);
  const medianReplyMs = replies.length ? replies[replies.length >> 1] : null;

  // Each vibe gets a score; >= 1 means "this happened". Top 3 shown.
  const vibes = [
    { id: 'birthday', score: hits.birthday / 3, n: hits.birthday },
    { id: 'festive', score: hits.festive / 3, n: hits.festive },
    { id: 'congrats', score: hits.congrats / 3, n: hits.congrats },
    { id: 'plans', score: hits.plans / 4, n: hits.plans },
    { id: 'laugh', score: (laughs / count) / 0.15, n: laughs },
    { id: 'latenight', score: (late / count) / 0.4, n: late },
    { id: 'photos', score: (photos + stickers) / 12, n: photos + stickers },
    { id: 'voice', score: voice / 5, n: voice },
    { id: 'hearts', score: hearts / 6, n: hearts },
    { id: 'kind', score: kind / 6, n: kind },
    { id: 'bigtalk', score: avgWordsOverall ? (avgWords / avgWordsOverall) / 1.4 : 0, n: Math.round(avgWords) },
    { id: 'speedy', score: medianReplyMs == null ? 0 : 40e3 / Math.max(medianReplyMs, 1), n: medianReplyMs },
  ]
    .filter((v) => v.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, n }) => ({ id, n }));
  if (!vibes.length) vibes.push({ id: 'chatty', n: count });

  return {
    day,
    weekday: new Date(firstTs).getDay(),
    count,
    firstTs,
    lastTs,
    byHour,
    peakHour: byHour.indexOf(Math.max(...byHour)),
    people: [...perPerson.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
    topEmoji: [...emoji.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => ({ key, n })),
    maxBurst,
    medianReplyMs,
    vibes,
  };
}
