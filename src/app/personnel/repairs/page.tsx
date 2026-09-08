import { Card } from "@/components/ui/card";
import { mockRepairs } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

function tone(status: string) {
  if (status === "Pending") return "warn";
  if (status === "Completed") return "ok";
  return "info";
}

export default function PersonnelRepairsPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Repairs</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Repairs</h1>
          <p className={styles.subtitle}>
            Track reported repairs and technicians.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Repair tickets</h2>
        <ul className={styles.list}>
          {mockRepairs.map((r) => (
            <li key={r.id} className={styles.listItem}>
              <div>
                <p className={styles.listMain}>
                  {r.asset} · {r.issue}
                </p>
                <p className={styles.listSub}>
                  {r.id} · {r.tech}
                </p>
              </div>
              <span className={styles.status} data-tone={tone(r.status)}>
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
