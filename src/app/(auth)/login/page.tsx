'use client'

import { useState, useActionState, useEffect } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { login } from '../auth'
import type { LoginState } from '@/types'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import styles from './page.module.css'

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {
    error: undefined,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => setIdempotencyKey(crypto.randomUUID()), 0)
      return () => clearTimeout(timer)
    }
  }, [state.error])

  return (
    <motion.div
      className={styles.pageWrapper}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Login</h1>
          <p className={styles.description}>
            Enter your email below to login to your account
          </p>
        </div>

        <form action={formAction} className={styles.form}>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
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
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                className={styles.passwordInput}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className={styles.passwordIcon} />
                ) : (
                  <Eye className={styles.passwordIcon} />
                )}
              </button>
            </div>
          </div>

          {state?.error && (
            <p className={styles.error} role="alert">
              {state.error}
            </p>
          )}

          <div className={styles.rememberRow}>
            <label className={styles.checkboxContainer}>
              <input
                type="checkbox"
                name="remember"
                className={styles.checkbox}
              />
              <span className={styles.checkmark}>&#10003;</span>
              <span className={styles.rememberLabel}>Remember me</span>
            </label>
            <Link href="/forgot-password" className={styles.forgotLink}>
              Forgot your password?
            </Link>
          </div>

          <SubmitButton variant="primary" className={styles.submitButton} pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <p className={styles.footerText}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={styles.link}>
            Sign up
          </Link>
        </p>
      </Card>
    </motion.div>
  )
}
