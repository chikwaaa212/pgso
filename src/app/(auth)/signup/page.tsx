'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { OAuthButton } from '../oauth-button'
import { Card } from '@/components/ui/card'
import styles from '../login/page.module.css'

function SignupNotice() {
  const params = useSearchParams()
  if (params.get('notice') !== 'pending') return null
  return (
    <p className={styles.notice} role="status">
      Account created — it is waiting for admin approval. You can sign in after approval.
    </p>
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
          <h1 className={styles.title}>Create employee account</h1>
          <p className={styles.description}>
            Sign up with Google. New accounts start as Employee and need admin
            approval before sign-in.
          </p>
        </div>

        <Suspense fallback={null}>
          <SignupNotice />
        </Suspense>

        <OAuthButton mode="signup" hideDivider />

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
