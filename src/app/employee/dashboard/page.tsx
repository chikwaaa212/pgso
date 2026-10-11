import Image from 'next/image'
import Link from 'next/link'
import { getSessionIdentity } from '@/lib/personnel-scope'
import { cacheKey, withCache } from '@/lib/personnel-cache'
import prisma from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import styles from './page.module.css'

export default async function EmployeeDashboard() {
  // Memoized identity shared with the layout (one Auth verification per
  // request instead of two) — claims-first, getUser fallback.
  const { userId, email } = await getSessionIdentity()

  let displayName = 'Employee'
  let contextLine: string | null = null
  if (userId) {
    try {
      // Per-employee read-through (60s): greeting rows are never shared
      // across users (u:userId in the key). Busted by profile completion
      // edits (see employee/profile-actions.ts).
      const profile = await withCache(
        cacheKey('employee:dashboard', { u: userId }),
        60,
        async () =>
          prisma.profile.findUnique({
            where: { id: userId },
            select: {
              full_name: true,
              first_name: true,
              position: true,
              office: true,
              department: true,
            },
          })
      )
      const firstName = profile?.first_name?.trim()
      const fullName = profile?.full_name?.trim()
      displayName = firstName || fullName || 'Employee'
      const context = [profile?.position?.trim(), profile?.office?.trim() || profile?.department?.trim()].filter(Boolean)
      contextLine = context.length > 0 ? context.join(' · ') : null
    } catch {
      // Fall back to the generic greeting if the profile can't be read.
    }
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Employee / Dashboard</p>
      <h1 className={styles.title}>Welcome, {displayName}</h1>
      <p className={styles.subtitle}>
        Signed in as {email}{contextLine ? ` · ${contextLine}` : ''}
      </p>

      <div className={styles.grid}>
        <Link href="/employee/assets" className={styles.bannerLink}>
          <Card className={styles.banner}>
            <div>
              <h2 className={styles.bannerTitle}>My Assets</h2>
              <p className={styles.bannerText}>
                View assigned assets and PAR / ICS documents
              </p>
              <span className={styles.bannerCta}>Open assets →</span>
            </div>
            <Image
              src="/favicon.png"
              alt="Eagle mascot with telescope"
              width={160}
              height={160}
              priority
              className={styles.bannerImg}
            />
          </Card>
        </Link>
        <Link href="/employee/requests" className={styles.bannerLink}>
          <Card className={styles.banner}>
            <div>
              <h2 className={styles.bannerTitle}>My Requests</h2>
              <p className={styles.bannerText}>
                Submit and track transfer or supply requests
              </p>
              <span className={styles.bannerCta}>Open requests →</span>
            </div>
            <Image
              src="/salute.png"
              alt="Saluting eagle mascot"
              width={160}
              height={160}
              priority
              className={styles.bannerImg}
            />
          </Card>
        </Link>
      </div>
    </section>
  )
}
