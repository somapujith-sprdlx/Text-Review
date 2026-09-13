# Text Quality Enhancer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (MV3 + React + Vite + Tailwind) that lets a user select text on any webpage, choose a writing style in a Side Panel, and get an AI-rewritten version from a local Hono backend backed by OpenAI — no auth, no DB, no billing.

**Architecture:** Content script detects selection and shows a floating button; clicking it messages the service worker, which opens the Side Panel with the selected text. The Side Panel (React) posts to a local Hono backend at `/api/improve`, which builds a style-specific prompt and calls OpenAI through a small provider abstraction, then returns the rewritten text for Copy/Insert/Regenerate/Restore actions.

**Tech Stack:** TypeScript, React, Vite, Tailwind CSS, Chrome Extension Manifest V3, Node.js, Hono, OpenAI SDK, Vitest (backend tests).

**Spec:** `docs/superpowers/specs/2026-09-13-text-quality-enhancer-mvp-design.md`

## Global Constraints

- No auth, DB, or billing in this round (deferred per spec).
- OpenAI API key lives only in `backend/.env`, never in extension code/bundle.
- Selecting text alone must never trigger a network call — only explicit Improve/Regenerate clicks do.
- Backend CORS restricted to the extension's origin (`chrome-extension://<id>`).
- Chrome permissions limited to: `sidePanel`, `storage`, `activeTab`, `scripting`. No broad host permissions.
- Max 2 mocks per backend test; mock only the OpenAI network boundary, never the system under test (the Hono app itself).
- Text length cap: 2000 characters — longer input returns the "too long" error path, not a truncated call to OpenAI.
- 9 styles: Improve, Formal, Professional, Casual, Friendly, Concise, Clear & Simple, Grammar Fix, Custom.
- Original selected text must never be mutated until the user explicitly confirms Insert/Replace; failed requests never destroy it.

---

## File Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── improve.ts
│   │   └── styles.ts
│   ├── services/ai/
│   │   ├── provider.ts
│   │   └── prompts.ts
│   ├── middleware/
│   │   └── rateLimit.ts
│   └── index.ts
├── test/
│   ├── improve.test.ts
│   ├── styles.test.ts
│   └── rateLimit.test.ts
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts

extension/
├── src/
│   ├── content/selection.ts
│   ├── background/service-worker.ts
│   ├── sidepanel/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── StyleButton.tsx
│   │       ├── ResultPanel.tsx
│   │       └── ActionBar.tsx
│   ├── services/api.ts
│   └── types/index.ts
├── public/
│   ├── icons/ (icon16.png, icon48.png, icon128.png)
│   └── sidepanel.html
├── manifest.json
├── vite.config.ts
├── tailwind.config.js
├── package.json
└── tsconfig.json
```

---

## Task 1: Backend scaffold + `/api/styles`

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/routes/styles.ts`
- Create: `backend/src/index.ts`
- Test: `backend/test/styles.test.ts`

**Interfaces:**
- Produces: `export const STYLES: { id: string; label: string; description: string }[]` from `styles.ts` (also mounted as Hono route), `export const app` (Hono instance) from `index.ts` — later tasks mount more routes on `app` and tests import it directly.

- [ ] **Step 1: Init backend package**

```bash
mkdir -p backend/src/routes backend/src/services/ai backend/src/middleware backend/test
cd backend && npm init -y
```

Edit `backend/package.json` to:

```json
{
  "name": "text-quality-enhancer-backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "openai": "^4.68.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

```bash
cd backend && npm install
```

- [ ] **Step 2: Add tsconfig and vitest config**

`backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`backend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

`backend/.env.example`:

```
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
ALLOWED_ORIGIN=chrome-extension://your-extension-id
PORT=8787
```

- [ ] **Step 3: Write failing test for GET /api/styles**

`backend/test/styles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { app } from '../src/index.js'

