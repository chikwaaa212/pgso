import { redirect } from "next/navigation";

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/personnel/assets/${id}`);
}
