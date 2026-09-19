// The free shared allowance is used up — the UI should offer the
// bring-your-own-Groq-key flow.
export class LimitReachedError extends Error {
  constructor() {
    super("You've used the free allowance.")
  }
}

// The user's own Groq key was rejected (revoked, mistyped, wrong account).
export class InvalidKeyError extends Error {
  constructor() {
    super('Your Groq API key was rejected.')
  }
}
