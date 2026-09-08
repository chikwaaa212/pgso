import { Card } from "@/components/ui/card";
import { mockRequests } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

function tone(status: string) {
  if (status === "Pending") return "warn";
  if (status === "Approved") return "info";
  return "ok";
}

export default function PersonnelRequestsPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Requests</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Requests</h1>
          <p className={styles.subtitle}>
            Review employee transfer and supply requests.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Request queue</h2>
        <ul className={styles.list}>
          {mockRequests.map((r) => (
            <li key={r.id} className={styles.listItem}>
              <div>
                <p className={styles.listMain}>
                  {r.type} · {r.from}
                </p>
                <p className={styles.listSub}>
                  {r.id} · {r.date}
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
