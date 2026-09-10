import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FOOTER_SLUGS, getFooterInfo } from "@/lib/footer-content";
import { InfoArticle } from "./article";
import styles from "./page.module.css";

export function generateStaticParams() {
  return FOOTER_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const content = getFooterInfo(slug);
  if (!content) return { title: "Not found" };
  return {
    title: content.title,
    description: content.description,
  };
}

export default async function FooterInfoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = getFooterInfo(slug);
  if (!content) notFound();

  return (
    <div className={styles.page}>
      <InfoArticle content={content} />
    </div>
  );
}
