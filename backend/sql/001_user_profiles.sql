-- Per-account writing profile (tone, verbosity, emoji usage, custom
-- instructions) applied to every rewrite. See shared/profile.ts.
--
-- MUST be applied manually to the Neon database BEFORE deploying the backend
-- version that serves /api/profile. It is idempotent (IF NOT EXISTS).
--
-- Keyed by the verified Google `sub`, NOT the (resettable) device id, so the
-- profile follows the account across reinstalls and devices.

CREATE TABLE IF NOT EXISTS user_profiles (
  google_sub          text        PRIMARY KEY,
  tone                text        NOT NULL DEFAULT 'default',
  verbosity           text        NOT NULL DEFAULT 'default',
  emoji_usage         text        NOT NULL DEFAULT 'default',
  custom_instructions text        NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
