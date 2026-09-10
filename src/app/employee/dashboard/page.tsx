import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import styles from './page.module.css'

export default async function EmployeeDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Employee / Dashboard</p>
      <h1 className={styles.title}>Welcome, Employee</h1>
      <p className={styles.subtitle}>
        Signed in as {user?.email}
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
