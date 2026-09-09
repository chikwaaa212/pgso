import type { Metadata } from "next";
import { getDeliveryForInspection } from "../../actions";
import { InspectionReceipt } from "../../components/inspection-receipt";
import { ReceiptActions } from "../../components/receipt-actions";
import styles from "../../components/receipt.module.css";
import { IarDialog } from "@/components/personnel/IarDialog";

export const metadata: Metadata = {
  title: "Inspection Receipt",
};

export default async function InspectionReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await getDeliveryForInspection(id);
  const inspection = delivery.inspection_data;
  const ref = delivery.id.slice(0, 8).toUpperCase();
  const hasAir = !!(inspection?.iar_no || inspection?.iar_image_url);

  return (
    <div className={styles.page}>
      <ReceiptActions
        deliveryId={delivery.id}
        viewIarHref={
          hasAir ? `/personnel/inspections/${delivery.id}/iar` : undefined
        }
      >
        {inspection && !inspection.iar_no ? (
          <IarDialog
            deliveryId={delivery.id}
            deliveryRef={ref}
            hasSavedInspection
          />
        ) : null}
      </ReceiptActions>
      <InspectionReceipt delivery={delivery} inspection={inspection} />
    </div>
  );
}