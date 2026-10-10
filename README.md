# Fit Check

A personal phone web app that judges whether a piece of clothing fits **my** body, proportions and style, recommends the right size, and finds better alternatives.

## How it works

1. **Check an item.** Paste a product link or description, or attach screenshots of the product page or size chart. Claude (via your own API key) reads the page or images, searches the web for the official size chart, and returns every size's garment measurements plus a style assessment.
2. **Fit math (no AI).** `js/fit.js` compares each size's measurements with the ideal and acceptable ranges for that category, and picks the best size. The ranges are anchored on my body measurements and my perfect-fit BTS zip hoodie (M: length 67.4, pit-to-pit 71.2, shoulder 56.6, sleeve 59.7 cm). It also compares the size side by side with clothes I own.
3. **Verdict.** 60% fit + 40% style (fabric/drape, branding, color, aesthetic, value). A hard tightness problem caps the score at 60. 88+ = Perfect, 76+ = Great, 62+ = Workable, below that = Skip.
4. **Alternatives / "Find me something."** Claude searches current retailers, pulls each candidate's size chart, and the fit math ranks them.
5. **Copy for Claude app (free, no API key).** The app copies a ready-made prompt with your profile and the item. Paste it into the Claude app with web search on, then paste Claude's reply back. The app scores it exactly like the API path, alternatives included. It uses your Claude plan's normal usage instead of API credit.
6. **Enter manually.** Type a size chart yourself. This works offline with no API key.

Everything is editable in **Profile**: body measurements, reference garments, fit log (items I've tried), shoe sizes, budgets, fit targets and the style text the AI reads. Data is stored only in the browser (localStorage). Use Export/Import for backups.

## Setup

1. Get an Anthropic API key at <https://console.anthropic.com> (it needs billing credit; consider setting a monthly spend limit).
2. Open the app → **Settings** → paste the key → **Test key**.
3. iPhone: Safari → Share → **Add to Home Screen**.

Hosting is GitHub Pages: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / root**.

## Cost

Each check runs a few web searches and page fetches. The estimated cost is shown under every result. Opus 5.5 is $4/$20 per million input/output tokens, Sonnet 5.5 is $2/$10 (switch in Settings), and web search is $10 per 1,000 searches.

## Development

There's no build step: plain ES modules plus a vendored, bundled `@anthropic-ai/sdk@0.127.0` (`vendor/`).

```
npm test          # fit-engine unit tests (Node 20+)
npm run serve     # http://localhost:8080
```

Files: `js/fit.js` (scoring), `js/profile.js` (default profile + storage), `js/prompts.js` (prompts + reply parsing, shared by both paths), `js/ai.js` (API calls), `js/app.js` (UI).
