import { describe, it, expect } from 'vitest'
import { cleanTypedText, isBlockedHost, shouldCaptureField } from '../../shared/typingFilter.js'

const textarea = { tagName: 'TEXTAREA', isContentEditable: false }
const textInput = { tagName: 'INPUT', inputType: 'text', isContentEditable: false }

describe('shouldCaptureField', () => {
  it('accepts a normal chat textarea, text input and contenteditable', () => {
    expect(shouldCaptureField({ ...textarea, placeholder: 'Type a message', name: 'message' })).toBe(true)
    expect(shouldCaptureField(textInput)).toBe(true)
    expect(shouldCaptureField({ tagName: 'DIV', isContentEditable: true, ariaLabel: 'Message #general' })).toBe(true)
  })

  it('rejects non-text input types', () => {
    for (const inputType of ['password', 'email', 'tel', 'number', 'url', 'hidden', 'file', 'search', 'checkbox', 'date']) {
      expect(shouldCaptureField({ tagName: 'INPUT', inputType, isContentEditable: false })).toBe(false)
    }
  })

  it('rejects elements that are not text boxes', () => {
    expect(shouldCaptureField({ tagName: 'DIV', isContentEditable: false })).toBe(false)
    expect(shouldCaptureField({ tagName: 'SELECT', isContentEditable: false })).toBe(false)
  })

  it('rejects credential / payment autocomplete hints', () => {
    for (const autocomplete of ['cc-number', 'cc-csc', 'one-time-code', 'new-password', 'current-password', 'username', 'section-a billing cc-exp']) {
      expect(shouldCaptureField({ ...textInput, autocomplete })).toBe(false)
    }
    expect(shouldCaptureField({ ...textInput, autocomplete: 'off' })).toBe(true)
  })

  it('rejects sensitive name / id / aria-label / placeholder', () => {
    expect(shouldCaptureField({ ...textInput, name: 'otp' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, id: 'otpCode' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'user_password' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, ariaLabel: 'Card number' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, placeholder: 'CVV' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, placeholder: 'Enter your PIN' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'api-key' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, id: 'apiToken' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'iban' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'ssn' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, placeholder: 'Social security number' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'routing_number' })).toBe(false)
    expect(shouldCaptureField({ ...textInput, name: 'account-number' })).toBe(false)
    expect(shouldCaptureField({ tagName: 'DIV', isContentEditable: true, ariaLabel: 'Secret answer' })).toBe(false)
  })

  it('does not trip on look-alike words', () => {
    expect(shouldCaptureField({ ...textarea, placeholder: 'Shipping notes' })).toBe(true)
    expect(shouldCaptureField({ ...textarea, name: 'spinner' })).toBe(true)
    expect(shouldCaptureField({ ...textarea, id: 'compass' })).toBe(true)
  })

  it('rejects search boxes', () => {
    expect(shouldCaptureField({ ...textInput, name: 'q', ariaLabel: 'Search' })).toBe(false)
  })
})

