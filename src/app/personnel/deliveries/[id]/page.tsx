import { notFound } from "next/navigation";
import { getDeliveryDetails } from "../actions";
import { DeliveryReceipt, DeliveryReceiptToolbar } from "./delivery-receipt";
import receiptStyles from "@/app/personnel/inspections/components/receipt.module.css";

export const runtime = "nodejs";

export const metadata = {
  title: "Delivery Details",
};

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let delivery;
  try {
    delivery = await getDeliveryDetails(id);
  } catch {
    notFound();
  }

  if (!delivery) notFound();

  return (
    <div className={receiptStyles.page}>
      <div className={receiptStyles.receiptStack}>
        <p className={receiptStyles.stackLabel}>OFFICIAL COPY</p>
        <DeliveryReceiptToolbar />
        <DeliveryReceipt delivery={delivery} />
      </div>
    </div>
  );
}
