// share.js — draws the shareable 1080×1920 PNG on a canvas.
// Safety: contains NO names and NO message text — only aggregate numbers, emoji and the persona.

const W = 1080;
const H = 1920;
const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

const THEMES = {
  't-night': ['#07061a', '#7b2cff', '#3d5afe'],
  't-yellow': ['#8a5a00', '#ffd23f', '#ff7a1a'],
  't-pink': ['#a3125c', '#ff4fa3', '#ff7a1a'],
  't-blue': ['#14206b', '#3d5afe', '#7b2cff'],
  't-orange': ['#c4410a', '#ffd23f', '#ff4fa3'],
  't-purple': ['#4a12b8', '#ff4fa3', '#3d5afe'],
  't-green': ['#0a5a2c', '#1ed760', '#ffd23f'],
};

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

function blob(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function fitText(ctx, text, maxWidth, size, weight = 900) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (ctx.measureText(text).width > maxWidth && s > 24);
}

export function renderShareCard(stats, persona) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [bg, a, b] = THEMES[persona.theme] || THEMES['t-purple'];

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  blob(ctx, W * 0.9, H * 0.08, 900, a);
  blob(ctx, W * 0.05, H * 0.95, 800, b);

  const year = new Date(stats.totals.lastTs).getFullYear();
  ctx.fillStyle = '#fff8ef';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `900 44px ${FONT}`;
  ctx.fillText(`CHAT WRAPPED ${year}`, 90, 170);
  ctx.globalAlpha = 0.75;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(stats.mode === 'duo' ? '💌 Duo' : `👥 Group · ${stats.participantCount} orang`, 90, 230);
  ctx.globalAlpha = 1;

  ctx.font = `300px ${FONT}`;
  ctx.fillText(persona.emoji, 70, 590);

  fitText(ctx, persona.name, W - 180, 104);
  ctx.fillText(persona.name, 90, 740);
  ctx.globalAlpha = 0.8;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(persona.desc, 90, 810, W - 180);
  ctx.globalAlpha = 1;

  const rows = [
    ['Mesej', stats.totals.messages.toLocaleString('en-MY')],
    ['Peak hour', hourLabel(stats.time.peakHour)],
    ['Longest streak', `${stats.time.streak.days} hari`],
    ['Top emoji', stats.topEmoji.slice(0, 3).map((e) => e.key).join(' ') || '—'],
    ['Laugh style', stats.laugh[0]?.label || '—'],
    ['Bahasa rojak', `${Math.round(stats.language.rojakShare * 100)}%`],
  ];
  if (stats.compatibility != null) rows.push(['Compatibility', `${stats.compatibility}%`]);

  let y = 960;
  for (const [label, value] of rows) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(90, y - 70, W - 180, 108, 30);
    ctx.fill();
    ctx.fillStyle = '#fff8ef';
    ctx.globalAlpha = 0.75;
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(label.toUpperCase(), 130, y);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    fitText(ctx, value, 520, 58);
    ctx.fillText(value, W - 130, y + 6);
    ctx.textAlign = 'left';
    y += 128;
  }

  ctx.globalAlpha = 0.6;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('🔒 Dikira 100% dalam device · takde nama, takde mesej', 90, H - 90, W - 180);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) =>
    canvas.toBlob((blobOut) => (blobOut ? resolve(blobOut) : reject(new Error('Gagal buat gambar'))), 'image/png'));
}
