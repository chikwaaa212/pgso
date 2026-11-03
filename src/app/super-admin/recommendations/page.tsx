import { RecommendationsWorkspace } from '@/components/recommendations/RecommendationsWorkspace'

export const metadata = {
  title: 'Recommendations | PGSO-PSMS',
}

/**
 * Super Admin Recommendations workspace — same component as personnel, but
 * the scoped readers return system-wide rows because the caller's scope
 * helper reports `isSuperAdmin`.
 */
export default function SuperAdminRecommendationsPage() {
  return <RecommendationsWorkspace portal="super-admin" />
}
