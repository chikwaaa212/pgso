"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { FOOTER_INFO, type FooterInfoContent } from "@/lib/footer-content";
import styles from "./page.module.css";

function readingMinutes(content: FooterInfoContent): number {
  const words = [
    content.description,
    content.tip,
    ...content.steps.flatMap((s) => [s.title, s.text]),
    ...content.destinations.flatMap((d) => [d.label, d.hint]),
  ]
    .join(" ")
    .split(/\s+/).length;
  return Math.max(2, Math.round(words / 200));
}

function relatedGuides(content: FooterInfoContent) {
  const all = Object.values(FOOTER_INFO).filter((c) => c.slug !== content.slug);
  const sameSection = all.filter((c) => c.kicker === content.kicker);
  const others = all.filter((c) => c.kicker !== content.kicker);
  return [...sameSection, ...others].slice(0, 3);
}

export function InfoArticle({ content }: { content: FooterInfoContent }) {
  const related = relatedGuides(content);

  return (
    <article className={styles.container}>
      <div className={styles.masthead}>
        <span className={styles.mastheadBrand}>
          <BrandLogo size={24} />
          <span className={styles.docsSuffix}>Docs</span>
        </span>
        <Link href="/" className={styles.back}>
          <ArrowLeft className={styles.backIcon} aria-hidden="true" />
          pgso home
        </Link>
      </div>

      <header className={styles.header}>
        <p className={styles.kicker}>
          {content.kicker} · Guide
        </p>
        <h1 className={styles.title}>{content.title}</h1>
        <p className={styles.lede}>{content.description}</p>
        <p className={styles.meta}>
          {content.kicker} · {readingMinutes(content)} min read · PGSO
          documentation
        </p>
      </header>

      <nav className={styles.toc} aria-label="On this page">
        <p className={styles.tocTitle}>On this page</p>
        <ol>
          <li>
            <a href="#how-it-works">How it works in practice</a>
          </li>
          <li>
            <a href="#where-to-find">Where to find it in the system</a>
          </li>
          <li>
            <a href="#good-to-know">Good to know</a>
          </li>
          <li>
            <a href="#keep-reading">Keep reading</a>
          </li>
        </ol>
      </nav>

      <section id="how-it-works" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className={styles.h2}>
          How it works in practice
        </h2>
        {content.steps.map((step) => (
          <section key={step.title} className={styles.proseBlock}>
            <h3 className={styles.h3}>{step.title.replace(/^\d+\.\s*/, "")}</h3>
            <p className={styles.prose}>{step.text}</p>
          </section>
        ))}
      </section>

      <section id="where-to-find" aria-labelledby="where-to-find-heading">
        <h2 id="where-to-find-heading" className={styles.h2}>
          Where to find it in the system
        </h2>
        <p className={styles.prose}>
          These are the menu paths staff use day to day. Sign in with the
          matching role to open them — the names below mirror the sidebar
          exactly.
        </p>
        <dl className={styles.pathList}>
          {content.destinations.map((dest) => (
            <div key={dest.label} className={styles.pathRow}>
              <dt className={styles.pathTerm}>{dest.label}</dt>
              <dd className={styles.pathDef}>{dest.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <aside id="good-to-know" aria-labelledby="good-to-know-heading">
        <h2 id="good-to-know-heading" className={styles.h2}>
          Good to know
        </h2>
        <blockquote className={styles.pullQuote}>
          <p>{content.tip.replace(/^Tip:\s*/, "")}</p>
        </blockquote>
      </aside>

      <section id="keep-reading" aria-labelledby="keep-reading-heading">
        <h2 id="keep-reading-heading" className={styles.h2}>
          Keep reading
        </h2>
        <ul className={styles.relatedList}>
          {related.map((item) => (
            <li key={item.slug}>
              <Link href={`/info/${item.slug}`} className={styles.relatedLink}>
                <span className={styles.relatedKicker}>{item.kicker}</span>
                <span className={styles.relatedTitle}>{item.title}</span>
                <ArrowRight
                  className={styles.relatedIcon}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
