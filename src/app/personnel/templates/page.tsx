import { TemplatesGrid } from "@/components/templates/TemplatesGrid";
import { templatesFor } from "@/lib/templates";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function PersonnelTemplatesPage() {
  const templates = templatesFor("personnel");

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Download Templates</p>
      <div>
        <h1 className={styles.title}>Download Templates</h1>
        <p className={styles.subtitle}>
          {templates.length} {templates.length === 1 ? "template" : "templates"} available —
          import files, blank forms, and reference sheets in one place.
        </p>
      </div>

      <TemplatesGrid templates={templates} />
    </section>
  );
}
