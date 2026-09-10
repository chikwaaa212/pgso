"use client";

import type { ComponentType } from "react";
import {
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Package,
  Table,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { KIND_LABELS, type TemplateEntry } from "@/lib/templates";
import styles from "./templates-grid.module.css";

type IconComponent = ComponentType<{ size?: number | string }>;

const ICONS: Record<TemplateEntry["id"], IconComponent> = {
  "asset-import": Package,
  "catalog-import": Landmark,
  "air-blank": ClipboardList,
  "par-form": FileText,
  "ics-form": FileText,
  "sample-header": Table,
};

export function TemplatesGrid({ templates }: { templates: TemplateEntry[] }) {
  if (templates.length === 0) {
    return <p className={styles.empty}>No templates available.</p>;
  }
  return (
    <div className={styles.grid}>
      {templates.map((t) => {
        const Icon = ICONS[t.id] ?? FileSpreadsheet;
        return (
          <Card key={t.id} className={styles.card}>
            <div className={styles.top}>
              <span className={styles.icon} aria-hidden="true">
                <Icon size={22} />
              </span>
              <div className={styles.badges}>
                <span className={styles.badge} data-kind={t.kind}>
                  {KIND_LABELS[t.kind]}
                </span>
                <span className={styles.format}>{t.format}</span>
              </div>
            </div>
            <h2 className={styles.cardTitle}>{t.title}</h2>
            <p className={styles.cardDesc}>{t.description}</p>
            <p className={styles.usage}>{t.usage}</p>
            <p className={styles.fileName} title={t.fileName}>
              {t.fileName}
            </p>
            <a href={t.href} download className={styles.download}>
              <Download size={15} aria-hidden="true" />
              Download
            </a>
          </Card>
        );
      })}
    </div>
  );
}
