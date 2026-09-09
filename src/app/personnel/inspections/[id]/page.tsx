import { getDeliveryForInspection } from '../actions'
import { InspectionForm } from './inspection-form'
import { InspectionHistory } from './inspection-history'

export default async function InspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const delivery = await getDeliveryForInspection(id)

  if (tab === 'history') {
    return <InspectionHistory delivery={delivery} />
  }

  return <InspectionForm delivery={delivery} />
}
