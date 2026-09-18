'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { addPersonnelEmployee } from './actions'
import type { SignupState } from '@/types'
import { SubmitButton } from '@/components/ui/submit-button'
import styles from './page.module.css'

// Must be a child of <form> for useFormStatus to work. Shows a live
// elapsed timer while the server action runs — creating the Supabase Auth
// user takes a few seconds, and without feedback it looks stuck.
function PendingHint() {
  const { pending } = useFormStatus()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional timer reset when the submit finishes
      setElapsed(0)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000))
    }, 500)
    return () => clearInterval(timer)
  }, [pending])
  return (
    <p className={styles.panelSub} aria-live="polite">
      Creating account… {elapsed}s — contacting the auth server, please wait
      and don&apos;t resubmit.
    </p>
  )
}

export function AddPersonnelForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(
    addPersonnelEmployee,
    { success: false, error: undefined }
  )
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) {
      // Clear inputs so a success is obvious, and mint a fresh key so the
      // next submit is never treated as a duplicate of this one.
      formRef.current?.reset()
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.success])

  return (
    <form ref={formRef} action={formAction} className={styles.addForm}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <label htmlFor="full_name" className={styles.addLabel}>
          Full Name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className={styles.addInput}
          placeholder="Jane Doe"
        />
      </div>

      <div>
        <label htmlFor="email" className={styles.addLabel}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={styles.addInput}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className={styles.addLabel}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className={styles.addInput}
          placeholder="At least 6 characters"
        />
      </div>

      {state?.error && (
        <p className={styles.addError}>{state.error}</p>
      )}

      {state?.success && (
        <p className={styles.addSuccess}>Personnel employee added — counts updated.</p>
      )}

      <PendingHint />

      <SubmitButton variant="primary" pendingLabel="Adding…">
        Add Personnel Employee
      </SubmitButton>
    </form>
  )
}
