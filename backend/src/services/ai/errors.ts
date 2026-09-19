export class ProviderHttpError extends Error {
  constructor(
    provider: string,
    readonly status: number,
    body: string,
  ) {
    super(`${provider} API error ${status}: ${body}`)
  }
}

// Every provider failed and at least one of them reported quota/rate-limit
// exhaustion (HTTP 429) — i.e. the shared free allowance is used up, as
// opposed to a config error or outage. Clients react to this by asking the
// user to bring their own key.
export class QuotaExhaustedError extends Error {}
