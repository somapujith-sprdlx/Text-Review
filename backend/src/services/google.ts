export interface GoogleIdentity {
  sub: string
  email: string
}

interface GoogleUserinfoResponse {
  sub?: string
  email?: string
}

// Verifies a Google OAuth access token by calling Google's own userinfo
// endpoint with it — the call only succeeds with a token Google itself
// issued and still considers valid, which is what makes this "verification"
// rather than trusting a client-supplied claim (contrast with the
// self-reported rating claim in routes/deviceState.ts). Plain fetch, no SDK
// — same pattern this backend already uses for Groq.
export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleIdentity | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as GoogleUserinfoResponse
    if (!body.sub || !body.email) return null
    return { sub: body.sub, email: body.email }
  } catch (err) {
    console.error('verifyGoogleAccessToken failed:', err)
    return null
  }
}
