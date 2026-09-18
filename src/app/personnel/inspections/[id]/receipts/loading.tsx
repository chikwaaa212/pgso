import styles from "../../components/receipt.module.css";
import {
  ReceiptPaperSkeleton,
  ReceiptToolbarSkeleton,
} from "../../components/receipt-skeleton";

/**
 * Mirrors the receipts history page (toolbar + stacked receipt papers).
 */
export default function InspectionReceiptsLoading() {
  return (
    <div
      className={styles.page}
      aria-busy="true"
      aria-label="Loading inspection history"
    >
      <ReceiptToolbarSkeleton buttons={[110, 110, 130]} />
      <div className={styles.receiptStack} aria-hidden="true">
        <p className={styles.stackLabel}>Latest Receipt</p>
        <ReceiptPaperSkeleton />
        <ReceiptPaperSkeleton itemRows={3} />
      </div>
    </div>
  );
}
