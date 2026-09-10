import { notFound } from "next/navigation";
import { browseStock } from "../../../browse/actions";
import { StockDetailEditor } from "@/app/personnel/assets/stock/[id]/StockDetailEditor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stock Detail",
};

export default async function SuperAdminStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stock = await browseStock(id);
  if (!stock) notFound();

  return (
    <StockDetailEditor
      stock={stock}
      backHref="/super-admin/assets"
      crumbBase="Super Admin / Assets / Stocks"
    />
  );
}
