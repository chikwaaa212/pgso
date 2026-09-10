import { notFound } from "next/navigation";
import { browseDelivery } from "../../browse/actions";
import {
  DeliveryReceipt,
  DeliveryReceiptToolbar,
} from "@/app/personnel/deliveries/[id]/delivery-receipt";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

export const runtime = "nodejs";

export const metadata = {
  title: "Delivery Receipt (Oversight)",
};

export default async function SuperAdminDeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await browseDelivery(id);
  if (!delivery) notFound();

  return (
    <div className={receiptStyles.page}>
      <div className={receiptStyles.receiptStack}>
        <p className={receiptStyles.stackLabel}>OFFICIAL COPY — READ ONLY</p>
        <DeliveryReceiptToolbar
          backHref="/super-admin/deliveries"
          backLabel="Back to deliveries"
        />
        <DeliveryReceipt delivery={delivery} />
      </div>
    </div>
  );
}