describe('GET /api/styles', () => {
  it('returns the list of writing styles', async () => {
    const res = await app.request('/api/styles')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body.styles)).toBe(true)
    expect(body.styles.length).toBe(9)

    const ids = body.styles.map((s: { id: string }) => s.id)
    expect(ids).toEqual([
      'improve',
      'formal',
      'professional',
      'casual',
      'friendly',
      'concise',
      'clear-simple',
      'grammar-fix',
      'custom',
    ])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `src/index.ts` does not exist yet.

- [ ] **Step 5: Implement styles route and app entry**

`backend/src/routes/styles.ts`:

```typescript
import { Hono } from 'hono'

export const STYLES = [
  { id: 'improve', label: 'Improve', description: 'General grammar, clarity and readability' },
  { id: 'formal', label: 'Formal', description: 'Formal and respectful communication' },
  { id: 'professional', label: 'Professional', description: 'Workplace/business communication' },
  { id: 'casual', label: 'Casual', description: 'Natural conversational language' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { id: 'concise', label: 'Concise', description: 'Shorter while preserving meaning' },
  { id: 'clear-simple', label: 'Clear & Simple', description: 'Easier to understand' },
  { id: 'grammar-fix', label: 'Grammar Fix', description: 'Grammar, spelling and punctuation' },
  { id: 'custom', label: 'Custom', description: 'User-defined instructions' },
] as const

export type StyleId = (typeof STYLES)[number]['id']

export const stylesRoute = new Hono()

stylesRoute.get('/', (c) => {
  return c.json({ styles: STYLES })
})
```

`backend/src/index.ts`:

```typescript
import { Hono } from 'hono'
import { stylesRoute } from './routes/styles.js'

export const app = new Hono()

app.route('/api/styles', stylesRoute)

if (process.env.NODE_ENV !== 'test') {
  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.PORT) || 8787
  serve({ fetch: app.fetch, port })
  console.log(`Backend listening on http://localhost:${port}`)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/vitest.config.ts backend/.env.example backend/src/routes/styles.ts backend/src/index.ts backend/test/styles.test.ts
git commit -m "feat: scaffold backend with GET /api/styles"
```

---

## Task 2: AI provider abstraction + prompts

**Files:**
- Create: `backend/src/services/ai/prompts.ts`
- Create: `backend/src/services/ai/provider.ts`
- Test: `backend/test/provider.test.ts`

**Interfaces:**
- Consumes: `StyleId` from `backend/src/routes/styles.ts`.
- Produces: `export function buildPrompt(style: StyleId, text: string, customInstruction?: string): { system: string; user: string }` from `prompts.ts`; `export async function generateImprovement(input: { text: string; style: StyleId; language?: string; customInstruction?: string }): Promise<string>` from `provider.ts` — Task 3's `/api/improve` route calls this directly.

- [ ] **Step 1: Write failing test for buildPrompt**

`backend/test/provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPrompt } from '../src/services/ai/prompts.js'

describe('buildPrompt', () => {
  it('builds a formal-style prompt containing the rules and the text', () => {
    const { system, user } = buildPrompt('formal', 'hey can you extend the deadline')

    expect(system).toContain('formal')
    expect(system).toContain('Preserve the original meaning')
    expect(system).toContain('Do not invent facts')
    expect(user).toContain('hey can you extend the deadline')
  })

  it('includes the custom instruction for the custom style', () => {
    const { system } = buildPrompt('custom', 'some text', 'Make this sound like a LinkedIn post')
    expect(system).toContain('Make this sound like a LinkedIn post')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `prompts.ts` does not exist.

- [ ] **Step 3: Implement prompts.ts**

`backend/src/services/ai/prompts.ts`:

```typescript
import type { StyleId } from '../../routes/styles.js'

const STYLE_INSTRUCTIONS: Record<StyleId, string> = {
  improve: 'Rewrite the text to improve grammar, clarity and readability, without changing its tone.',
  formal: 'Rewrite the text in a formal tone.',
  professional: 'Rewrite the text for workplace/business communication.',
  casual: 'Rewrite the text in a natural, conversational tone.',
  friendly: 'Rewrite the text to sound warm and approachable.',
  concise: 'Rewrite the text to be shorter while preserving its full meaning.',
  'clear-simple': 'Rewrite the text to be as easy to understand as possible.',
  'grammar-fix': 'Fix grammar, spelling and punctuation only. Do not change tone or wording beyond what is needed for correctness.',
  custom: 'Rewrite the text according to the custom instruction provided below.',
}

const BASE_RULES = `RULES:
1. Preserve the original meaning.
2. Do not invent facts.
3. Do not add unsupported claims.
4. Correct grammar and spelling.
5. Keep important names, numbers and URLs unchanged.
6. Return only the rewritten text, with no preamble or explanation.`

export function buildPrompt(
  style: StyleId,
  text: string,
  customInstruction?: string,
): { system: string; user: string } {
  const task = STYLE_INSTRUCTIONS[style]
  const customBlock =
    style === 'custom' && customInstruction
      ? `\n\nCUSTOM INSTRUCTION:\n${customInstruction}`
      : ''

  const system = `You are a professional writing assistant.

TASK:
${task}${customBlock}

${BASE_RULES}`

  const user = text

  return { system, user }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS (both provider.test.ts cases)

- [ ] **Step 5: Write failing test for generateImprovement (mocks OpenAI boundary only)**

Add to `backend/test/provider.test.ts`:

```typescript
vi.mock('openai', () => {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Dear Sir, I would like to request an extension.' } }],
  })
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
  }
})

describe('generateImprovement', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
  })

  it('returns the rewritten text from the OpenAI response', async () => {
    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const result = await generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(result).toBe('Dear Sir, I would like to request an extension.')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `provider.ts` does not exist.

- [ ] **Step 7: Implement provider.ts**

`backend/src/services/ai/provider.ts`:

```typescript
import OpenAI from 'openai'
import { buildPrompt } from './prompts.js'
import type { StyleId } from '../../routes/styles.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction)
  const openai = getClient()

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }
  return content.trim()
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/ai/prompts.ts backend/src/services/ai/provider.ts backend/test/provider.test.ts
git commit -m "feat: add AI provider abstraction with per-style prompts"
```

---

## Task 3: Rate limit middleware

**Files:**
- Create: `backend/src/middleware/rateLimit.ts`
- Test: `backend/test/rateLimit.test.ts`

**Interfaces:**
- Produces: `export function rateLimit(opts: { limit: number; windowMs: number }): (c: Context, next: Next) => Promise<Response | void>` (Hono middleware factory) — Task 4 mounts this on `/api/improve`.

- [ ] **Step 1: Write failing test**

`backend/test/rateLimit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from '../src/middleware/rateLimit.js'

function buildApp() {
  const app = new Hono()
  app.use('/limited', rateLimit({ limit: 2, windowMs: 60_000 }))
  app.get('/limited', (c) => c.json({ ok: true }))
  return app
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', async () => {
    const app = buildApp()
    const res1 = await app.request('/limited', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    const res2 = await app.request('/limited', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('blocks requests over the limit with 429', async () => {
    const app = buildApp()
    const ip = '2.2.2.2'
    await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    const res3 = await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    expect(res3.status).toBe(429)
  })

  it('tracks separate IPs independently', async () => {
    const app = buildApp()
    await app.request('/limited', { headers: { 'x-forwarded-for': '3.3.3.3' } })
    await app.request('/limited', { headers: { 'x-forwarded-for': '3.3.3.3' } })
    const resOtherIp = await app.request('/limited', { headers: { 'x-forwarded-for': '4.4.4.4' } })
    expect(resOtherIp.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `rateLimit.ts` does not exist.

- [ ] **Step 3: Implement rateLimit.ts**

`backend/src/middleware/rateLimit.ts`:

```typescript
import type { Context, Next } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

export function rateLimit(opts: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>()

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const bucket = buckets.get(ip)

    if (!bucket || bucket.resetAt < now) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs })
      await next()
      return
    }

    if (bucket.count >= opts.limit) {
      return c.json({ error: "You've reached your current usage limit." }, 429)
    }

    bucket.count += 1
    await next()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/rateLimit.ts backend/test/rateLimit.test.ts
git commit -m "feat: add in-memory per-IP rate limit middleware"
```

---

## Task 4: `/api/improve` route + CORS + error paths

**Files:**
- Create: `backend/src/routes/improve.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/improve.test.ts`

**Interfaces:**
- Consumes: `generateImprovement` from `services/ai/provider.ts`, `rateLimit` from `middleware/rateLimit.ts`, `STYLES`/`StyleId` from `routes/styles.ts`.
- Produces: mounts `improveRoute` at `/api/improve` on the exported `app`.

- [ ] **Step 1: Write failing tests covering success + all error paths**

`backend/test/improve.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/services/ai/provider.js', () => ({
  generateImprovement: vi.fn(),
}))

