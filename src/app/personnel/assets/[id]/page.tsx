import { notFound } from "next/navigation";
import { getUnifiedAsset, getCategories, type UnifiedAssetRow } from "../actions";
import { AssetDetailEditor } from "./AssetDetailEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssetDetailPage({ params }: Props) {
  const { id } = await params;
  const [asset, categories] = await Promise.all([
    getUnifiedAsset(id),
    getCategories(),
  ]);
  if (!asset) notFound();

  return <AssetDetailEditor asset={asset} categories={categories} />;
}
