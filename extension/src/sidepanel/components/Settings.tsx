import { useState } from 'react'
import { STYLES } from '../../../../shared/styles.js'
import { maskKey } from '../../services/keyStore.js'
import { ROLE_OPTIONS, type WriterRole } from '../../services/roles.js'
import type { QuickModeSettings } from '../../types/index.js'
import { ArrowLeftIcon } from './Icons.js'
import { KeySetup } from './KeySetup.js'

interface Props {
  role: WriterRole
  onRoleChange: (role: WriterRole) => void
  quickMode: QuickModeSettings
  onQuickModeChange: (next: QuickModeSettings) => void
  savedKey: string | null
  onRemoveKey: () => void
  onKeySaved: (key: string) => void
  onBack: () => void
}

const TONE_STYLES = STYLES.filter((s) => s.group === 'tone' && s.id !== 'custom')
const BUSINESS_STYLES = STYLES.filter((s) => s.group === 'business')

export function Settings({ role, onRoleChange, quickMode, onQuickModeChange, savedKey, onRemoveKey, onKeySaved, onBack }: Props) {
  const [addingKey, setAddingKey] = useState(false)

  return (
    <div>
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-1.5 rounded-lg p-1.5 text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          <ArrowLeftIcon />
        </button>
        <h1 className="text-base font-semibold tracking-tight text-racing-900">Settings</h1>
      </header>

      <div className="space-y-4">
        <section className="rounded-xl border border-racing-900/10 bg-white p-4 shadow-sm">
          <label htmlFor="writer-role" className="text-sm font-semibold text-racing-900">
            I work as
          </label>
          <p className="mt-1 text-xs text-racing-800/80">Puts the styles you use most up front.</p>
          <select
            id="writer-role"
            value={role}
            onChange={(e) => onRoleChange(e.target.value as WriterRole)}
            className="mt-2 w-full rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {r.hint}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-xl border border-racing-900/10 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-racing-900">Quick mode</h2>
              <p className="mt-1 text-xs leading-relaxed text-racing-800/80">
                Click <span className="font-medium">Improve Text</span> on selected text and it&rsquo;s rewritten in
                place — no panel needed.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quickMode.enabled}
              aria-label="Quick mode"
              onClick={() => onQuickModeChange({ ...quickMode, enabled: !quickMode.enabled })}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass ${
                quickMode.enabled ? 'bg-racing-900' : 'bg-racing-900/20'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  quickMode.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 border-t border-racing-900/10 pt-4">
            <label htmlFor="default-style" className="text-sm font-semibold text-racing-900">
              Default style
            </label>
            <p className="mt-1 text-xs text-racing-800/80">Used for Quick mode and when the panel opens.</p>
            <select
              id="default-style"
              value={quickMode.styleId}
              onChange={(e) => onQuickModeChange({ ...quickMode, styleId: e.target.value })}
              className="mt-2 w-full rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
            >
              <optgroup label="Tone">
                {TONE_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Investor &amp; analyst">
                {BUSINESS_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </section>

        {addingKey ? (
          <KeySetup
            reason="settings"
            onCancel={() => setAddingKey(false)}
            onSaved={(key) => {
              setAddingKey(false)
              onKeySaved(key)
            }}
          />
        ) : (
          <section className="rounded-xl border border-racing-900/10 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-racing-900">AI access</h2>
            {savedKey ? (
              <>
                <p className="mt-1 text-sm text-racing-800/90">
                  Using your Groq key <span className="font-mono text-xs">{maskKey(savedKey)}</span>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingKey(true)}
                    className="rounded-lg border border-racing-900/20 px-3 py-1.5 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                  >
                    Replace key
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveKey}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-racing-800/80">
                  You&rsquo;re on the free allowance. Add your own Groq key any time to skip the limit.
                </p>
                <button
                  type="button"
                  onClick={() => setAddingKey(true)}
                  className="mt-3 rounded-lg border border-racing-900/20 px-3 py-1.5 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                >
                  Use your own Groq key
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
