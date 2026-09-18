import styles from "../../components/receipt.module.css";
import {
  ReceiptPaperSkeleton,
  ReceiptToolbarSkeleton,
} from "../../components/receipt-skeleton";

/**
 * Mirrors the inspection receipt page (toolbar + single receipt paper)
 * so navigating from the list no longer flashes the list skeleton.
 */
export default function InspectionReceiptLoading() {
  return (
    <div
      className={styles.page}
      aria-busy="true"
      aria-label="Loading inspection receipt"
    >
      <ReceiptToolbarSkeleton buttons={[110, 110, 130, 90]} />
      <ReceiptPaperSkeleton />
    </div>
  );
}
