-- Writing samples for "Reply in my voice": up to 8 short messages the user
-- pasted so generated replies can mimic how they actually text. See
-- shared/profile.ts (MAX_WRITING_SAMPLES / MAX_WRITING_SAMPLE_LENGTH).
--
-- MUST be applied manually to the Neon database BEFORE deploying the backend
-- version that reads/writes this column — otherwise every profile read and
-- write fails (getProfile fails open to defaults, saveProfile returns 503).
-- It is idempotent (IF NOT EXISTS).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS writing_samples jsonb NOT NULL DEFAULT '[]'::jsonb;
