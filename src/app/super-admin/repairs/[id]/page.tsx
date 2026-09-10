import { notFound } from "next/navigation";
import { browseRepair } from "../../browse/actions";
import { AdminToolbar } from "@/components/super-admin/BrowseTable";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

export const runtime = "nodejs";

export const metadata = {
  title: "Repair Receipt (Oversight)",
};

export default async function SuperAdminRepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repair = await browseRepair(id);
  if (!repair) notFound();

  return (
    <div className={receiptStyles.page}>
      <AdminToolbar backHref="/super-admin/repairs" backLabel="Repairs" />
      <div className={receiptStyles.receiptStack}>
        <p className={receiptStyles.stackLabel}>OFFICIAL COPY — READ ONLY</p>
        <RepairReceipt repair={repair} />
      </div>
    </div>
  );
}
