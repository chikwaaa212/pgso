'use client'

import { useActionState, useEffect, useState } from 'react'
import { signup } from '../auth'
import type { SignupState } from '@/types'
import { SubmitButton } from '@/components/ui/submit-button'
import styles from './page.module.css'

export default function SignupPage() {
  const [state, formAction] = useActionState<SignupState, FormData>(signup, {
    success: false,
    error: undefined,
  })
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.success])

  return (
    <div className={styles.formContainer}>
      <h1 className={styles.title}>Create Account</h1>
      <p className={styles.description}>
        Sign up for PGSO-PSMS
      </p>

      <form action={formAction} className={styles.form}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div>
          <label htmlFor="full_name" className={styles.label}>
            Full Name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            className={styles.input}
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label htmlFor="email" className={styles.label}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={styles.input}
            placeholder="you@example.com"
          />
        </div>

        <div>
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
          />
        </div>

        {state?.error && (
          <p className={styles.error}>{state.error}</p>
        )}

        {state?.success && (
          <p className={styles.success}>
            Submitted for approval. You can sign in after an admin approves
            your account.{' '}
            <a href="/login" className={styles.link}>
              Go to sign in
            </a>
            .
          </p>
        )}

        <SubmitButton variant="primary" className="w-full" pendingLabel="Creating account…">
          Sign Up
        </SubmitButton>
      </form>

      <p className={styles.footerText}>
        Already have an account?{' '}
        <a href="/login" className={styles.link}>
          Sign in
        </a>
      </p>
    </div>
  )
}
