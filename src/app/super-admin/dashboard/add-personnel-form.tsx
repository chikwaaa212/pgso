'use client'

import { useActionState, useEffect, useState } from 'react'
import { addPersonnelEmployee } from './actions'
import type { SignupState } from '@/types'
import { SubmitButton } from '@/components/ui/submit-button'
import styles from './page.module.css'

export function AddPersonnelForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(
    addPersonnelEmployee,
    { success: false, error: undefined }
  )
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.success])

  return (
    <form action={formAction} className={styles.addForm}>
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
        <p className={styles.addSuccess}>Personnel employee added.</p>
      )}

      <SubmitButton variant="primary" pendingLabel="Adding…">
        Add Personnel Employee
      </SubmitButton>
    </form>
  )
}
