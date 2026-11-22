import { getDeliveryForInspection } from "@/app/personnel/inspections/actions";
import { InspectionForm } from "@/app/personnel/inspections/[id]/inspection-form";
import InspectionReceiptPage from "@/app/personnel/inspections/[id]/receipt/page";
import { getCurrentUserId } from "@/lib/personnel-scope";

/**
 * Super Admin inspection detail.
 *
 * Admins may log deliveries and then inspect (process) those same records, so
 * a delivery they logged renders the editable inspection form. Every other
 * delivery stays on the read-only receipt — oversight without mutating
 * personnel work.
 */
export default async function SuperAdminInspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, userId] = await Promise.all([params, getCurrentUserId()]);
  const delivery = await getDeliveryForInspection(id);

  if (delivery.received_by === userId) {
    const { tab } = await searchParams;
    if (tab === "history") {
      const { InspectionHistory } = await import(
        "@/app/personnel/inspections/[id]/inspection-history"
      );
      return <InspectionHistory delivery={delivery} />;
    }
    return <InspectionForm delivery={delivery} />;
  }

  return <InspectionReceiptPage params={params} />;
}