import { app } from '../src/index.js'
import { generateImprovement } from '../src/services/ai/provider.js'

const mockedGenerate = vi.mocked(generateImprovement)

function post(body: unknown, origin = 'chrome-extension://test-ext-id') {
  return app.request('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}

describe('POST /api/improve', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
    process.env.ALLOWED_ORIGIN = 'chrome-extension://test-ext-id'
  })

  it('returns the improved text on success', async () => {
    mockedGenerate.mockResolvedValue('Dear Sir, I would like to request an extension.')

    const res = await post({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.outputText).toBe('Dear Sir, I would like to request an extension.')
    expect(body.style).toBe('formal')
    expect(typeof body.requestId).toBe('string')
  })

  it('rejects text longer than 2000 characters', async () => {
    const longText = 'a'.repeat(2001)
    const res = await post({ text: longText, style: 'formal' })
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toContain('too long')
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('rejects an unknown style', async () => {
    const res = await post({ text: 'hello', style: 'not-a-style' })
    expect(res.status).toBe(400)
  })

  it('rejects empty text', async () => {
    const res = await post({ text: '', style: 'formal' })
    expect(res.status).toBe(400)
  })

  it('returns a generic error when the AI call fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('upstream boom'))

    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(502)

    const body = await res.json()
    expect(body.error).toBe('Something went wrong. Try again.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `/api/improve` route not mounted yet.

- [ ] **Step 3: Implement improve.ts**

`backend/src/routes/improve.ts`:

```typescript
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { generateImprovement } from '../services/ai/provider.js'
import { STYLES, type StyleId } from './styles.js'

const VALID_STYLE_IDS = new Set(STYLES.map((s) => s.id))
const MAX_TEXT_LENGTH = 2000

export const improveRoute = new Hono()

improveRoute.post('/', async (c) => {
  let payload: { text?: unknown; style?: unknown; language?: unknown; customInstruction?: unknown }

  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  const { text, style, language, customInstruction } = payload

  if (typeof text !== 'string' || text.trim().length === 0) {
    return c.json({ error: 'Text is required.' }, 400)
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return c.json(
      { error: 'This text is too long. Please shorten it or split it into smaller sections.' },
      400,
    )
  }

  if (typeof style !== 'string' || !VALID_STYLE_IDS.has(style as StyleId)) {
    return c.json({ error: 'Unknown style.' }, 400)
  }

  try {
    const outputText = await generateImprovement({
      text,
      style: style as StyleId,
      language: typeof language === 'string' ? language : undefined,
      customInstruction: typeof customInstruction === 'string' ? customInstruction : undefined,
    })

    return c.json({
      requestId: randomUUID(),
      style,
      outputText,
    })
  } catch {
    return c.json({ error: 'Something went wrong. Try again.' }, 502)
  }
})
```

- [ ] **Step 4: Wire route + CORS into index.ts**

Replace `backend/src/index.ts` with:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stylesRoute } from './routes/styles.js'
import { improveRoute } from './routes/improve.js'
import { rateLimit } from './middleware/rateLimit.js'

export const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) => (origin === process.env.ALLOWED_ORIGIN ? origin : ''),
  }),
)

app.use('/api/improve', rateLimit({ limit: 20, windowMs: 60_000 }))

app.route('/api/styles', stylesRoute)
app.route('/api/improve', improveRoute)

if (process.env.NODE_ENV !== 'test') {
  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.PORT) || 8787
  serve({ fetch: app.fetch, port })
  console.log(`Backend listening on http://localhost:${port}`)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && NODE_ENV=test npm test`
Expected: PASS — all improve.test.ts cases plus previous tasks' tests still green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/improve.ts backend/src/index.ts backend/test/improve.test.ts
git commit -m "feat: add POST /api/improve with validation, rate limit, and CORS"
```

---

## Task 5: Extension scaffold (manifest, Vite, Tailwind, types)

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/tailwind.config.js`
- Create: `extension/postcss.config.js`
- Create: `extension/manifest.json`
- Create: `extension/src/types/index.ts`
- Create: `extension/public/sidepanel.html`
- Create: `extension/public/icons/icon16.png`, `icon48.png`, `icon128.png` (placeholder)

**Interfaces:**
- Produces: `export interface ImproveRequest { text: string; style: string; language?: string; customInstruction?: string }`, `export interface ImproveResponse { requestId: string; style: string; outputText: string }`, `export interface StyleOption { id: string; label: string; description: string }` from `types/index.ts` — consumed by `services/api.ts` (Task 6) and all Side Panel components (Task 8).

- [ ] **Step 1: Init extension package**

```bash
mkdir -p extension/src/content extension/src/background extension/src/sidepanel/components extension/src/services extension/src/types extension/public/icons
cd extension && npm init -y
```

Edit `extension/package.json`:

```json
{
  "name": "text-quality-enhancer-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.280",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

```bash
cd extension && npm install
```

- [ ] **Step 2: Add build/tooling config files**

`extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["src"]
}
```

`extension/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'public/sidepanel.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/selection.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
```

`extension/tailwind.config.js`:

```javascript
export default {
  content: ['./src/**/*.{ts,tsx}', './public/**/*.html'],
  theme: { extend: {} },
  plugins: [],
}
```

`extension/postcss.config.js`:

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 3: Add manifest.json**

`extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Text Quality Enhancer",
  "version": "0.1.0",
  "description": "Improve selected text on any webpage using AI-powered writing styles.",
  "permissions": ["sidePanel", "storage", "activeTab", "scripting"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content.js"]
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 4: Add shared types**

`extension/src/types/index.ts`:

```typescript
export interface StyleOption {
  id: string
  label: string
  description: string
}

export interface ImproveRequest {
  text: string
  style: string
  language?: string
  customInstruction?: string
}

export interface ImproveResponse {
  requestId: string
  style: string
  outputText: string
}

export interface ImproveErrorResponse {
  error: string
}

export interface SelectionMessage {
  type: 'OPEN_SIDE_PANEL_WITH_SELECTION'
  text: string
}
```

- [ ] **Step 5: Add sidepanel.html shell**

`extension/public/sidepanel.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Text Quality Enhancer</title>
    <link rel="stylesheet" href="/src/sidepanel/styles/index.css" />
  </head>
  <body class="w-full min-h-screen bg-white text-gray-900">
    <div id="root"></div>
    <script type="module" src="/src/sidepanel/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Add placeholder icons**

Generate three flat placeholder PNGs (any solid-color square) at `extension/public/icons/icon16.png`, `icon48.png`, `icon128.png` — swap for real branding later. Use ImageMagick if available, otherwise copy any existing small PNG as a stand-in:

```bash
cd extension/public/icons
if command -v convert >/dev/null 2>&1; then
  convert -size 16x16 xc:'#4F46E5' icon16.png
  convert -size 48x48 xc:'#4F46E5' icon48.png
  convert -size 128x128 xc:'#4F46E5' icon128.png
else
  echo "ImageMagick not found — add real icon16.png, icon48.png, icon128.png manually before loading the extension."
fi
```

- [ ] **Step 7: Commit**

```bash
git add extension/package.json extension/package-lock.json extension/tsconfig.json extension/vite.config.ts extension/tailwind.config.js extension/postcss.config.js extension/manifest.json extension/src/types/index.ts extension/public/sidepanel.html extension/public/icons
git commit -m "feat: scaffold extension with manifest, vite, tailwind, shared types"
```

---

## Task 6: API service client

**Files:**
- Create: `extension/src/services/api.ts`

**Interfaces:**
- Consumes: `ImproveRequest`, `ImproveResponse`, `StyleOption` from `types/index.ts`.
- Produces: `export async function fetchStyles(): Promise<StyleOption[]>`, `export async function improveText(req: ImproveRequest): Promise<ImproveResponse>` (throws `Error` with a user-facing message on failure) — consumed by Side Panel components in Task 8.

No backend running in the extension's own test suite (no test harness for extension code in this round, per spec) — verify this file's logic through the manual browser check in Task 9. Keep it small and dependency-free so behavior is obvious by inspection.

- [ ] **Step 1: Implement api.ts**

`extension/src/services/api.ts`:

```typescript
import type { ImproveRequest, ImproveResponse, ImproveErrorResponse, StyleOption } from '../types/index.js'

const BASE_URL = 'http://localhost:8787'

export async function fetchStyles(): Promise<StyleOption[]> {
  const res = await fetch(`${BASE_URL}/api/styles`)
  if (!res.ok) {
    throw new Error('Something went wrong. Try again.')
  }
  const body = (await res.json()) as { styles: StyleOption[] }
  return body.styles
}

export async function improveText(req: ImproveRequest): Promise<ImproveResponse> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new Error('Something went wrong. Try again.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ImproveErrorResponse | null
    throw new Error(body?.error || 'Something went wrong. Try again.')
  }

  return (await res.json()) as ImproveResponse
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/services/api.ts
git commit -m "feat: add extension API client for styles and improve endpoints"
```

---

## Task 7: Content script (selection detection) + service worker

**Files:**
- Create: `extension/src/content/selection.ts`
- Create: `extension/src/background/service-worker.ts`

**Interfaces:**
- Produces: content script sends `chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL_WITH_SELECTION', text })`; service worker listens for that message type and stores the text via `chrome.storage.session` under key `pendingSelection`, then calls `chrome.sidePanel.open`. Task 8's Side Panel reads `chrome.storage.session.get('pendingSelection')` on mount.

- [ ] **Step 1: Implement content script**

`extension/src/content/selection.ts`:

```typescript
let floatingButton: HTMLButtonElement | null = null

function removeFloatingButton() {
  floatingButton?.remove()
  floatingButton = null
}

function showFloatingButton(selectionText: string, rect: DOMRect) {
  removeFloatingButton()

  const button = document.createElement('button')
  button.textContent = '✨ Improve Text'
  button.style.position = 'fixed'
  button.style.top = `${Math.max(rect.top - 36, 4)}px`
  button.style.left = `${rect.left}px`
  button.style.zIndex = '2147483647'
  button.style.padding = '6px 10px'
  button.style.borderRadius = '6px'
  button.style.border = 'none'
  button.style.background = '#4F46E5'
  button.style.color = '#fff'
  button.style.fontSize = '13px'
  button.style.cursor = 'pointer'
  button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'

  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL_WITH_SELECTION', text: selectionText })
    removeFloatingButton()
  })

  document.body.appendChild(button)
  floatingButton = button
}

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''

  if (!text) {
    removeFloatingButton()
    return
  }

  const range = selection?.getRangeAt(0)
  const rect = range?.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    removeFloatingButton()
    return
  }

  showFloatingButton(text, rect)
})

document.addEventListener('mousedown', (e) => {
  if (e.target !== floatingButton) {
    removeFloatingButton()
  }
})
```

- [ ] **Step 2: Implement service worker**

`extension/src/background/service-worker.ts`:

```typescript
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'OPEN_SIDE_PANEL_WITH_SELECTION') {
    return
  }

  const tabId = sender.tab?.id
  if (tabId === undefined) {
    return
  }

  chrome.storage.session.set({ pendingSelection: message.text }).then(() => {
    chrome.sidePanel.open({ tabId })
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/selection.ts extension/src/background/service-worker.ts
git commit -m "feat: add content script selection detection and service worker routing"
```

---

## Task 8: Side Panel React UI

**Files:**
- Create: `extension/src/sidepanel/main.tsx`
- Create: `extension/src/sidepanel/App.tsx`
- Create: `extension/src/sidepanel/components/StyleButton.tsx`
- Create: `extension/src/sidepanel/components/ResultPanel.tsx`
- Create: `extension/src/sidepanel/components/ActionBar.tsx`
- Create: `extension/src/sidepanel/styles/index.css`

**Interfaces:**
- Consumes: `fetchStyles`, `improveText` from `services/api.ts`; `StyleOption`, `ImproveResponse` from `types/index.ts`.
- Produces: fully wired Side Panel app — no further tasks consume this directly; it's the top of the extension's UI tree.

- [ ] **Step 1: Tailwind entry CSS**

`extension/src/sidepanel/styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: StyleButton component**

`extension/src/sidepanel/components/StyleButton.tsx`:

```tsx
import type { StyleOption } from '../../types/index.js'

interface Props {
  style: StyleOption
  active: boolean
  onSelect: (id: string) => void
}

export function StyleButton({ style, active, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(style.id)}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      title={style.description}
    >
      {style.label}
    </button>
  )
}
```

- [ ] **Step 3: ResultPanel component**

`extension/src/sidepanel/components/ResultPanel.tsx`:

```tsx
interface Props {
  outputText: string
  onEdit: (value: string) => void
}

export function ResultPanel({ outputText, onEdit }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Improved Text</label>
      <textarea
        className="w-full min-h-[120px] rounded-md border border-gray-300 p-2 text-sm"
        value={outputText}
        onChange={(e) => onEdit(e.target.value)}
      />
    </div>
  )
}
```

- [ ] **Step 4: ActionBar component**

`extension/src/sidepanel/components/ActionBar.tsx`:

```tsx
interface Props {
  hasResult: boolean
  onCopy: () => void
  onInsert: () => void
  onRegenerate: () => void
  onRestore: () => void
}

