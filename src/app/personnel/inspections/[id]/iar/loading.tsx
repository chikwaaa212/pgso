import styles from "../../components/receipt.module.css";
import { ReceiptToolbarSkeleton } from "../../components/receipt-skeleton";
import { IarSheetSkeleton } from "./iar-sheet-skeleton";

/**
 * Mirrors the Appendix 62 IAR sheet + history list so the AIR fetch
 * shows the exact document shape instead of the inspections list.
 */
export default function IarReportLoading() {
  return (
    <div
      className={styles.page}
      aria-busy="true"
      aria-label="Loading acceptance report"
    >
      <ReceiptToolbarSkeleton buttons={[110, 110, 130, 120]} />
      <IarSheetSkeleton />
    </div>
  );
}
