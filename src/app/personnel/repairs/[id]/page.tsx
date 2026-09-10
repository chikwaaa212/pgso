import { notFound } from "next/navigation";
import { getRepair } from "../actions";
import { RepairReceipt, RepairReceiptToolbar } from "../repair-receipt";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

export const runtime = "nodejs";

export const metadata = {
  title: "Repair Receipt",
};

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repair = await getRepair(id);

  if (!repair) notFound();

  return (
    <div className={receiptStyles.page}>
      <div className={receiptStyles.receiptStack}>
        <p className={receiptStyles.stackLabel}>OFFICIAL COPY</p>
        <RepairReceiptToolbar />
        <RepairReceipt repair={repair} />
      </div>
    </div>
  );
}