export function ActionBar({ hasResult, onCopy, onInsert, onRegenerate, onRestore }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      <button
        disabled={!hasResult}
        onClick={onCopy}
        className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm disabled:opacity-40"
      >
        Copy
      </button>
      <button
        disabled={!hasResult}
        onClick={onInsert}
        className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-40"
      >
        Insert / Replace
      </button>
      <button
        disabled={!hasResult}
        onClick={onRegenerate}
        className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-40"
      >
        Regenerate
      </button>
      <button onClick={onRestore} className="px-3 py-2 rounded-md border border-gray-300 text-sm">
        Restore Original
      </button>
    </div>
  )
}
```

- [ ] **Step 5: App.tsx — main state machine**

`extension/src/sidepanel/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchStyles, improveText } from '../services/api.js'
import type { StyleOption } from '../types/index.js'
import { StyleButton } from './components/StyleButton.js'
import { ResultPanel } from './components/ResultPanel.js'
import { ActionBar } from './components/ActionBar.js'

export function App() {
  const [originalText, setOriginalText] = useState('')
  const [editableText, setEditableText] = useState('')
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string>('improve')
  const [customInstruction, setCustomInstruction] = useState('')
  const [outputText, setOutputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStyles()
      .then(setStyles)
      .catch(() => setError('Something went wrong. Try again.'))

    chrome.storage.session.get('pendingSelection').then((result) => {
      const text = typeof result.pendingSelection === 'string' ? result.pendingSelection : ''
      setOriginalText(text)
      setEditableText(text)
    })
  }, [])

  async function runImprove() {
    setLoading(true)
    setError(null)
    try {
      const result = await improveText({
        text: editableText,
        style: selectedStyle,
        customInstruction: selectedStyle === 'custom' ? customInstruction : undefined,
      })
      setOutputText(result.outputText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(outputText)
  }

  function handleInsert() {
    navigator.clipboard.writeText(outputText)
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text: string) => {
          const active = document.activeElement as HTMLElement | null
          if (
            active &&
            (active.tagName === 'TEXTAREA' ||
              (active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'text'))
          ) {
            ;(active as HTMLTextAreaElement | HTMLInputElement).value = text
            active.dispatchEvent(new Event('input', { bubbles: true }))
            return
          }
          if (active && active.isContentEditable) {
            active.textContent = text
            active.dispatchEvent(new Event('input', { bubbles: true }))
            return
          }
          navigator.clipboard.writeText(text)
        },
        args: [outputText],
      })
    })
  }

  function handleRestore() {
    setEditableText(originalText)
    setOutputText('')
    setError(null)
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold mb-3">✨ Text Enhancer</h1>

      <label className="block text-xs font-medium text-gray-500 mb-1">Selected Text</label>
      <textarea
        className="w-full min-h-[80px] rounded-md border border-gray-300 p-2 text-sm mb-3"
        value={editableText}
        onChange={(e) => setEditableText(e.target.value)}
      />

      <label className="block text-xs font-medium text-gray-500 mb-1">Quick Styles</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {styles.map((s) => (
          <StyleButton key={s.id} style={s} active={selectedStyle === s.id} onSelect={setSelectedStyle} />
        ))}
      </div>

      {selectedStyle === 'custom' && (
        <input
          className="w-full rounded-md border border-gray-300 p-2 text-sm mb-3"
          placeholder="e.g. Make this sound like a LinkedIn post"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
        />
      )}

      <button
        onClick={runImprove}
        disabled={loading || editableText.trim().length === 0}
        className="w-full py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 mb-3"
      >
        {loading ? 'Improving your text...' : 'Generate'}
      </button>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {outputText && <ResultPanel outputText={outputText} onEdit={setOutputText} />}

      <ActionBar
        hasResult={outputText.length > 0}
        onCopy={handleCopy}
        onInsert={handleInsert}
        onRegenerate={runImprove}
        onRestore={handleRestore}
      />
    </div>
  )
}
```

- [ ] **Step 6: main.tsx entry point**

`extension/src/sidepanel/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/index.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
```

- [ ] **Step 7: Commit**

```bash
git add extension/src/sidepanel
git commit -m "feat: build side panel UI with style selection and result actions"
```

---

## Task 9: End-to-end manual verification

**Files:** none created — verification only, per spec's documented testing limitation (no automated DOM harness for content-script-on-webpage interaction in this round).

- [ ] **Step 1: Start backend**

```bash
cd backend
cp .env.example .env
# edit .env: set a real OPENAI_API_KEY, leave ALLOWED_ORIGIN as-is for now
npm run dev
```

Expected: console prints `Backend listening on http://localhost:8787`.

