import type { Metadata } from "next";
import { getDeliveryForInspection, getInspectionHistory } from "../../actions";
import { InspectionReceipt } from "../../components/inspection-receipt";
import { ReceiptActions } from "../../components/receipt-actions";
import styles from "../../components/receipt.module.css";

export const metadata: Metadata = {
  title: "Inspection History — Receipts",
};

export default async function InspectionReceiptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await getDeliveryForInspection(id);
  const history = await getInspectionHistory(id);

  return (
    <div className={styles.page}>
      <ReceiptActions deliveryId={delivery.id} />

      {history.length === 0 ? (
        <div className={styles.empty}>
          No inspection records have been recorded for this delivery yet.
        </div>
      ) : (
        <div className={styles.receiptStack}>
          <p className={styles.stackLabel}>Latest Receipt</p>
          {history.map((record) => (
            <InspectionReceipt
              key={record.id}
              delivery={delivery}
              inspection={record}
            />
          ))}
        </div>
      )}
    </div>
  );
}