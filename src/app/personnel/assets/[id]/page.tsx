import { notFound } from "next/navigation";
import { getUnifiedAsset, getAssetHistory, getCategories, type UnifiedAssetRow } from "../actions";
import { AssetDetailEditor } from "./AssetDetailEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssetDetailPage({ params }: Props) {
  const { id } = await params;
  const [asset, categories, history] = await Promise.all([
    getUnifiedAsset(id),
    getCategories(),
    getAssetHistory(id),
  ]);
  if (!asset) notFound();

  return <AssetDetailEditor asset={asset} categories={categories} history={history} />;
}
