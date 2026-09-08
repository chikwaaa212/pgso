import { Card } from "@/components/ui/card";
import { mockInventory } from "@/components/personnel/mock";
import styles from "../dashboard/page.module.css";

export default function PersonnelInventoryPage() {
  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Inventory</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Inventory</h1>
          <p className={styles.subtitle}>
            Monitor stock levels and thresholds.{" "}
            <span className={styles.badge}>Mockup — no live data</span>
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>Add stock (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Stock list</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Location</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {mockInventory.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.item}</td>
                  <td>{item.qty}</td>
                  <td>{item.location}</td>
                  <td>
                    {item.flag ? (
                      <span
                        className={styles.status}
                        data-tone={item.flag === "Critical" ? "bad" : "warn"}
                      >
                        {item.flag}
                      </span>
                    ) : (
                      <span className={styles.status} data-tone="ok">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
