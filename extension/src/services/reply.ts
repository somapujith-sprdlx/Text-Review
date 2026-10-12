import { isDefaultProfile } from '../../../shared/profile.js'
import { MAX_REPLY_SOURCE_LENGTH, type ReplyOption } from '../../../shared/reply.js'
import type { UsageInfo } from '../types/index.js'
import { postToBackend, requireGoogleLink } from './api.js'
import { reportImprovementCompleted } from './deviceState.js'
import { replyWithGroqKey } from './groq.js'
import { getGroqKey } from './keyStore.js'
import { getCachedProfile } from './profile.js'
import { pickReplySamples } from './typingStore.js'

export interface ReplyResult {
  replies: ReplyOption[]
  usage?: UsageInfo
}

interface ReplyResponse {
  requestId: string
  replies: ReplyOption[]
  usage?: UsageInfo
}

// Mirrors improveText(): same compulsory Google sign-in guard, same "a saved
// Groq key always wins" routing, same lifetime-count report afterward (a reply
// counts toward the rating gate and, on the backend path, the daily limit).
export async function replyToText(text: string): Promise<ReplyResult> {
  await requireGoogleLink()

  // Truncate instead of failing: the start of a long message carries what
  // needs answering, and both the prompt and the backend cap the length.
  const message = text.trim().slice(0, MAX_REPLY_SOURCE_LENGTH)

  // Replies use the writing samples (and tone/emoji prefs) from the profile,
  // so it is attached whenever it holds anything — left off when everything is
  // default to keep the request body minimal, same as improveText().
  // When "learn from what I type" is on, a few representative on-device
  // messages are merged into the samples for this request only: the merged
  // profile is never written to the cache or the server, and the learned
  // buffer itself is never uploaded in bulk. The default check runs on the
  // merged profile so a user with only learned samples still sends them.
  const cached = await getCachedProfile()
  const profile = { ...cached, writingSamples: await pickReplySamples(cached.writingSamples) }
  const profileToSend = isDefaultProfile(profile) ? undefined : profile

  const apiKey = await getGroqKey()
  let result: ReplyResult
  if (apiKey) {
    result = { replies: await replyWithGroqKey(apiKey, message, profileToSend) }
  } else {
    const data = await postToBackend<ReplyResponse>('/api/reply', {
      text: message,
      ...(profileToSend ? { profile: profileToSend } : {}),
    })
    if (!Array.isArray(data.replies) || data.replies.length === 0) {
      throw new Error('Something went wrong. Try again.')
    }
    result = { replies: data.replies, usage: data.usage }
  }

  void reportImprovementCompleted()
  return result
}
