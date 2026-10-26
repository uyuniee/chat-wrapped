// stats.js: computes every Wrapped insight in a single pass.
// Output is a plain object of numbers, names and short labels.
// It NEVER contains full message text, so nothing sensitive leaves this function.

import { MALAY, ENGLISH, STOPWORDS, LAUGH_STYLES, SORRY_RE, THANKS_RE } from './lexicon.js';
import { computeBigDay } from './daystory.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const PICTO = /\p{Extended_Pictographic}/u;
const WORD_RE = /[\p{L}']+/gu;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function emojisIn(text) {
  if (!PICTO.test(text)) return [];
  const out = [];
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) {
      if (PICTO.test(segment)) out.push(segment.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')); // drop skin tone
    }
  } else {
    for (const ch of text) if (PICTO.test(ch)) out.push(ch);
  }
  return out;
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function newPerson(name) {
  return {
    name, messages: 0, textMsgs: 0, words: 0, oneWord: 0,
    media: { image: 0, video: 0, voice: 0, sticker: 0, gif: 0, document: 0, media: 0 },
    deleted: 0, edited: 0, laughs: 0, sorry: 0, thanks: 0,
    starts: 0, kills: 0, replyTimes: [], maxBurst: 0, bursts3: 0, night: 0,
    emojis: new Map(),
  };
}

/**
 * @param {{messages: Array, participants: string[]}} parsed
 * @param {{convoGapHours?: number}} opts
 */
