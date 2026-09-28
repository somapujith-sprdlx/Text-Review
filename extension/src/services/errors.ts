import type { UsageInfo } from '../types/index.js'

// The free shared allowance is used up — the UI should offer the
// bring-your-own-Groq-key flow.
export class LimitReachedError extends Error {
  constructor(readonly usage?: UsageInfo) {
    super("You've used the free allowance.")
  }
}

// The user's own Groq key was rejected (revoked, mistyped, wrong account).
export class InvalidKeyError extends Error {
  constructor() {
    super('Your Groq API key was rejected.')
  }
}

// Backend-side backstop for the rating gate (see middleware/ratingGate.ts).
// Primary enforcement is client-side (App.tsx checks cached device state
// before this could ever fire) — this only surfaces if that check was
// somehow bypassed, so the UI still has something sane to fall back to.
export class RatingRequiredError extends Error {
  constructor() {
    super('Please rate Lipi to keep using it.')
  }
}