- [ ] **Step 2: Build extension**

```bash
cd extension
npm run build
```

Expected: `extension/dist/` contains `sidepanel.html`, `sidepanel.js`, `content.js`, `service-worker.js`, `manifest.json`, `icons/`.

Note: Vite's default build only copies `public/` and processes the rollup inputs — confirm `manifest.json` is copied into `dist/` (add it to `public/` if the build doesn't place it there, since MV3 requires `manifest.json` at the extension root).

- [ ] **Step 3: Load unpacked in Chrome**

Open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select `extension/dist`. Copy the generated extension ID.

- [ ] **Step 4: Set ALLOWED_ORIGIN and restart backend**

Edit `backend/.env`: `ALLOWED_ORIGIN=chrome-extension://<the-id-from-step-3>`. Restart `npm run dev`.

- [ ] **Step 5: Test on a page with a `<textarea>`**

Open any page with a `<textarea>` (e.g. a Gmail compose box or a local test HTML file). Select some text inside it. Confirm:
- Floating "✨ Improve Text" button appears near the selection.
- Selecting text alone produces no network request (check DevTools Network tab — no calls to localhost:8787 until you click something).
- Clicking the button opens the Side Panel with the selected text pre-filled.
- Choosing "Formal" and clicking Generate shows a loading state, then a result.
- Insert/Replace writes the result back into the textarea.
- Restore Original brings back the original text.