describe('isBlockedHost', () => {
  it('allows ordinary chat / social hosts', () => {
    for (const host of ['web.whatsapp.com', 'discord.com', 'mail.google.com', 'x.com', 'www.reddit.com', 'app.slack.com', 'syntax.fm', 'purchase.example.com']) {
      expect(isBlockedHost(host, [])).toBe(false)
    }
  })

  it('blocks banking, payment and finance hosts including subdomains', () => {
    for (const host of [
      'www.chase.com',
      'secure.bankofamerica.com',
      'netbanking.hdfcbank.com',
      'www.icicibank.com',
      'onlinesbi.sbi',
      'retail.sbi.co.in',
      'dashboard.stripe.com',
      'www.paypal.com',
      'wise.com',
      'pay.razorpay.com',
      'paytm.com',
      'www.coinbase.com',
      'accounts.binance.com',
    ]) {
      expect(isBlockedHost(host, []), host).toBe(true)
    }
  })

  it('blocks health, government and tax hosts', () => {
    for (const host of [
      'mychart.example.org',
      'www.apollohospitals.com',
      'my.clevelandclinic.org',
      'www.irs.gov',
      'eportal.incometax.gov.in',
      'www.gov.uk',
      'portal.example.gov',
      'www.turbotax.com',
    ]) {
      expect(isBlockedHost(host, []), host).toBe(true)
    }
  })

  it('blocks identity / sign-in pages and password managers', () => {
    for (const host of [
      'accounts.google.com',
      'login.microsoftonline.com',
      'signin.aws.amazon.com',
      'auth.example.com',
      'sso.company.com',
      'id.example.com',
      'my.1password.com',
      'vault.bitwarden.com',
      'lastpass.com',
      'app.dashlane.com',
    ]) {
      expect(isBlockedHost(host, []), host).toBe(true)
    }
  })

  it('normalises case, www, port and trailing dot', () => {
    expect(isBlockedHost('WWW.PayPal.com.', [])).toBe(true)
    expect(isBlockedHost('www.paypal.com:8443', [])).toBe(true)
  })

  it('honours user-disabled hosts and their subdomains, not siblings', () => {
    const disabled = ['example.org', 'www.Notes.app']
    expect(isBlockedHost('example.org', disabled)).toBe(true)
    expect(isBlockedHost('chat.example.org', disabled)).toBe(true)
    expect(isBlockedHost('a.b.example.org', disabled)).toBe(true)
    expect(isBlockedHost('notes.app', disabled)).toBe(true)
    expect(isBlockedHost('myexample.org', disabled)).toBe(false)
    expect(isBlockedHost('example.com', disabled)).toBe(false)
  })

  it('treats an empty hostname as blocked', () => {
    expect(isBlockedHost('', [])).toBe(true)
  })
})

