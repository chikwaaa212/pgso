'use client'

import { Suspense, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { OAuthButton } from '../oauth-button'
import { resendSignupOtp, signup, verifySignupOtp } from '../auth'
import type { SelfRegisterRole } from '../oauth'
import type { SignupState } from '@/types'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import styles from '../login/page.module.css'

const RESEND_COOLDOWN_S = 60

function SignupNotice() {
  const params = useSearchParams()
  const notice = params.get('notice')
  if (notice === 'check-email') {
    return (
      <p className={styles.notice} role="status">
        Account created — check your email for the 8-digit verification code, then enter it below.
      </p>
    )
  }
  return null
}

const ROLE_OPTIONS: { value: SelfRegisterRole; title: string; hint: string }[] = [
  { value: 'employee', title: 'Employee', hint: 'File requests & track issuances' },
  { value: 'pgso_personnel', title: 'PGSO Personnel', hint: 'Manage assets, deliveries & issuances' },
]

function roleLabel(role: SelfRegisterRole): string {
  return role === 'pgso_personnel' ? 'PGSO Personnel' : 'Employee'
}

function RolePicker({
  role,
  onChange,
  disabled,
}: {
  role: SelfRegisterRole
  onChange: (r: SelfRegisterRole) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Account type"
      aria-disabled={disabled}
      style={{
        display: 'grid',
        gap: '0.5rem',
        gridTemplateColumns: '1fr 1fr',
        marginBottom: '1rem',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {ROLE_OPTIONS.map((opt) => {
        const selected = role === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              textAlign: 'left',
              borderRadius: '0.5rem',
              border: selected ? '2px solid var(--color-yellow-500)' : '1px solid var(--color-navy-300)',
              background: selected ? 'rgba(245, 197, 2, 0.08)' : 'transparent',
              padding: '0.625rem 0.75rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>{opt.title}</span>
            <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.75 }}>{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function EmailSignupForm({
  role,
  onNeedsVerification,
  onSuccess,
}: {
  role: SelfRegisterRole
  onNeedsVerification: (email: string, role: SelfRegisterRole) => void
  onSuccess: (email: string, role: SelfRegisterRole) => void
}) {
  const [state, formAction] = useActionState<SignupState, FormData>(signup, {})
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const notifiedFor = useRef<string | null>(null)

  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.error])

  // Bubble the terminal signup result to the parent exactly once so it can
  // persist the OTP step in the URL (refresh-safe) or show the success panel.
  // Supabase requires email confirmation → the action returns
  // needsVerification: swap to the OTP step, preserving email + role.
  useEffect(() => {
    if (state.needsVerification && state.email && notifiedFor.current !== state.email) {
      notifiedFor.current = state.email
      onNeedsVerification(state.email, role)
    } else if (state.success && state.email && notifiedFor.current !== `done:${state.email}`) {
      notifiedFor.current = `done:${state.email}`
      onSuccess(state.email, role)
    }
  }, [state, role, onNeedsVerification, onSuccess])

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="role" value={role} />
      <div className={styles.field}>
        <label htmlFor="full_name" className={styles.label}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className={styles.input}
          placeholder="Juan Dela Cruz"
          autoComplete="name"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={styles.input}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className={styles.input}
          placeholder="At least 6 characters"
          autoComplete="new-password"
        />
      </div>
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton variant="primary" className={styles.submitButton} pendingLabel="Creating account…">
        Sign up with email
      </SubmitButton>
      <p style={{ fontSize: '0.75rem', opacity: 0.75, textAlign: 'center' }}>
        We&apos;ll email you an 8-digit code to verify your address. Your account is active
        immediately after verification — no admin approval needed.
      </p>
    </form>
  )
}

/** Recovery entry: user already has a code (e.g. after a refresh) but no OTP step state. */
function CodeRecovery({ onJump }: { onJump: (email: string) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  if (!open) {
    return (
      <p style={{ fontSize: '0.8125rem', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', font: 'inherit' }}
        >
          Already have a code?
        </button>
      </p>
    )
  }
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) onJump(email.trim())
      }}
    >
      <div className={styles.field}>
        <label htmlFor="recovery_email" className={styles.label}>
          Enter your signup email to continue verifying
        </label>
        <input
          id="recovery_email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <SubmitButton variant="outline" className={styles.submitButton} pendingLabel="Continuing…">
        Continue to verification
      </SubmitButton>
    </form>
  )
}

function AlreadyVerifiedPanel({ email }: { email: string }) {
  return (
    <div className={styles.form}>
      <p className={styles.notice} role="status">
        <strong>{email}</strong> is already verified. You can sign in directly —
        no new code is needed.
      </p>
      <Link href="/login" className={styles.submitButton} style={{ textAlign: 'center' }}>
        Go to sign in
      </Link>
    </div>
  )
}

function OtpVerifyForm({ email, role }: { email: string; role: SelfRegisterRole | null }) {
  const [state, formAction] = useActionState<SignupState, FormData>(verifySignupOtp, {})
  const [resendState, resendAction] = useActionState<SignupState, FormData>(resendSignupOtp, {})
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [resendKey, setResendKey] = useState(() => crypto.randomUUID())
  const [cooldownLeft, setCooldownLeft] = useState(0)

  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.error])

  useEffect(() => {
    if (resendState.error) {
      // Failed resend must not trap the user behind the cooldown.
      const timer = setTimeout(() => {
        setResendKey(crypto.randomUUID())
        setCooldownLeft(0)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [resendState.error])

  useEffect(() => {
    if (cooldownLeft <= 0) return
    const timer = setTimeout(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldownLeft])

  if (state.alreadyVerified || resendState.alreadyVerified) {
    return <AlreadyVerifiedPanel email={email} />
  }

  return (
    <div className={styles.form}>
      <p className={styles.notice} role="status">
        Code sent to <strong>{email}</strong>. Enter the 8-digit code to verify and sign in
        {role ? ` as ${roleLabel(role)}` : ''}.
      </p>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="role" value={role ?? 'employee'} />
        <div className={styles.field}>
          <label htmlFor="token" className={styles.label}>
            8-digit verification code
          </label>
          <input
            id="token"
            name="token"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            minLength={8}
            maxLength={8}
            className={styles.input}
            placeholder="12345678"
            style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: 700 }}
          />
        </div>
        {state?.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton variant="primary" className={styles.submitButton} pendingLabel="Verifying…">
          Verify & sign in
        </SubmitButton>
      </form>
      {/* Cooldown starts on submit (event handler, not render) so rapid
          clicks can't stack resend mutations; a failed resend clears it. */}
      <form action={resendAction} onSubmit={() => setCooldownLeft(RESEND_COOLDOWN_S)}>
        <input type="hidden" name="idempotencyKey" value={resendKey} />
        <input type="hidden" name="email" value={email} />
        {resendState.resent && !resendState.error && (
          <p className={styles.notice} role="status">
            New code sent to <strong>{email}</strong> — check your inbox (and spam folder).
          </p>
        )}
        {resendState?.error && (
          <p className={styles.error} role="alert">
            {resendState.error}
          </p>
        )}
        <SubmitButton
          variant="outline"
          className={styles.submitButton}
          pendingLabel="Resending…"
          disabled={cooldownLeft > 0}
        >
          {cooldownLeft > 0 ? `Resend code (${cooldownLeft}s)` : 'Resend code'}
        </SubmitButton>
      </form>
    </div>
  )
}

function SuccessPanel({ email, role }: { email: string; role: SelfRegisterRole }) {
  const router = useRouter()
  // A session already exists on this branch — hand off to middleware, which
  // role-routes signed-in users to their dashboard.
  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 1500)
    return () => clearTimeout(timer)
  }, [router])
  return (
    <div className={styles.form}>
      <p className={styles.notice} role="status">
        Account created for <strong>{email}</strong> as {roleLabel(role)} — taking you to
        your dashboard…
      </p>
      <Link href="/" className={styles.submitButton} style={{ textAlign: 'center' }}>
        Continue to dashboard
      </Link>
    </div>
  )
}

function SignupContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [role, setRole] = useState<SelfRegisterRole>('employee')
  // OTP step state from this tab's signup action (authoritative incl. role).
  const [otp, setOtp] = useState<{ email: string; role: SelfRegisterRole } | null>(null)
  const [done, setDone] = useState<{ email: string; role: SelfRegisterRole } | null>(null)

  // Refresh-safe recovery: /signup?step=code&email=… reopens the OTP step
  // (role unknown here — verify prefers the role stored at signup).
  const stepParam = params.get('step')
  const emailParam = (params.get('email') ?? '').trim()
  const recovered = stepParam === 'code' && emailParam !== '' && /.+@.+\..+/.test(emailParam)

  const otpActive = otp !== null || recovered
  const effectiveEmail = otp?.email ?? (recovered ? emailParam : '')
  // Freeze the picker once verification starts: the role stored at signup
  // (user metadata) wins server-side, so changing it now would mislead.
  const effectiveRole: SelfRegisterRole | null = otp ? otp.role : null

  const persistStep = (email: string) => {
    router.replace(`/signup?step=code&email=${encodeURIComponent(email)}`, { scroll: false })
  }

  return (
    <>
      <RolePicker role={role} onChange={setRole} disabled={otpActive || done !== null} />

      {done ? (
        <SuccessPanel email={done.email} role={done.role} />
      ) : otpActive ? (
        <OtpVerifyForm email={effectiveEmail} role={effectiveRole} />
      ) : (
        <>
          <OAuthButton mode="signup" role={role} />
          <EmailSignupForm
            role={role}
            onNeedsVerification={(email, r) => {
              setOtp({ email, role: r })
              persistStep(email)
            }}
            onSuccess={(email, r) => setDone({ email, role: r })}
          />
          <CodeRecovery onJump={(email) => persistStep(email)} />
        </>
      )}
    </>
  )
}

export default function SignupPage() {
  return (
    <motion.div
      className={styles.pageWrapper}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.description}>
            Pick your account type, then sign up with Google or email. Accounts are
            active immediately after verification — no admin approval needed.
          </p>
        </div>

        <Suspense fallback={null}>
          <SignupNotice />
        </Suspense>

        <Suspense fallback={null}>
          <SignupContent />
        </Suspense>

        <p className={styles.footerText}>
          Already have an account?{' '}
          <Link href="/login" className={styles.link}>
            Sign in
          </Link>
        </p>
      </Card>
    </motion.div>
  )
}