export function computeStats(parsed, { convoGapHours = 6 } = {}) {
  const msgs = parsed.messages;
  const gapMs = convoGapHours * HOUR;

  const people = new Map();
  const P = (name) => {
    let p = people.get(name);
    if (!p) { p = newPerson(name); people.set(name, p); }
    return p;
  };

  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const byDay = new Map();
  const wordFreq = new Map();
  const emojiFreq = new Map();
  const laugh = Object.fromEntries(LAUGH_STYLES.map((s) => [s.key, 0]));
  let malayWords = 0, englishWords = 0, langMsgs = 0, rojakMsgs = 0;
  let longestGap = { ms: 0, from: null, to: null };
  let prev = null;
  let burst = 0;
  let totalWords = 0;

  for (const m of msgs) {
    const p = P(m.author);
    p.messages++;

    const d = new Date(m.ts);
    const h = d.getHours();
    byHour[h]++;
    byWeekday[d.getDay()]++;
    inc(byDay, dayKey(d));
    if (h < 5) p.night++;

    // Conversations: a gap longer than convoGapHours starts a new one.
    if (!prev || m.ts - prev.ts > gapMs) {
      p.starts++;
      if (prev) P(prev.author).kills++;
    } else if (prev.author !== m.author) {
      p.replyTimes.push(m.ts - prev.ts);
    }
    if (prev && m.ts - prev.ts > longestGap.ms) longestGap = { ms: m.ts - prev.ts, from: prev.ts, to: m.ts };

    burst = prev && prev.author === m.author ? burst + 1 : 1;
    if (burst > p.maxBurst) p.maxBurst = burst;
    if (burst === 3) p.bursts3++;

    if (m.edited) p.edited++;

    if (m.kind === 'deleted') {
      p.deleted++;
    } else if (m.kind === 'media') {
      p.media[m.mediaType] = (p.media[m.mediaType] || 0) + 1;
    } else {
      const text = m.text;
      const lower = text.toLowerCase();
      const tokens = lower.match(WORD_RE) || [];
      p.textMsgs++;
      p.words += tokens.length;
      totalWords += tokens.length;
      if (tokens.length <= 1) p.oneWord++;

      let laughed = false;
      for (const s of LAUGH_STYLES) {
        if (s.re.test(text)) { laugh[s.key]++; laughed = true; }
      }
      if (laughed) p.laughs++;
      if (SORRY_RE.test(lower)) p.sorry++;
      if (THANKS_RE.test(lower)) p.thanks++;

      for (const e of emojisIn(text)) { inc(emojiFreq, e); inc(p.emojis, e); }

      let ms = 0, en = 0;
      for (const t of tokens) {
        if (MALAY.has(t)) ms++;
        else if (ENGLISH.has(t)) en++;
        if (t.length >= 3 && !STOPWORDS.has(t) && !/^(ha|he|wk)+h?$/.test(t)) inc(wordFreq, t);
      }
      if (ms + en > 0) {
        langMsgs++;
        malayWords += ms;
        englishWords += en;
        if (ms > 0 && en > 0) rojakMsgs++;
      }
    }
    prev = m;
  }

  // Never surface participants' own names as "Word of the Year".
  for (const name of people.keys()) {
    for (const part of name.toLowerCase().match(WORD_RE) || []) wordFreq.delete(part);
  }

  // Busiest day + longest daily streak.
  let busiest = { day: null, count: 0 };
  for (const [k, c] of byDay) if (c > busiest.count) busiest = { day: k, count: c };

  const dayNums = [...byDay.keys()]
    .map((k) => { const [y, mo, da] = k.split('-').map(Number); return Date.UTC(y, mo - 1, da) / DAY; })
    .sort((a, b) => a - b);
  let streak = { days: dayNums.length ? 1 : 0, start: dayNums[0], end: dayNums[0] };
  let runStart = dayNums[0];
  for (let i = 1; i < dayNums.length; i++) {
    if (dayNums[i] !== dayNums[i - 1] + 1) runStart = dayNums[i];
    const len = dayNums[i] - runStart + 1;
    if (len > streak.days) streak = { days: len, start: runStart, end: dayNums[i] };
  }
  const isoFromDayNum = (n) => (n == null ? null : new Date(n * DAY).toISOString().slice(0, 10));

  // Per-person summaries (numbers only).
  const total = msgs.length;
  const persons = [...people.values()].map((p) => {
    const medReply = median(p.replyTimes);
    return {
      name: p.name,
      messages: p.messages,
      share: p.messages / total,
      avgWords: p.textMsgs ? p.words / p.textMsgs : 0,
      oneWordShare: p.textMsgs ? p.oneWord / p.textMsgs : 0,
      media: p.media,
      voice: p.media.voice,
      stickers: p.media.sticker,
      deleted: p.deleted,
      edited: p.edited,
      laughs: p.laughs,
      sorry: p.sorry,
      thanks: p.thanks,
      starts: p.starts,
      kills: p.kills,
      replies: p.replyTimes.length,
      medianReplyMs: medReply,
      maxBurst: p.maxBurst,
      bursts3: p.bursts3,
      nightShare: p.messages ? p.night / p.messages : 0,
      topEmoji: topN(p.emojis, 3),
    };
  }).sort((a, b) => b.messages - a.messages);

  const pick = (list, score, { min = -Infinity, needs = () => true } = {}) => {
    const c = list.filter(needs).filter((x) => score(x) > min);
    if (!c.length) return null;
    return c.reduce((best, x) => (score(x) > score(best) ? x : best));
  };
  const enoughReplies = (x) => x.replies >= 5 && x.medianReplyMs != null;

  const awards = {
    opener: pick(persons, (x) => x.starts, { min: 0 }),
    killer: pick(persons, (x) => x.kills, { min: 0 }),
    flash: pick(persons, (x) => -x.medianReplyMs, { needs: enoughReplies }),
    seenZone: pick(persons, (x) => x.medianReplyMs, { needs: enoughReplies }),
    paragraph: pick(persons, (x) => x.avgWords, { min: 0 }),
    kReplier: pick(persons, (x) => x.oneWordShare, { min: 0 }),
    tripleTexter: pick(persons, (x) => x.bursts3, { min: 0 }),
    regretter: pick(persons, (x) => x.deleted, { min: 0 }),
    podcaster: pick(persons, (x) => x.voice, { min: 0 }),
    stickerLord: pick(persons, (x) => x.stickers, { min: 0 }),
    nightOwl: pick(persons, (x) => x.nightShare, { min: 0 }),
    polite: pick(persons, (x) => x.sorry + x.thanks, { min: 0 }),
    comedian: pick(persons, (x) => x.laughs, { min: 0 }),
  };
  // Reduce awards to names only.
  for (const k of Object.keys(awards)) awards[k] = awards[k] ? awards[k].name : null;

  const mode = persons.length > 2 ? 'group' : 'duo';
  const allReplies = [...people.values()].flatMap((p) => p.replyTimes);
  const overallMedianReply = median(allReplies);
  const nightTotal = byHour.slice(0, 5).reduce((a, b) => a + b, 0);
  const mediaTotal = persons.reduce((a, x) => a + Object.values(x.media).reduce((s, v) => s + v, 0), 0);
  const laughMsgs = persons.reduce((a, x) => a + x.laughs, 0);
  const textMsgsTotal = [...people.values()].reduce((a, p) => a + p.textMsgs, 0);

  // Duo compatibility: balance of effort + speed. Just for fun, not science.
  let compatibility = null;
  if (mode === 'duo' && persons.length === 2) {
    const [a, b] = persons;
    const bal = (x, y) => (x + y ? 1 - Math.abs(x - y) / (x + y) : 1);
    const speed = overallMedianReply == null ? 0.5 : Math.max(0, 1 - overallMedianReply / (60 * 60e3));
    const score = 0.4 * bal(a.messages, b.messages) + 0.3 * bal(a.starts, b.starts) + 0.3 * speed;
    compatibility = Math.max(1, Math.min(100, Math.round(score * 100)));
  }

  const ghost = mode === 'group' ? persons[persons.length - 1].name : null;

  const firstTs = msgs[0].ts;
  const lastTs = msgs[msgs.length - 1].ts;
  const peakHour = byHour.indexOf(Math.max(...byHour));

  // Persona: highest scoring trait wins.
  const traits = [
    { id: 'midnight', score: (nightTotal / total) / 0.2 },
    { id: 'speed', score: overallMedianReply == null ? 0 : 120e3 / Math.max(overallMedianReply, 1) },
    { id: 'comedy', score: textMsgsTotal ? (laughMsgs / textMsgsTotal) / 0.12 : 0 },
    { id: 'essay', score: textMsgsTotal ? (totalWords / textMsgsTotal) / 12 : 0 },
    { id: 'meme', score: (mediaTotal / total) / 0.18 },
    { id: 'lurker', score: mode === 'group' ? (persons[0].share / Math.max(persons.at(-1).share, 0.001)) / 25 : 0 },
  ];
  const best = traits.reduce((a, b) => (b.score > a.score ? b : a));
  const persona = best.score >= 1 ? best.id : 'steady';

  return {
    mode,
    participantCount: persons.length,
    totals: {
      messages: total,
      words: totalWords,
      media: mediaTotal,
      deleted: persons.reduce((a, x) => a + x.deleted, 0),
      voice: persons.reduce((a, x) => a + x.voice, 0),
      firstTs,
      lastTs,
      spanDays: Math.max(1, Math.round((lastTs - firstTs) / DAY) + 1),
      activeDays: byDay.size,
    },
    time: {
      byHour,
      byWeekday,
      peakHour,
      nightShare: nightTotal / total,
      busiest,
      streak: { days: streak.days, start: isoFromDayNum(streak.start), end: isoFromDayNum(streak.end) },
      longestGap,
    },
    people: persons,
    awards,
    ghost,
    compatibility,
    overallMedianReplyMs: overallMedianReply,
    language: {
      malayWords,
      englishWords,
      malayShare: malayWords + englishWords ? malayWords / (malayWords + englishWords) : 0,
      rojakShare: langMsgs ? rojakMsgs / langMsgs : 0,
    },
    laugh: LAUGH_STYLES.map((s) => ({ key: s.key, label: s.label, count: laugh[s.key] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count),
    topEmoji: topN(emojiFreq, 5),
    topWords: topN(wordFreq, 5),
    persona,
    bigDay: computeBigDay(msgs, busiest.day, { avgWordsOverall: textMsgsTotal ? totalWords / textMsgsTotal : 0 }),
  };
}
