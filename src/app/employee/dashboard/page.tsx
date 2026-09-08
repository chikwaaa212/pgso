import { createClient } from '@/lib/supabase/server'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import { logout } from '@/app/(auth)/auth'
import styles from './page.module.css'

export default async function EmployeeDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <section className={styles.section}>
      <h1 className={styles.title}>Welcome, Employee</h1>
      <p className={styles.subtitle}>
        Signed in as {user?.email}
      </p>

      <div className={styles.grid}>
        <Card>
          <h2 className="text-lg font-semibold">My Assets</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View assigned and archived assets
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">My Requests</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Submit and track transfer or supply requests
          </p>
        </Card>
      </div>

      <form action={logout} className={styles.form}>
        <SubmitButton variant="outline" pendingLabel="Signing out…">
          Sign Out
        </SubmitButton>
      </form>
    </section>
  )
}
