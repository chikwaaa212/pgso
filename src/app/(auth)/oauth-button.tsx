'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signInWithOAuth } from './auth'
import { OAUTH_LABEL } from './oauth'
import { SubmitButton } from '@/components/ui/submit-button'
import styles from './oauth-button.module.css'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-3.6 2.8C3.5 21.3 7.5 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4L1.5 6.7C.5 8.7 0 10.3 0 12s.5 3.3 1.5 5.3l3.7-2.9z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.6l3.7 2.9c1-2.9 3.7-4.8 6.8-4.8z"
      />
    </svg>
  )
}

/**
 * Shared Supabase OAuth entry point. New users are registered as
 * employee/pending in the auth callback; returning users (any role) sign in —
 * OAuth users have no password, so this appears on both login and signup.
 */
export function OAuthButton({ mode, hideDivider = false }: { mode: 'signin' | 'signup'; hideDivider?: boolean }) {
  return (
    <div className={styles.oauthBlock}>
      <form action={signInWithOAuth}>
        <Suspense fallback={null}>
          <OAuthNextField />
        </Suspense>
        <SubmitButton
          variant="outline"
          className={styles.oauthButton}
          pendingLabel={`Redirecting to ${OAUTH_LABEL}…`}
        >
          <GoogleIcon />
          {mode === 'signup' ? 'Sign up' : 'Sign in'} with {OAUTH_LABEL}
        </SubmitButton>
      </form>
      {!hideDivider && (
        <div className={styles.divider} aria-hidden="true">
          <span>{mode === 'signup' ? 'or sign up with email' : 'or sign in with email'}</span>
        </div>
      )}
    </div>
  )
}

function OAuthNextField() {
  let next: string | null = null
  try {
    next = useSearchParams().get('next')
  } catch {
    next = null
  }
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null
  return <input type="hidden" name="next" value={next} />
}
