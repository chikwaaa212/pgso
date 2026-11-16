import type { ComponentType, ReactNode } from "react";
import styles from "@/app/personnel/ppmp/workspace.module.css";

type PanelTone = "neutral" | "info" | "ok" | "warn";

/**
 * Numbered workspace panel: a kicker ("Step 01"), icon, title, helper text,
 * optional header actions, a body, and an optional footer rail. Shared by the
 * PPMP analytics and planning screens.
 */
export function PpmpPanel({
  step,
  kicker,
  icon: Icon,
  title,
  text,
  tone = "neutral",
  actions,
  footer,
  bodyTight,
  children,
}: {
  step?: number;
  kicker?: string;
  icon?: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: ReactNode;
  text?: ReactNode;
  tone?: PanelTone;
  actions?: ReactNode;
  footer?: ReactNode;
  bodyTight?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} data-tone={tone}>
      <header className={styles.panelHead}>
        <div className={styles.panelHeadMain}>
          {Icon ? (
            <span className={styles.panelIcon} aria-hidden="true">
              <Icon size={16} />
            </span>
          ) : null}
          <div>
            {kicker || step ? (
              <span className={styles.panelKicker}>
                {step ? `Step ${String(step).padStart(2, "0")}` : kicker}
                {step && kicker ? ` · ${kicker}` : ""}
              </span>
            ) : null}
            <h2 className={styles.panelTitle}>{title}</h2>
            {text ? <p className={styles.panelText}>{text}</p> : null}
          </div>
        </div>
        {actions ? <div className={styles.panelActions}>{actions}</div> : null}
      </header>
      <div className={bodyTight ? styles.panelBodyTight : styles.panelBody}>
        {children}
      </div>
      {footer ? <footer className={styles.panelFoot}>{footer}</footer> : null}
    </section>
  );
}