- [ ] **Step 6: Test on `<input>` and `contenteditable`**

Repeat the same flow on a plain `<input type="text">` and on a `contenteditable` div (e.g. a rich text editor). Confirm Insert/Replace works on both.

- [ ] **Step 7: Test unsupported page fallback**

Select text in an element that is not `<textarea>`/`<input>`/`contenteditable` (e.g. a plain paragraph). Confirm clicking Insert/Replace falls back to copying to clipboard without erroring.

- [ ] **Step 8: Test error paths**

Stop the backend, click Generate again — confirm the "Something went wrong. Try again." message appears and the original text is untouched. Restart the backend before continuing.

- [ ] **Step 9: Record the connectivity trace**

Confirm and note down:

```
ENTRY: content script (selection.ts) selectionchange listener
ROUTE: chrome.runtime message -> service-worker.ts -> chrome.sidePanel.open
HANDLER: sidepanel/App.tsx runImprove()
SERVICE: extension/src/services/api.ts improveText() -> backend POST /api/improve
STORAGE: none (no DB this round)
TEST: manual verification steps 5-8 above
RESULT: [paste actual observed behavior for each step]
```

- [ ] **Step 10: Commit any fixes found during manual testing**

If any bugs were found and fixed during this task, commit them individually with descriptive messages before considering the MVP done.

---

## Self-Review Notes

- **Spec coverage:** floating button (Task 7), Side Panel (Task 8), style selection incl. Custom (Task 8), AI transformation + all 9 styles (Task 2/4), Copy/Insert/Regenerate/Restore/Edit (Task 8), loading state (Task 8), error handling for API/rate-limit/too-long/unsupported-page (Tasks 3-4, 9), rate limiting (Task 3), CORS/privacy/no-key-in-extension (Task 4), minimal permissions (Task 5) — all covered.
- **Deferred items** (auth, DB, `/api/me`, `/api/feedback`, billing, analytics, monitoring, Web Store publishing) intentionally excluded per spec; not tracked as gaps here.
- **Type consistency:** `StyleId` defined once in `routes/styles.ts`, reused in `prompts.ts`, `provider.ts`, `improve.ts`. `ImproveRequest`/`ImproveResponse`/`StyleOption` defined once in extension `types/index.ts`, reused in `services/api.ts` and all sidepanel components.
