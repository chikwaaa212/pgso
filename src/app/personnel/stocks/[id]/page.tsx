import { notFound } from "next/navigation";
import {
  getAssetHistory,
  getCategories,
  getUnifiedAsset,
} from "@/app/personnel/assets/actions";
import { AssetDetailEditor } from "@/app/personnel/assets/[id]/AssetDetailEditor";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Stock detail — same record view the Assets registry opens, with the back
 * link and breadcrumb scoped to Stocks. Both an inventory lot and an asset
 * id resolve here (getUnifiedAsset checks the assets table first).
 */
export default async function StockDetailPage({ params }: Props) {
  const { id } = await params;
  const [item, categories, history] = await Promise.all([
    getUnifiedAsset(id),
    getCategories(),
    getAssetHistory(id),
  ]);
  if (!item) notFound();

  return (
    <AssetDetailEditor
      asset={item}
      categories={categories}
      history={history}
      backHref="/personnel/stocks"
      crumbBase="Stocks"
      noun="stock"
    />
  );
}
