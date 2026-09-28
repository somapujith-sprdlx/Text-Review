import { useEffect, useState } from 'react'

// Fresh-install onboarding tab. Opened once by the service worker via
// chrome.runtime.onInstalled (reason === 'install'); see
// src/background/service-worker.ts. Fully self-contained — no shared state
// with the side panel. The guided tour that continues onboarding lives in
// the side panel itself (Tour.tsx) and triggers on its own once the panel
// opens (App.tsx checks onboardingCompleted on mount) — this page's only
// job is to open that panel for them, so they see it exists at all.

function App() {
  // Fetched once on mount (not awaited inside the click handler) so
  // Continue can call chrome.sidePanel.open() synchronously within the
  // click's user gesture — an await first would make it silently no-op,
  // same constraint already documented in service-worker.ts.
  const [tabId, setTabId] = useState<number | undefined>(undefined)
  const [done, setDone] = useState(false)

  useEffect(() => {
    chrome.tabs.getCurrent().then((tab) => setTabId(tab?.id))
  }, [])

  function handleContinue() {
    // No API tells an extension when a user actually clicks the pin icon —
    // this is the closest real signal (they've seen the instructions and
    // moved on), so it's what triggers the side panel opening.
    if (tabId !== undefined) {
      chrome.sidePanel.open({ tabId }).catch(() => {})
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-racing-50 px-6 py-10">
        <div className="w-full max-w-xl rounded-xl border border-racing-900/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-racing-900">You&rsquo;re all set 🎉</h1>
          <p className="mt-2 text-sm leading-relaxed text-racing-800/85">
            The Lipi panel just opened alongside this tab — that&rsquo;s where your quick tour continues. You can
            close this tab any time.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-racing-50 px-6 py-10">
      <div className="w-full max-w-xl rounded-xl border border-racing-900/10 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-racing-900">Welcome to Lipi 👋</h1>
        <p className="mt-2 text-sm leading-relaxed text-racing-800/85">
          Lipi lives in your browser toolbar, ready to clean up any text you select. Pin it so it&rsquo;s
          always one click away — otherwise it hides behind the puzzle-piece menu with your other
          extensions.
        </p>

        <ToolbarIllustration />

        <button
          type="button"
          onClick={handleContinue}
          className="mt-8 w-full rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// A mockup of a Chrome toolbar — not a live overlay on the real browser
// chrome (extensions can't draw on that). Shows where the puzzle-piece
// extensions menu lives, and what pinning Lipi from that menu looks like.
function ToolbarIllustration() {
  return (
    <div className="mt-6 rounded-xl border border-racing-900/10 bg-racing-50 p-5">
      {/* Step 1: the browser toolbar, with the extensions ("puzzle-piece") icon highlighted */}
      <div className="flex items-center gap-2 rounded-lg bg-racing-950 px-3 py-2.5 shadow-sm">
        <span className="h-6 flex-1 rounded-full bg-white/10" aria-hidden="true" />
        <GenericIconSlot />
        <GenericIconSlot />
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 ring-2 ring-brass ring-offset-2 ring-offset-racing-950"
          aria-hidden="true"
        >
          <PuzzlePieceIcon className="h-4 w-4 text-brass" />
        </span>
      </div>

      <div className="flex justify-end">
        <div className="flex flex-col items-end pr-1">
          <CurvedArrow className="h-9 w-14 text-brass" />
          <StepLabel n={1} text="Click the puzzle-piece icon" />
        </div>
      </div>

      {/* Step 2: the extensions dropdown that opens, with the pin next to Lipi highlighted */}
      <div className="ml-auto mt-1 w-64 rounded-lg border border-racing-900/10 bg-white p-1.5 shadow-md">
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-racing-100 text-[10px] font-bold text-racing-900"
            aria-hidden="true"
          >
            L
          </span>
          <span className="flex-1 truncate text-xs font-medium text-racing-900">Lipi - Text Enhancer</span>
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-2 ring-brass"
            aria-hidden="true"
          >
            <PinIcon className="h-3.5 w-3.5 text-brass" />
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="flex flex-col items-end pr-1">
          <CurvedArrow className="h-9 w-14 text-brass" />
          <StepLabel n={2} text="Click the pin next to Lipi" />
        </div>
      </div>
    </div>
  )
}

function GenericIconSlot() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10" aria-hidden="true">
      <span className="h-3 w-3 rounded-sm bg-white/40" />
    </span>
  )
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-racing-900">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-racing-900 text-[10px] font-semibold text-white">
        {n}
      </span>
      {n}. {text}
    </p>
  )
}

// A loose, hand-drawn-style curved arrow pointing up-and-right, from a step
// label toward the toolbar element it refers to.
function CurvedArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 46"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 42 Q 8 14 52 6" />
      <path d="M52 6 L42 4.5" />
      <path d="M52 6 L45.5 14" />
    </svg>
  )
}

// Simple jigsaw-piece silhouette — a rounded square with one bump and one
// notch, enough to read as "puzzle piece" at icon size.
function PuzzlePieceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4 8a1 1 0 0 1 1-1h4a3 3 0 1 1 0 3.83V11a1 1 0 0 0 1 1h1.17a3 3 0 1 1 0-.83A1 1 0 0 0 12 12h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4.17a3 3 0 1 1 0-3.66V8Z" />
    </svg>
  )
}

// A simple angled thumbtack, echoing the browser's own "pin" affordance.
function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14.5 2.5a1 1 0 0 1 1.42 0l5.6 5.6a1 1 0 0 1 0 1.42l-1.1 1.1a1 1 0 0 1-1.42 0l-.4-.4-3 3 .6 3.6a1 1 0 0 1-.28.92l-1 1a1 1 0 0 1-1.42 0l-3.6-3.6-4.9 4.9a1 1 0 1 1-1.42-1.42l4.9-4.9-3.6-3.6a1 1 0 0 1 0-1.42l1-1a1 1 0 0 1 .92-.28l3.6.6 3-3-.4-.4a1 1 0 0 1 0-1.42Z" />
    </svg>
  )
}

export { App }
