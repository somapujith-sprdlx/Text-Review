# Text Quality Enhancer — MVP Design

**Date:** 2026-09-13
**Status:** Approved
**Scope:** Sub-project 1 of the full PRD — Chrome extension + local backend + AI, no auth/DB/billing.

Source PRD: `Text_Quality_Enhancer_Chrome_Extension_PRD.md`

## Goal

User selects text on any webpage, clicks "Improve Text," picks a writing style in a Chrome Side Panel, gets an AI-rewritten version, and can copy or replace the original. No accounts, no persistence, no payments — those are separate future sub-projects.

## Explicit non-goals for this round

- Authentication (Clerk/Supabase) — deferred
- PostgreSQL + Drizzle, usage tracking, `/api/me`, `/api/feedback` — deferred
- Stripe billing — deferred
- Analytics (PostHog), error monitoring (Sentry) — deferred
- Chrome Web Store packaging/publishing, Cloudflare Workers deploy — deferred
- Additional styles beyond the MVP set (Academic, Persuasive, Confident, Creative) — deferred, cheap to add later since each is just a prompt template

## Architecture

```
Content Script (selection.ts)
  -> detects text selection, shows floating "Improve Text" button
  -> on click: chrome.runtime.sendMessage -> Service Worker
  -> Service Worker opens Side Panel, forwards selected text + page context

Side Panel (React, sidepanel/App.tsx)
  -> shows selected text (editable), style buttons
  -> POST http://localhost:<PORT>/api/improve { text, style, language, customInstruction? }
  -> shows loading state, then result
  -> Copy / Insert-Replace / Regenerate / Try Another Style / Restore / Edit

Backend (Hono, Node, backend/)
  -> routes/improve.ts -> services/ai/provider.ts -> OpenAI
  -> routes/styles.ts -> static style list
  -> middleware/rateLimit.ts -> in-memory token bucket per IP
```

## Components

### extension/

```
extension/
├── src/
│   ├── content/selection.ts       — selection detection, floating button injection
│   ├── background/service-worker.ts — message routing, side panel open
│   ├── sidepanel/
│   │   ├── App.tsx
│   │   ├── components/            — StyleButton, ResultPanel, ActionBar, LoadingState
│   │   └── styles/                — Tailwind entry
│   ├── services/api.ts            — fetch wrapper to backend
│   └── types/index.ts             — shared types (Style, ImproveRequest, ImproveResponse)
├── public/icons/
├── manifest.json                  — MV3, permissions: sidePanel, storage, activeTab, scripting
├── vite.config.ts
└── package.json
```

Text replacement targets: `<textarea>`, `<input>`, `contenteditable`. Anywhere else: fallback "Copy text instead" banner, per PRD sec 31.

### backend/

```
backend/
├── src/
│   ├── routes/
│   │   ├── improve.ts             — POST /api/improve
│   │   └── styles.ts              — GET /api/styles
│   ├── services/
│   │   └── ai/
│   │       ├── provider.ts        — generateImprovement({text, style, language, customInstruction})
│   │       └── prompts.ts         — per-style system prompt templates
│   ├── middleware/
│   │   └── rateLimit.ts           — in-memory IP-based token bucket
│   └── index.ts                   — Hono app, CORS locked to extension origin
└── package.json
```

`/api/me` and `/api/feedback` from the full PRD are dropped for this round (they need DB/auth).

## AI layer

`generateImprovement({ text, style, language, customInstruction })` is the only entry point routes call. Internally it builds a prompt from `prompts.ts` (per PRD sec 27 template: preserve meaning, no invented facts, keep names/numbers/URLs, correct grammar, return only rewritten text) and calls OpenAI (`gpt-4o-mini` by default, configurable via env var). Interface is shaped so a second provider could be added later without changing route code, but only OpenAI is implemented now.

Styles (9 total): Improve, Formal, Professional, Casual, Friendly, Concise, Clear & Simple, Grammar Fix, Custom.

## Data flow example

1. User selects `"hey sir i wanted to ask..."` on a webpage.
2. Floating button appears near selection.
3. Click -> service worker opens side panel with text pre-filled.
4. User picks "Formal".
5. Side panel POSTs to backend.
6. Backend builds Formal prompt + calls OpenAI.
7. Response returned, shown in side panel with Copy/Insert/Regenerate/Restore actions.

## Error handling (PRD sec 31)

- API/network error -> "Something went wrong. Try again." + Retry + Restore Original.
- Rate limit hit -> "You've reached your current usage limit."
- Text too long (cap ~2000 chars) -> "This text is too long. Please shorten it or split it into smaller sections."
- Unsupported page / element for replace -> "Text replacement isn't supported on this page. You can copy the improved text instead."
- Original text is never mutated until user explicitly confirms Insert/Replace; failed requests never destroy it.

## Security / privacy

- OpenAI API key lives only in backend `.env`, never shipped to the extension bundle.
- Selecting text alone triggers no network call — only clicking Improve/Regenerate does.
- Backend CORS restricted to the extension's origin (`chrome-extension://<id>`).
- No raw text logged; console/error logs redact text content.
- Minimal permissions: `sidePanel`, `storage`, `activeTab`, `scripting`. No broad host permissions.

## Testing approach

- **Backend:** integration tests against the real Hono app instance (supertest-style fetch calls). Mock only the OpenAI network boundary (max 1 mock per test, well under the 2-mock cap). Cover: successful improve, each error path (rate limit, too-long text, upstream failure), CORS rejection of non-extension origin.
- **Extension:** no automated DOM harness for content-script-on-arbitrary-webpage interaction in this round — verified manually in a real Chrome load-unpacked session against a test page with a `<textarea>`, an `<input>`, and a `contenteditable` div, plus one unsupported page case. This limitation is called out explicitly rather than skipped silently.

## Acceptance criteria (subset of PRD sec 37 applicable to this round)

- Select text on a supported page -> Improve Text button appears.
- Click -> Side Panel opens with selected text visible.
- Choose a style -> backend called -> result shown.
- Copy, Edit, Regenerate, Restore Original all work.
- Switching styles does not require re-entering original text.
- Failed requests preserve original text.
- Selecting text alone never triggers a network call.
- OpenAI key never appears in extension code/bundle.
- Unsupported replace targets show copy fallback.
