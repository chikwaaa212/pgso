import { notFound } from "next/navigation";
import { getAssetUnitDetail } from "@/lib/asset-unit-detail";
import { AssetUnitDetailView } from "@/components/personnel/AssetUnitDetailView";

export const dynamic = "force-dynamic";

export default async function AssetUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = await getAssetUnitDetail(id);
  if (!unit) notFound();
  return (
    <AssetUnitDetailView
      unit={unit}
      backHref="/personnel/assets"
      assetBase="/personnel/assets"
    />
  );
}
