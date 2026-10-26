# 🔒 Privacy & Safety Checklist

Chat Wrapped handles some of the most personal data people have. These are the rules, and where each one lives in the code.

| # | Rule | Status | Where |
|---|------|--------|-------|
| **A. Data never leaves the device** ||||
| 1 | All processing happens in the browser, no server | ✅ | `js/worker.js` |
| 2 | Network blocked by CSP `connect-src 'none'` | ✅ | `index.html`, `vercel.json`, `_headers` |
| 3 | No external AI / API calls | ✅ | no network code exists |
| 4 | No analytics, CDN, Google Fonts or third-party scripts | ✅ | system fonts, `script-src 'self'` |
| 5 | Works offline (user can turn off WiFi to verify) | ⚠️ | works offline once loaded; installable PWA cache planned for v2 |
| **B. Data is not stored** ||||
| 6 | No localStorage, IndexedDB or cookies | ✅ | state only in `main.js` variables |
| 7 | "Clear & Exit" wipes everything | ✅ | `clearAndExit()` in `main.js` |
| 8 | Raw text dropped right after stats are computed | ✅ | worker nulls text, then is terminated |
| **C. Code security** ||||
| 9 | No `innerHTML`; chat content rendered as text nodes only (XSS-safe) | ✅ | `el()` helper in `main.js` |
| 10 | File size limits (50 MB text, 2 GB zip) | ✅ | `LIMITS` in `filereader.js` |
| 11 | Zip: only `_chat.txt` is read; media never opened; zip-bomb guard while inflating | ✅ | `filereader.js` |
| 12 | Zero dependencies | ✅ | `package.json` |
| **D. Other people in the chat** ||||
| 13 | Stats contain numbers and labels only, never full messages | ✅ | `stats.js` + test "stats contain no raw message text" |
| 14 | Anonymize ON by default (🦊 Person A…) | ✅ | `makeNamer()` |
| 15 | Phone-number senders always masked (`+60 •••• 89`) | ✅ | `maskPhone()` |
| 16 | No detection of sensitive topics (health, politics, religion, relationships) | ✅ | by design |
| — | Participant names never shown as "Word of the Year" | ✅ | `stats.js` |
| — | Share image contains no names and no message text | ✅ | `share.js` |
| **E. Transparency** ||||
| 17 | Clear privacy promise on the landing page | ✅ | `renderLanding()` |
| 18 | Open source | ⏳ | push to GitHub |
| 19 | Consent reminder about other people's messages | ✅ | landing fine print |
| 20 | "Not affiliated with WhatsApp/Meta", no WhatsApp branding | ✅ | landing fine print, own colours |

## How to verify it yourself

1. Open DevTools → **Network** tab, then upload a chat. You'll see zero requests after the page loads.
2. Or turn off WiFi / airplane mode after the page loads. Everything still works.
3. DevTools → **Application** → Storage: nothing saved.

## Known limits

- Word of the Year is a single word from the chat. It could occasionally be something personal (a place, a nickname). It's only shown on screen, never in the share image.
- Stats are heuristic and for fun. They're not psychological assessments of anyone.
