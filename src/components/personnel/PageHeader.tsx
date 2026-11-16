import type { ReactNode } from "react";
import ui from "./personnel-ui.module.css";

/**
 * Shared Personnel page header.
 *
 * One consistent rhythm across every list screen: a small uppercase eyebrow
 * with a yellow marker, the page title, an optional plain-language subtitle,
 * an optional live meta line, and right-aligned actions.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  badge,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className={ui.header}>
      <div className={ui.headerText}>
        {eyebrow ? (
          <span className={ui.eyebrow}>
            <span className={ui.eyebrowDot} aria-hidden="true" />
            {eyebrow}
          </span>
        ) : null}
        <div className={ui.titleRow}>
          <h1 className={ui.title}>{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className={ui.subtitle}>{subtitle}</p> : null}
        {meta ? <p className={ui.meta}>{meta}</p> : null}
      </div>
      {actions ? <div className={ui.headerActions}>{actions}</div> : null}
    </header>
  );
}