describe('cleanTypedText', () => {
  it('keeps quirks, stretched letters, slang and emoji verbatim', () => {
    expect(cleanTypedText('heyyy whats up 😂')).toBe('heyyy whats up 😂')
    expect(cleanTypedText('HELLOOO bro, kyaa haal hai??')).toBe('HELLOOO bro, kyaa haal hai??')
    expect(cleanTypedText('omg thats sooooo cute <3')).toBe('omg thats sooooo cute <3')
  })

  it('collapses newlines to single spaces and trims', () => {
    expect(cleanTypedText('  hey there\n\nhow are  you\r\ndoing  ')).toBe('hey there how are  you doing')
    expect(cleanTypedText('line one\nline two')).toBe('line one line two')
  })

  it('rejects too short and too long text', () => {
    expect(cleanTypedText('ok')).toBeNull()
    expect(cleanTypedText('   hi  ')).toBeNull()
    expect(cleanTypedText('a'.repeat(241) + ' b')).toBeNull()
    expect(cleanTypedText('word '.repeat(60))).toBeNull()
    expect(cleanTypedText('yeah')).toBe('yeah')
    expect(cleanTypedText('lol '.repeat(61).trim())).toBeNull() // 243 chars
  })

  it('allows a message right under the cap', () => {
    const msg = 'a'.repeat(5) + ' ' + 'b'.repeat(234)
    expect(msg.length).toBe(240)
    expect(cleanTypedText(msg)).toBe(msg)
  })

  it('rejects card, phone and long digit strings', () => {
    expect(cleanTypedText('my card is 4111 1111 1111 1111')).toBeNull()
    expect(cleanTypedText('4111-1111-1111-1111 exp 12/29')).toBeNull()
    expect(cleanTypedText('call me on +91 98765 43210 asap')).toBeNull()
    expect(cleanTypedText('call (555) 123-4567 tonight')).toBeNull()
    expect(cleanTypedText('aadhaar 1234 5678 9012 pls')).toBeNull()
    expect(cleanTypedText('order number 123456789012 shipped')).toBeNull()
  })

  it('still allows ordinary numbers', () => {
    expect(cleanTypedText('see you at 7:30 on 12/05, bring 2 chairs')).toBe('see you at 7:30 on 12/05, bring 2 chairs')
    expect(cleanTypedText('it costs 1500 rupees only')).toBe('it costs 1500 rupees only')
  })

  it('rejects mostly non-letter text', () => {
    expect(cleanTypedText('12 + 34 = 46 ???')).toBeNull()
    expect(cleanTypedText('!!!! ???? ....')).toBeNull()
    expect(cleanTypedText('😂😂😂😂😂😂')).toBeNull()
  })

  it('rejects URL-only and email text', () => {
    expect(cleanTypedText('https://example.com/some/page')).toBeNull()
    expect(cleanTypedText('www.example.com')).toBeNull()
    expect(cleanTypedText('example.com/pricing')).toBeNull()
    expect(cleanTypedText('rakesh@example.com')).toBeNull()
    expect(cleanTypedText('mail me at rakesh@example.com thanks')).toBeNull()
    expect(cleanTypedText('https://x.com/a?token=abc')).toBeNull()
  })

  it('keeps a message that merely mentions a link', () => {
    expect(cleanTypedText('check this out https://example.com lol')).toBe('check this out https://example.com lol')
  })

  it('rejects code-like text', () => {
    expect(cleanTypedText('const x = { a: 1 };')).toBeNull()
    expect(cleanTypedText('function foo() { return 1 }')).toBeNull()
    expect(cleanTypedText('import React from "react"')).toBeNull()
    expect(cleanTypedText('<div class="a">hello</div>')).toBeNull()
    expect(cleanTypedText('SELECT * FROM users WHERE id = 1')).toBeNull()
    expect(cleanTypedText('npm install left-pad')).toBeNull()
    expect(cleanTypedText('if (a === b && c) doThing()')).toBeNull()
  })

  it('does not mistake chat that starts with a keyword for code', () => {
    expect(cleanTypedText('let me know when you reach')).toBe('let me know when you reach')
    expect(cleanTypedText('class starts at nine tomorrow')).toBe('class starts at nine tomorrow')
    expect(cleanTypedText('return the book to her pls')).toBe('return the book to her pls')
  })

  it('rejects token-, key- and secret-like text', () => {
    expect(cleanTypedText('sk-proj-abcDEF1234567890abcdEF12')).toBeNull()
    expect(cleanTypedText('key is AKIAIOSFODNN7EXAMPLE ok')).toBeNull()
    expect(cleanTypedText('5d41402abc4b2a76b9719d911017c592a0b1 ')).toBeNull()
    expect(cleanTypedText('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc')).toBeNull()
    expect(cleanTypedText('here Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4 ok')).toBeNull()
    expect(cleanTypedText('GB82WEST12345698765432 is my iban')).toBeNull()
  })

  it('rejects text that names a credential', () => {
    expect(cleanTypedText('my password is hunter2')).toBeNull()
    expect(cleanTypedText('the otp is coming now')).toBeNull()
    expect(cleanTypedText('-----BEGIN RSA PRIVATE KEY----- abc')).toBeNull()
  })

  it('does not treat stretched words as tokens', () => {
    const s = 'heyyyyyyyyyyyyyyyyyyyyyyyyyy are you there'
    expect(cleanTypedText(s)).toBe(s)
    const t = 'noooooooooooooooooooooooooooo way'
    expect(cleanTypedText(t)).toBe(t)
  })

  it('does not flag a long hyphenated phrase', () => {
    const s = 'that was a state-of-the-art-everything-machine honestly'
    expect(cleanTypedText(s)).toBe(s)
  })

  it('returns null for non-strings', () => {
    expect(cleanTypedText(undefined as unknown as string)).toBeNull()
  })
})
