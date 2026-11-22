import { TemplatesGrid } from "@/components/templates/TemplatesGrid";
import { PageHeader } from "@/components/personnel/PageHeader";
import { templatesFor } from "@/lib/templates";
import styles from "./page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";

export const dynamic = "force-dynamic";

export default function SuperAdminTemplatesPage() {
  const templates = templatesFor("super_admin");

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Reference library"
        title="Download templates"
        subtitle={`${templates.length} ${
          templates.length === 1 ? "template" : "templates"
        } available — import files, blank forms, and reference sheets in one place.`}
        meta="Use the official CSV layout before bulk import to avoid validation errors."
        actions={
          <a
            href="/super-admin/reports"
            className={ui.ghostButton}
            aria-label="Open reports"
          >
            Open reports
          </a>
        }
      />

      <TemplatesGrid templates={templates} />
    </section>
  );
}
