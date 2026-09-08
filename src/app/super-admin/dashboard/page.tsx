import { createClient } from '@/lib/supabase/server'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import { logout } from '@/app/(auth)/auth'
import { AddPersonnelForm } from './add-personnel-form'
import styles from './page.module.css'

export default async function SuperAdminDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <section className={styles.section}>
      <h1 className={styles.title}>Welcome, Super Admin</h1>
      <p className={styles.subtitle}>
        Signed in as {user?.email}
      </p>

      <div className={styles.grid}>
        <Card>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Create, deactivate, and edit accounts
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">System Monitoring</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View all transactions and audit logs
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Configuration</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Master data, thresholds, and templates
          </p>
        </Card>
      </div>

      <div className={styles.addSection}>
        <h2 className={styles.addTitle}>Add Personnel Employee</h2>
        <p className={styles.addSubtitle}>
          Create login credentials for a PGSO personnel member.
        </p>
        <AddPersonnelForm />
      </div>

      <form action={logout} className={styles.form}>
        <SubmitButton variant="outline" pendingLabel="Signing out…">
          Sign Out
        </SubmitButton>
      </form>
    </section>
  )
}
