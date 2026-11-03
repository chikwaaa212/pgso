import { RecommendationsWorkspace } from '@/components/recommendations/RecommendationsWorkspace'

export const metadata = {
  title: 'Recommendations | PGSO-PSMS',
}

/**
 * Personnel Recommendations workspace.
 *
 * Middleware enforces the personnel portal; the server action re-checks the
 * caller's role and the scoped readers apply the personnel ownership filters.
 */
export default function PersonnelRecommendationsPage() {
  return <RecommendationsWorkspace portal="personnel" />
}
