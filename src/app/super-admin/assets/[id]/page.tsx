import { notFound } from "next/navigation";
import { browseAsset, browseAssetHistory, browseCategories } from "../../browse/actions";
import { AssetDetailEditor } from "@/app/personnel/assets/[id]/AssetDetailEditor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Asset Detail",
};

export default async function SuperAdminAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [asset, categories, history] = await Promise.all([
    browseAsset(id),
    browseCategories(),
    browseAssetHistory(id),
  ]);
  // Like personnel's detail route, both asset- and stock-sourced rows render
  // the full unified editor.
  if (!asset) notFound();

  return (
    <AssetDetailEditor
      asset={asset}
      categories={categories}
      backHref="/super-admin/assets"
      crumbBase="Super Admin / Assets"
      history={history}
    />
  );
}
