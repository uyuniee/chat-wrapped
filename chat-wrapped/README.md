# 🎁 Chat Wrapped

Spotify-Wrapped-style stats for your WhatsApp chats — **100% on-device**. Your chat never leaves your browser.

Upload a WhatsApp export (`.txt` or `.zip`) and get a story of animated cards: peak hour, busiest day, longest streak, who starts and who kills conversations, reply speed, laugh fingerprint, Bahasa Rojak Score, top emoji, word of the year, special awards, duo compatibility or group leaderboard, and a final chat persona with a shareable PNG (no names on it).

## Run it locally

No install, no build, no dependencies.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

(Opening `index.html` directly with `file://` won't work, because browsers block module scripts and Web Workers there. Any static server is fine, e.g. VS Code Live Server.)

Try it with the fictional sample chats in `sample/`.

## Tests

```bash
node test/make-sample.mjs   # regenerate fictional sample chats
node test/run-tests.mjs     # parser, stats, zip reader, privacy checks (Node 20+)
```

## Deploy

It's a static site. Push to GitHub and enable **GitHub Pages**, or import into **Vercel / Netlify / Cloudflare Pages**. `vercel.json` and `_headers` add the security headers on those hosts; on GitHub Pages the `<meta>` CSP in `index.html` still applies.

## Project structure

```
index.html          page shell + Content-Security-Policy
css/style.css       all styling (system fonts only)
js/main.js          UI: landing, story cards, anonymize, Clear & Exit
js/worker.js        Web Worker: read → parse → stats, then drops raw text
js/filereader.js    .txt / .zip reader (native DecompressionStream, zip-bomb guard)
js/parser.js        WhatsApp export parser (Android + iOS, DD/MM + MM/DD, 12h/24h)
js/stats.js         every insight, single pass, returns numbers only
js/lexicon.js       small BM / English word lists, laugh styles
js/share.js         1080×1920 share card (canvas), no names, no messages
test/               fictional sample generator + tests
```

## Privacy

See [PRIVACY.md](PRIVACY.md) for the full safety checklist and how each point is enforced in code.

*Fun project. Not affiliated with WhatsApp or Meta.*
